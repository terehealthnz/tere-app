// scripts/seed-gp-directory.mjs
//
// Emit an idempotent SQL upsert for the GP directory (gp_practices +
// gp_providers). Reads structured PHO rosters from scripts/data/, keyed by
// region. Currently ships the NMDHB Marlborough list; extend the ROSTERS
// array to add more regions.
//
// The generated SQL uses INSERT ... ON CONFLICT DO UPDATE, so re-running
// after the PHO refreshes their list will patch names/emails/phones in
// place and add new providers without touching unrelated data.
//
// Usage:
//   node scripts/seed-gp-directory.mjs > /tmp/seed-gp-directory.sql
//   # review /tmp/seed-gp-directory.sql, then paste into Supabase SQL editor
//
// Assumes 2026-09-16_gp_directory.sql migration has been applied.

import fs from 'node:fs'
import path from 'node:path'

const ROSTERS = [
  path.resolve('scripts/data/gp-directory-marlborough.json'),
]

function esc(v) {
  if (v === null || v === undefined || v === '') return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

function fmtPractice(region, source, p) {
  // Deterministic id (UUID v5 would be ideal but keeps deps zero — instead
  // we let Postgres synthesise the id and match on (name, region) for the
  // ON CONFLICT clause, which the UNIQUE constraint enforces).
  return `  (${esc(p.name)}, ${esc(p.address)}, ${esc(p.phone)}, ${esc(p.email)}, ${esc(region)}, ${esc(source)})`
}

function fmtProvider(practiceKey, pr) {
  return `  (${practiceKey}, ${esc(pr.title || 'Dr')}, ${esc(pr.given_name)}, ${esc(pr.family_name)})`
}

const practiceRows = []
const providerRows = []

for (const rosterPath of ROSTERS) {
  const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf-8'))
  const { region, source, practices } = roster
  for (const p of practices) {
    practiceRows.push(fmtPractice(region, source, p))
    // Provider rows reference the practice by (name, region) via a subquery
    // so we don't need to know the generated id upfront.
    const practiceKey = `(SELECT id FROM gp_practices WHERE name = ${esc(p.name)} AND region = ${esc(region)})`
    for (const pr of p.providers) providerRows.push(fmtProvider(practiceKey, pr))
  }
}

console.log(`-- GP directory seed (idempotent).`)
console.log(`-- Sources: ${ROSTERS.map(p => path.basename(p)).join(', ')}`)
console.log(`-- Practices: ${practiceRows.length}  Providers: ${providerRows.length}`)
console.log(`-- Safe to re-run — updates name/email/phone in place.`)
console.log(``)
console.log(`-- Upsert practices. UNIQUE (name, region) enforces dedup.`)
console.log(`INSERT INTO gp_practices (name, address, phone, email, region, source) VALUES`)
console.log(practiceRows.join(',\n'))
console.log(`ON CONFLICT (name, region) DO UPDATE SET`)
console.log(`  address    = EXCLUDED.address,`)
console.log(`  phone      = EXCLUDED.phone,`)
console.log(`  email      = EXCLUDED.email,`)
console.log(`  source     = EXCLUDED.source,`)
console.log(`  active     = true,`)
console.log(`  updated_at = now();`)
console.log(``)
console.log(`INSERT INTO gp_providers (practice_id, title, given_name, family_name) VALUES`)
console.log(providerRows.join(',\n'))
console.log(`ON CONFLICT (practice_id, given_name, family_name) DO UPDATE SET`)
console.log(`  title      = EXCLUDED.title,`)
console.log(`  active     = true,`)
console.log(`  updated_at = now();`)
