// /api/team-messages — provider/admin internal chat (v1: single shared channel).
//
// GET  /api/team-messages                      → recent 200 messages + unread_count
// POST /api/team-messages                      → post a message (parses @mentions server-side)
// POST /api/team-messages?action=mark-read     → set last_read_at = now for caller
// PATCH /api/team-messages?id=<uuid>           → edit own message body (author only)
// DELETE /api/team-messages?id=<uuid>          → soft-delete own message (author only, admin can delete any)
//
// All routes are provider-authed via guardProvider.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Parse @firstname / @firstname-lastname tokens against the active-providers
// list; return an array of matched provider IDs. Case-insensitive; longest
// match wins so "@rachel-thomas" beats "@rachel" for the same author.
async function resolveMentions(supabase, body) {
  const tokens = [...String(body || '').matchAll(/@([a-z][a-z0-9._-]*)/gi)].map(m => m[1].toLowerCase())
  if (!tokens.length) return []
  const { data: provs, error } = await supabase
    .from('providers')
    .select('id, first_name, last_name')
    .eq('is_active', true)
  if (error || !provs) return []
  const hits = new Set()
  for (const t of tokens) {
    // Try firstname.lastname / firstname-lastname / firstnamelastname / firstname
    const norm = t.replace(/[._-]/g, '')
    for (const p of provs) {
      const first = String(p.first_name || '').toLowerCase()
      const last  = String(p.last_name  || '').toLowerCase()
      const full  = `${first}${last}`
      if (norm === first || norm === full || norm === `${first}${last[0] || ''}`) {
        hits.add(p.id); break
      }
    }
  }
  return Array.from(hits)
}

function roleSnapshot(p) {
  if (!p) return null
  if (p.is_admin) return 'admin'
  if (p.is_billing_admin) return 'billing_admin'
  if (p.is_supervisor) return 'supervisor'
  if (p.is_provider) return 'provider'
  return null
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const me = auth.provider
  if (!me?.id) return res.status(401).json({ error: 'No provider identity' })

  const supabase = admin()

  // ── GET ────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data: msgs, error } = await supabase
      .from('team_messages')
      .select('id, author_id, author_name, author_role, body, mentions, patient_ref, patient_name, created_at, edited_at, deleted_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return res.status(500).json({ error: error.message })

    // Unread = messages after my last_read_at (excluding my own).
    const { data: readRow } = await supabase
      .from('team_reads').select('last_read_at').eq('provider_id', me.id).maybeSingle()
    const lastRead = readRow?.last_read_at || '1970-01-01T00:00:00Z'
    const unread = (msgs || []).filter(m => m.author_id !== me.id && new Date(m.created_at) > new Date(lastRead)).length

    // Reverse so client gets oldest → newest.
    return res.status(200).json({
      messages: (msgs || []).reverse(),
      unread_count: unread,
      last_read_at: lastRead,
    })
  }

  // ── POST new message OR mark-read ─────────────────────────────────
  if (req.method === 'POST') {
    if (req.query?.action === 'mark-read') {
      const { error } = await supabase
        .from('team_reads')
        .upsert({ provider_id: me.id, last_read_at: new Date().toISOString() })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    const { body, patient_ref, patient_name } = req.body || {}
    const text = String(body || '').trim()
    if (!text) return res.status(400).json({ error: 'body required' })
    if (text.length > 4000) return res.status(400).json({ error: 'body too long (max 4000 chars)' })

    const mentions = await resolveMentions(supabase, text)
    const authorName = `${me.first_name || ''} ${me.last_name || ''}`.trim() || me.email || 'Unknown'

    const { data: inserted, error } = await supabase.from('team_messages').insert({
      author_id: me.id,
      author_name: authorName,
      author_role: roleSnapshot(me),
      body: text,
      mentions,
      patient_ref: patient_ref || null,
      patient_name: patient_name || null,
    }).select().maybeSingle()
    if (error) return res.status(500).json({ error: error.message })

    // Bump author's own last_read to now (so their own message isn't unread).
    await supabase.from('team_reads').upsert({ provider_id: me.id, last_read_at: new Date().toISOString() })

    return res.status(200).json({ message: inserted })
  }

  // ── PATCH edit ─────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    const { body } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const text = String(body || '').trim()
    if (!text) return res.status(400).json({ error: 'body required' })

    const { data: existing, error: gErr } = await supabase
      .from('team_messages').select('author_id').eq('id', id).maybeSingle()
    if (gErr) return res.status(500).json({ error: gErr.message })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.author_id !== me.id) return res.status(403).json({ error: 'Only the author can edit' })

    const mentions = await resolveMentions(supabase, text)
    const { data: updated, error } = await supabase
      .from('team_messages')
      .update({ body: text, mentions, edited_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ message: updated })
  }

  // ── DELETE (soft) ──────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id required' })

    const { data: existing, error: gErr } = await supabase
      .from('team_messages').select('author_id').eq('id', id).maybeSingle()
    if (gErr) return res.status(500).json({ error: gErr.message })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.author_id !== me.id && !me.is_admin) {
      return res.status(403).json({ error: 'Only the author or an admin can delete' })
    }

    const { error } = await supabase
      .from('team_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
