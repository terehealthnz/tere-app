// scripts/restore-vitals-validate.mjs
//
// One-shot recovery script for the accidental delete on 2026-08-15 01:35 UTC.
// Reads validation_subjects, validation_readings, and spo2_calibrations from
// a Supabase PITR restore-to-new-project (the "source"), and copies them back
// into the prod database (the "destination").
//
// Prerequisites:
//   1. In Supabase dashboard, Restore-to-new-project has completed with
//      timestamp 2026-08-15 01:33 UTC (2 minutes before the delete).
//   2. Both SOURCE and DEST envs are set (see below).
//
// Usage:
//   RESTORE_SUPABASE_URL="https://<sibling>.supabase.co" \
//   RESTORE_SERVICE_ROLE_KEY="<sibling service role>" \
//   node scripts/restore-vitals-validate.mjs
//
// The DEST (prod) URL + service role come from the existing .env.

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SRC_URL = process.env.RESTORE_SUPABASE_URL
const SRC_KEY = process.env.RESTORE_SERVICE_ROLE_KEY
const DST_URL = process.env.VITE_SUPABASE_URL
const DST_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SRC_URL || !SRC_KEY) {
  console.error('Missing RESTORE_SUPABASE_URL / RESTORE_SERVICE_ROLE_KEY env')
  process.exit(1)
}
if (!DST_URL || !DST_KEY) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (from .env)')
  process.exit(1)
}
if (SRC_URL === DST_URL) {
  console.error('SOURCE and DEST URLs are the same — refusing to run')
  process.exit(1)
}

const src = createClient(SRC_URL, SRC_KEY, { auth: { persistSession: false } })
const dst = createClient(DST_URL, DST_KEY, { auth: { persistSession: false } })

// FK-safe order: parent tables first.
const TABLES = ['validation_subjects', 'validation_readings', 'spo2_calibrations']

async function copyTable(t) {
  // Pull everything from the restore snapshot.
  const { data: rows, error: readErr, count } = await src
    .from(t)
    .select('*', { count: 'exact' })
  if (readErr) {
    console.error(`  ${t.padEnd(24)} READ FAILED: ${readErr.message}`)
    return
  }
  if (!rows?.length) {
    console.log(`  ${t.padEnd(24)} source is empty (${count ?? 0}) — nothing to restore`)
    return
  }

  // Upsert on id — running the script twice is a no-op after the first
  // successful pass. Chunk to 500 to stay under PostgREST's row limit.
  const CHUNK = 500
  let restored = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK)
    const { error: writeErr } = await dst.from(t).upsert(batch, { onConflict: 'id' })
    if (writeErr) {
      console.error(`  ${t.padEnd(24)} WRITE FAILED at row ${i}: ${writeErr.message}`)
      return
    }
    restored += batch.length
  }

  // Verify.
  const { count: after } = await dst.from(t).select('*', { count: 'exact', head: true })
  console.log(`  ${t.padEnd(24)} source ${rows.length} → dest now ${after}  (wrote ${restored})`)
}

async function main() {
  console.log('Restoring VitalsValidate data')
  console.log('  SOURCE:', SRC_URL)
  console.log('  DEST:  ', DST_URL)
  console.log()
  for (const t of TABLES) await copyTable(t)
  console.log()
  console.log('Done. Verify counts in the Supabase table editor before deleting the sibling project.')
}

main().catch(err => { console.error('FAILED:', err); process.exit(1) })
