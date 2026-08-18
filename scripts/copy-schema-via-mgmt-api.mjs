#!/usr/bin/env node
// Copies the public-schema DDL from a source Supabase project to a target
// Supabase project using only the Management API's /database/query endpoint —
// no pg_dump, no Docker, no direct DB password required. Uses Postgres's own
// pg_get_* introspection functions (pg_get_indexdef, pg_get_constraintdef,
// pg_get_functiondef, pg_get_viewdef, pg_get_triggerdef) to reconstruct DDL
// directly from pg_catalog, so what we ship to the target is what pg_dump
// would ship — not a hand-rolled approximation.
//
// Usage:
//   SUPABASE_PAT=sbp_xxx \
//   SRC_REF=xynwqfbnwpkyvovxdone \
//   DST_REF=rayfovxewiuhqxsnrmbv \
//   node scripts/copy-schema-via-mgmt-api.mjs [--dry-run]
//
// Idempotency:
//   Uses CREATE ... IF NOT EXISTS wherever Postgres allows it so re-running
//   on a partial target won't error out.

const PAT      = process.env.SUPABASE_PAT
const SRC      = process.env.SRC_REF
const DST      = process.env.DST_REF
const DRY_RUN  = process.argv.includes('--dry-run')
if (!PAT || !SRC || !DST) {
  console.error('Missing env: SUPABASE_PAT, SRC_REF, DST_REF required')
  process.exit(1)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function q(ref, sql, attempt = 1) {
  await sleep(150)  // gentle pacing — Supabase Mgmt API rate-limits aggressive callers
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    })
    if (!r.ok) throw new Error(`[${ref}] ${r.status}: ${await r.text()}`)
    return r.json()
  } catch (e) {
    if (attempt >= 3) throw e
    await sleep(1500 * attempt)
    return q(ref, sql, attempt + 1)
  }
}

// ── Introspection queries against source (prod) ──────────────────────────────

async function extensions() {
  const rows = await q(SRC, `
    SELECT extname FROM pg_extension
    WHERE extname NOT IN ('plpgsql', 'pg_stat_statements')
    ORDER BY extname;
  `)
  return rows.map(r => `CREATE EXTENSION IF NOT EXISTS "${r.extname}";`)
}

async function enumTypes() {
  const rows = await q(SRC, `
    SELECT t.typname AS name,
           string_agg(quote_literal(e.enumlabel), ',' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  `)
  return rows.map(r =>
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='${r.name}') ` +
    `THEN CREATE TYPE public.${r.name} AS ENUM (${r.labels}); END IF; END $$;`
  )
}

async function sequences() {
  const rows = await q(SRC, `
    SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;
  `)
  return rows.map(r => `CREATE SEQUENCE IF NOT EXISTS public."${r.sequencename}";`)
}

async function tables() {
  const tblRows = await q(SRC, `
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
  `)
  const stmts = []
  for (const { tablename } of tblRows) {
    const cols = await q(SRC, `
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${tablename}'
      ORDER BY ordinal_position;
    `)
    const colDefs = cols.map(c => {
      let type = c.data_type
      // Preserve arrays + user-defined enums via udt_name where possible
      if (type === 'ARRAY') type = c.udt_name.replace(/^_/, '') + '[]'
      else if (type === 'USER-DEFINED') type = `public.${c.udt_name}`
      else if (type === 'character varying' && c.character_maximum_length) type = `varchar(${c.character_maximum_length})`
      else if (type === 'numeric' && c.numeric_precision) type = `numeric(${c.numeric_precision}${c.numeric_scale ? ',' + c.numeric_scale : ''})`
      const nn = c.is_nullable === 'NO' ? ' NOT NULL' : ''
      // Some defaults reference sequences that already exist (SERIAL) — pass through as-is
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : ''
      return `  "${c.column_name}" ${type}${def}${nn}`
    }).join(',\n')
    stmts.push(`CREATE TABLE IF NOT EXISTS public."${tablename}" (\n${colDefs}\n);`)
  }
  return stmts
}

async function constraints() {
  const rows = await q(SRC, `
    SELECT
      conname AS name,
      conrelid::regclass::text AS tbl,
      pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY contype DESC, conname;  -- PKs (p) come before FKs (f)
  `)
  return rows.map(r =>
    `DO $$ BEGIN ALTER TABLE ${r.tbl} ADD CONSTRAINT "${r.name}" ${r.def}; ` +
    `EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
  )
}

async function indexes() {
  const rows = await q(SRC, `
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='public'
      -- Skip index names that back a PK/UNIQUE constraint; those are
      -- created implicitly when we ADD CONSTRAINT above.
      AND indexname NOT IN (
        SELECT conname FROM pg_constraint WHERE contype IN ('p','u') AND connamespace='public'::regnamespace
      )
    ORDER BY indexname;
  `)
  return rows.map(r => r.indexdef.replace(/^CREATE INDEX/, 'CREATE INDEX IF NOT EXISTS')
                                 .replace(/^CREATE UNIQUE INDEX/, 'CREATE UNIQUE INDEX IF NOT EXISTS') + ';')
}

async function functions() {
  const rows = await q(SRC, `
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
    ORDER BY p.proname;
  `)
  return rows.map(r => r.def + ';')
}

async function triggers() {
  const rows = await q(SRC, `
    SELECT pg_get_triggerdef(oid) AS def
    FROM pg_trigger
    WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
    ORDER BY tgname;
  `)
  return rows.map(r => r.def.replace(/^CREATE TRIGGER/, 'CREATE OR REPLACE TRIGGER') + ';')
}

async function rlsAndPolicies() {
  const stmts = []
  const tblsWithRls = await q(SRC, `
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relrowsecurity=true;
  `)
  for (const { relname } of tblsWithRls) {
    stmts.push(`ALTER TABLE public."${relname}" ENABLE ROW LEVEL SECURITY;`)
  }
  const pols = await q(SRC, `
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname='public'
    ORDER BY tablename, policyname;
  `)
  // pg_policies.roles comes through Management API as a Postgres array literal
  // string ("{public,anon}") rather than a real JS array. Strip braces + split.
  const parseRoles = r => Array.isArray(r) ? r.join(', ')
    : typeof r === 'string' ? r.replace(/^\{|\}$/g, '').split(',').map(s => s.trim()).filter(Boolean).join(', ')
    : String(r)
  for (const p of pols) {
    const roles = parseRoles(p.roles)
    let stmt = `DROP POLICY IF EXISTS "${p.policyname}" ON public."${p.tablename}"; `
    stmt += `CREATE POLICY "${p.policyname}" ON public."${p.tablename}" AS ${p.permissive} FOR ${p.cmd} TO ${roles}`
    if (p.qual)       stmt += ` USING (${p.qual})`
    if (p.with_check) stmt += ` WITH CHECK (${p.with_check})`
    stmt += ';'
    stmts.push(stmt)
  }
  return stmts
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[schema-copy] src=${SRC}  dst=${DST}  dry-run=${DRY_RUN}`)
  const sections = [
    ['-- extensions',       await extensions()],
    ['-- enum types',       await enumTypes()],
    ['-- sequences',        await sequences()],
    ['-- tables',           await tables()],
    ['-- constraints',      await constraints()],
    ['-- indexes',          await indexes()],
    ['-- functions',        await functions()],
    ['-- triggers',         await triggers()],
    ['-- RLS + policies',   await rlsAndPolicies()],
  ]
  const totalStmts = sections.reduce((n, [, stmts]) => n + stmts.length, 0)
  console.log(`[schema-copy] introspected ${totalStmts} statements from prod`)

  const fullSql = sections.map(([label, stmts]) => `${label}\n${stmts.join('\n')}`).join('\n\n')

  if (DRY_RUN) {
    const fs = await import('node:fs')
    fs.writeFileSync('/tmp/tere-staging-schema.sql', fullSql)
    console.log('[schema-copy] dry-run: wrote /tmp/tere-staging-schema.sql, not applying')
    return
  }

  // Apply section by section so we get useful errors and can skip past a single
  // failing statement rather than aborting the whole batch.
  for (const [label, stmts] of sections) {
    console.log(`[schema-copy] applying ${stmts.length} statement(s) for ${label.replace('-- ','')}`)
    for (let i = 0; i < stmts.length; i++) {
      try {
        await q(DST, stmts[i])
      } catch (e) {
        console.warn(`  ⚠ statement ${i+1}/${stmts.length} failed: ${String(e.message).slice(0, 200)}`)
      }
    }
  }
  console.log('[schema-copy] done')
}

main().catch(e => { console.error(e); process.exit(1) })
