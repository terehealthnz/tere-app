// scripts/backfill-hl7-pdfs.mjs
//
// One-shot: for every inbound_hl7_messages row where has_pdf=true but no
// row exists in inbound_hl7_attachments, extract the PDF base64 from the
// raw_message, upload to Supabase Storage (bucket: hl7-attachments), and
// insert the attachment row.
//
// Needed because the CA/AA ack code change on 2026-08-18 broke the PDF
// extraction gate in api/_hl7-inbound.js — messages received between then
// and the fix on 2026-08-19 silently skipped attachment extraction. Fixed
// forward in the handler; this backfills the gap.
//
// Idempotent — skips messages that already have any attachment.
//
// Usage:  node scripts/backfill-hl7-pdfs.mjs

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SR  = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'hl7-attachments'

if (!SUPABASE_URL || !SUPABASE_SR) {
  console.error('[backfill] Missing env — source .env.vercel first.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SR, { auth: { persistSession: false } })

// Extract all PDF observations from raw HL7. Same logic as
// api/_hl7-inbound.js extractAndStorePdfs — read here so we don't need to
// import server code into a Node script.
function extractPdfObxes(raw) {
  const results = []
  if (!raw) return results
  const segments = String(raw).replace(/\r/g, '\n').split('\n').filter(s => s.startsWith('OBX|'))
  for (const s of segments) {
    const f = s.split('|')
    if (f[2] !== 'ED') continue
    const idx = Number(f[1]) || 0
    const parts = (f[5] || '').split('^')
    const format = (parts[2] || '').toUpperCase()
    const encoding = (parts[3] || '').toUpperCase()
    const data = parts[4] || ''
    if (format !== 'PDF' || encoding !== 'BASE64' || !data) continue
    let bytes
    try { bytes = Buffer.from(data, 'base64') } catch { continue }
    if (!bytes.length) continue
    results.push({ idx, bytes })
  }
  return results
}

async function main() {
  console.log('[backfill] scanning inbound_hl7_messages for missing PDF attachments…')
  const { data: candidates, error } = await supabase
    .from('inbound_hl7_messages')
    .select('id, raw_message, has_pdf, msh_9_message_type, msh_12_version, received_at')
    .eq('has_pdf', true)
    .order('received_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`fetch failed: ${error.message}`)

  console.log(`[backfill] ${candidates.length} messages flagged has_pdf`)

  let backfilled = 0
  let alreadyHad = 0
  let skipped = 0
  for (const msg of candidates) {
    const { count: existing } = await supabase
      .from('inbound_hl7_attachments')
      .select('*', { count: 'exact', head: true })
      .eq('message_id', msg.id)
    if (existing && existing > 0) { alreadyHad++; continue }

    const pdfs = extractPdfObxes(msg.raw_message)
    if (!pdfs.length) {
      console.log(`[backfill] ${msg.id} (${msg.msh_9_message_type} v${msg.msh_12_version}) — has_pdf=true but no PDF ED OBX found, skipping`)
      skipped++
      continue
    }

    for (const p of pdfs) {
      const filename = `${msg.id}_obx${p.idx}.pdf`
      const path = `${msg.id}/${filename}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, p.bytes, { contentType: 'application/pdf', upsert: true })
      if (upErr) { console.error(`[backfill] upload ${path} failed: ${upErr.message}`); continue }

      const { error: insErr } = await supabase
        .from('inbound_hl7_attachments')
        .insert({
          message_id: msg.id,
          obx_index: p.idx,
          content_type: 'application/pdf',
          storage_path: path,
          filename,
          size_bytes: p.bytes.length,
        })
      if (insErr) { console.error(`[backfill] row insert failed: ${insErr.message}`); continue }
      console.log(`[backfill] ✔ ${msg.id} OBX-${p.idx}: uploaded ${p.bytes.length} bytes → ${path}`)
      backfilled++
    }
  }
  console.log(`[backfill] done — backfilled: ${backfilled}, already had: ${alreadyHad}, skipped: ${skipped}`)
}

main().catch(e => { console.error(e); process.exit(1) })
