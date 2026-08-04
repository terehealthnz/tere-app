// scripts/seed-cw-pharmacy-contacts.mjs
//
// One-shot: match the Chemist Warehouse CSV (canonical store list + dispensary
// emails from Liam @ CW E-Commerce) against the Medsafe register in
// public/pharmacies.json, then emit a Supabase upsert into pharmacy_contacts
// keyed by the register's pharmacy_id.
//
// Why match rather than hand-key: pharmacy_contacts is joined at
// prescription-send time by the pharmacy_id that the picker saved on the
// consultation (register id, e.g. "chemist-warehouse-albany-waitemat"). If we
// invent our own ids the join fails and the script still sends to the fax
// fallback.
//
// Usage:
//   node scripts/seed-cw-pharmacy-contacts.mjs > /tmp/seed-cw.sql
//   # review /tmp/seed-cw.sql, then paste into Supabase SQL editor

import fs from 'node:fs'
import path from 'node:path'

const CSV = '/Users/patrickherling/Downloads/cw-nz-stores (1).csv'
const REG = path.resolve('public/pharmacies.json')

const register = JSON.parse(fs.readFileSync(REG, 'utf-8'))
const csv = fs.readFileSync(CSV, 'utf-8').trim().split(/\r?\n/).slice(1)

// Register — only Chemist Warehouse rows. Match on a normalised premises_name.
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
const cwRegister = register
  .filter(p => norm(p.premises_name).startsWith('chemist warehouse'))
  .map(p => ({
    id: p.id,
    premises_name: p.premises_name,
    town: p.town,
    key: norm(p.premises_name),
  }))

const rows = []
const unmatched = []

for (const line of csv) {
  const [rawStore, email] = line.split(',').map(s => s.trim())
  if (!rawStore || !email) continue
  const key = norm(rawStore)
  // Exact key match first, then startsWith / substring fallbacks.
  let hit = cwRegister.find(r => r.key === key)
  if (!hit) hit = cwRegister.find(r => r.key.startsWith(key + ' ') || key.startsWith(r.key + ' '))
  if (!hit) hit = cwRegister.find(r => r.key.includes(key) || key.includes(r.key))
  if (!hit) { unmatched.push({ rawStore, email }); continue }
  rows.push({ id: hit.id, name: hit.premises_name, email })
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

const now = new Date().toISOString()

console.log(`-- Chemist Warehouse NZ store dispensary emails`)
console.log(`-- Source: cw-nz-stores CSV supplied by Liam (CW NZ E-Commerce & IT), 2026-08-04`)
console.log(`-- Matches: ${rows.length}  Unmatched: ${unmatched.length}`)
console.log(`-- Idempotent — safe to re-run.`)
console.log(``)
console.log(`INSERT INTO pharmacy_contacts (pharmacy_id, premises_name, dispensary_email, verified_at, updated_at) VALUES`)
console.log(rows.map(r =>
  `  (${esc(r.id)}, ${esc(r.name)}, ${esc(r.email)}, ${esc(now)}, ${esc(now)})`
).join(',\n'))
console.log(`ON CONFLICT (pharmacy_id) DO UPDATE SET`)
console.log(`  premises_name    = EXCLUDED.premises_name,`)
console.log(`  dispensary_email = EXCLUDED.dispensary_email,`)
console.log(`  verified_at      = EXCLUDED.verified_at,`)
console.log(`  updated_at       = EXCLUDED.updated_at;`)
console.log(``)
if (unmatched.length) {
  console.log(`-- Unmatched rows (need manual review — either not in register or naming differs):`)
  for (const u of unmatched) console.log(`--   ${u.rawStore}  →  ${u.email}`)
}
