// /api/team-messages — provider/admin internal chat.
//
// v1: single shared '# General' channel.
// v2 (this file): adds 1:1 direct messages between two providers on top of
//                 the same table via an optional dm_thread_id column.
//
// Channel routes (unchanged from v1):
//   GET                                     → channel messages + channel unread
//   POST                                    → post to channel
//   POST ?action=mark-read                  → mark channel read for caller
//   PATCH ?id=<uuid>                        → edit own message
//   DELETE ?id=<uuid>                       → soft-delete own message (admin can delete any)
//
// DM routes (new in v2):
//   GET  ?action=list-dms                   → threads I'm in, counterpart + last msg preview + unread
//   POST ?action=start-dm  {recipient_id}   → get-or-create thread with recipient, returns { thread_id }
//   GET  ?thread=<uuid>                     → messages in that DM thread
//   POST with body {dm_thread_id, body}     → post to that DM
//   POST ?action=mark-read&thread=<uuid>    → mark THAT DM read
//
// All routes are provider-authed via guardProvider. RLS-enabled on all
// tables; only service_role can bypass. Authorization for DMs is enforced
// in this file — every DM read/write checks the caller is a participant.

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

// Canonicalise a participant pair to (low, high) so any 2 IDs map to the
// same lookup regardless of insertion order.
function sortPair(a, b) {
  return String(a) < String(b) ? [a, b] : [b, a]
}

// Get-or-create a DM thread for (me, other). Returns the thread row.
async function ensureDmThread(supabase, meId, otherId) {
  if (!otherId || otherId === meId) return null
  const [a, b] = sortPair(meId, otherId)
  const existing = await supabase
    .from('team_dm_threads')
    .select('*')
    .eq('participant_a', a).eq('participant_b', b)
    .maybeSingle()
  if (existing.data) return existing.data
  const created = await supabase
    .from('team_dm_threads')
    .insert({ participant_a: a, participant_b: b })
    .select('*')
    .maybeSingle()
  if (created.error) {
    // Race: someone else inserted the same pair between our SELECT and
    // INSERT — unique constraint fires. Re-read and return.
    if (created.error.code === '23505') {
      const reread = await supabase
        .from('team_dm_threads')
        .select('*')
        .eq('participant_a', a).eq('participant_b', b)
        .maybeSingle()
      return reread.data || null
    }
    return null
  }
  return created.data
}

// Verify the caller is a participant of the given DM thread. Returns the
// thread row on success, null on 404, or false on 403.
async function assertDmParticipant(supabase, meId, threadId) {
  const { data: t } = await supabase
    .from('team_dm_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle()
  if (!t) return { row: null, forbidden: false }
  if (t.participant_a !== meId && t.participant_b !== meId) return { row: null, forbidden: true }
  return { row: t, forbidden: false }
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const me = auth.provider
  if (!me?.id) return res.status(401).json({ error: 'No provider identity' })

  const supabase = admin()
  const action    = req.query?.action
  const threadId  = req.query?.thread

  // ── DM: list my threads with counterpart + last message + unread ────────
  if (req.method === 'GET' && action === 'list-dms') {
    const { data: threads, error: tErr } = await supabase
      .from('team_dm_threads')
      .select('id, participant_a, participant_b, created_at, updated_at')
      .or(`participant_a.eq.${me.id},participant_b.eq.${me.id}`)
      .order('updated_at', { ascending: false })
    if (tErr) return res.status(500).json({ error: tErr.message })
    if (!threads?.length) return res.status(200).json({ threads: [] })

    // Fetch counterpart identities in one round-trip.
    const otherIds = threads.map(t => t.participant_a === me.id ? t.participant_b : t.participant_a)
    const { data: provs } = await supabase
      .from('providers')
      .select('id, first_name, last_name, color, is_active')
      .in('id', otherIds)
    const provById = new Map((provs || []).map(p => [p.id, p]))

    // Fetch each thread's most-recent message body + timestamp.
    const threadIds = threads.map(t => t.id)
    const { data: recents } = await supabase
      .from('team_messages')
      .select('dm_thread_id, body, created_at, author_id')
      .in('dm_thread_id', threadIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    const lastByThread = new Map()
    for (const m of (recents || [])) {
      if (!lastByThread.has(m.dm_thread_id)) lastByThread.set(m.dm_thread_id, m)
    }

    // Per-thread read state → unread count.
    const { data: reads } = await supabase
      .from('team_dm_reads')
      .select('dm_thread_id, last_read_at')
      .eq('provider_id', me.id)
      .in('dm_thread_id', threadIds)
    const readMap = new Map((reads || []).map(r => [r.dm_thread_id, r.last_read_at]))

    // Unread counts per thread — count messages after my last_read_at
    // where I'm not the author.
    const unreadCounts = {}
    for (const tid of threadIds) {
      const lastRead = readMap.get(tid) || '1970-01-01T00:00:00Z'
      const { count } = await supabase
        .from('team_messages')
        .select('id', { count: 'exact', head: true })
        .eq('dm_thread_id', tid)
        .is('deleted_at', null)
        .gt('created_at', lastRead)
        .neq('author_id', me.id)
      unreadCounts[tid] = count || 0
    }

    return res.status(200).json({
      threads: threads.map(t => {
        const otherId = t.participant_a === me.id ? t.participant_b : t.participant_a
        const other = provById.get(otherId)
        const last = lastByThread.get(t.id)
        return {
          id: t.id,
          counterpart: other ? {
            id: other.id,
            name: `${other.first_name || ''} ${other.last_name || ''}`.trim(),
            color: other.color || '#0B6E76',
            is_active: !!other.is_active,
          } : { id: otherId, name: 'Unknown', color: '#9CA3AF', is_active: false },
          last_message: last ? { body: last.body, created_at: last.created_at } : null,
          unread_count: unreadCounts[t.id] || 0,
          updated_at: t.updated_at,
        }
      }),
    })
  }

  // ── DM: get-or-create a thread with a recipient ─────────────────────────
  if (req.method === 'POST' && action === 'start-dm') {
    const { recipient_id } = req.body || {}
    if (!recipient_id) return res.status(400).json({ error: 'recipient_id required' })
    if (recipient_id === me.id) return res.status(400).json({ error: "Can't DM yourself" })
    // Verify the recipient is a real, active provider so we can't manufacture
    // threads with arbitrary UUIDs.
    const { data: r } = await supabase
      .from('providers').select('id, is_active').eq('id', recipient_id).maybeSingle()
    if (!r) return res.status(404).json({ error: 'Recipient not found' })
    if (!r.is_active) return res.status(400).json({ error: 'Recipient is inactive' })
    const t = await ensureDmThread(supabase, me.id, recipient_id)
    if (!t) return res.status(500).json({ error: 'Could not open DM thread' })
    return res.status(200).json({ thread_id: t.id })
  }

  // ── DM: get messages in a specific thread ───────────────────────────────
  if (req.method === 'GET' && threadId) {
    const { row: t, forbidden } = await assertDmParticipant(supabase, me.id, threadId)
    if (forbidden) return res.status(403).json({ error: "Not your thread" })
    if (!t) return res.status(404).json({ error: 'Thread not found' })
    const { data: msgs, error } = await supabase
      .from('team_messages')
      .select('id, author_id, author_name, author_role, body, mentions, patient_ref, patient_name, created_at, edited_at, deleted_at, dm_thread_id')
      .eq('dm_thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return res.status(500).json({ error: error.message })
    const { data: readRow } = await supabase
      .from('team_dm_reads').select('last_read_at').eq('provider_id', me.id).eq('dm_thread_id', threadId).maybeSingle()
    const lastRead = readRow?.last_read_at || '1970-01-01T00:00:00Z'
    return res.status(200).json({
      messages: (msgs || []).reverse(),
      last_read_at: lastRead,
      thread: t,
    })
  }

  // ── Channel: GET messages + unread ──────────────────────────────────────
  if (req.method === 'GET') {
    const { data: msgs, error } = await supabase
      .from('team_messages')
      .select('id, author_id, author_name, author_role, body, mentions, patient_ref, patient_name, created_at, edited_at, deleted_at')
      .is('dm_thread_id', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return res.status(500).json({ error: error.message })

    const { data: readRow } = await supabase
      .from('team_reads').select('last_read_at').eq('provider_id', me.id).maybeSingle()
    const lastRead = readRow?.last_read_at || '1970-01-01T00:00:00Z'
    const channelUnread = (msgs || []).filter(m => m.author_id !== me.id && new Date(m.created_at) > new Date(lastRead)).length

    // Include DM unread totals in the top-level badge so the tab number
    // covers both channel and DMs.
    let dmUnreadTotal = 0
    const { data: myThreads } = await supabase
      .from('team_dm_threads')
      .select('id')
      .or(`participant_a.eq.${me.id},participant_b.eq.${me.id}`)
    if (myThreads?.length) {
      const ids = myThreads.map(t => t.id)
      const { data: reads } = await supabase
        .from('team_dm_reads').select('dm_thread_id, last_read_at').eq('provider_id', me.id).in('dm_thread_id', ids)
      const readMap = new Map((reads || []).map(r => [r.dm_thread_id, r.last_read_at]))
      for (const tid of ids) {
        const lr = readMap.get(tid) || '1970-01-01T00:00:00Z'
        const { count } = await supabase
          .from('team_messages')
          .select('id', { count: 'exact', head: true })
          .eq('dm_thread_id', tid)
          .is('deleted_at', null)
          .gt('created_at', lr)
          .neq('author_id', me.id)
        dmUnreadTotal += count || 0
      }
    }

    return res.status(200).json({
      messages: (msgs || []).reverse(),
      unread_count: channelUnread + dmUnreadTotal,
      channel_unread: channelUnread,
      dm_unread:      dmUnreadTotal,
      last_read_at:   lastRead,
    })
  }

  // ── POST — mark-read (channel or specific DM) ───────────────────────────
  if (req.method === 'POST' && action === 'mark-read') {
    if (threadId) {
      const { forbidden } = await assertDmParticipant(supabase, me.id, threadId)
      if (forbidden) return res.status(403).json({ error: "Not your thread" })
      const { error } = await supabase
        .from('team_dm_reads')
        .upsert({ provider_id: me.id, dm_thread_id: threadId, last_read_at: new Date().toISOString() })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }
    const { error } = await supabase
      .from('team_reads')
      .upsert({ provider_id: me.id, last_read_at: new Date().toISOString() })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── POST — new message (channel or DM) ──────────────────────────────────
  if (req.method === 'POST') {
    const { body, patient_ref, patient_name, dm_thread_id } = req.body || {}
    const text = String(body || '').trim()
    if (!text) return res.status(400).json({ error: 'body required' })
    if (text.length > 4000) return res.status(400).json({ error: 'body too long (max 4000 chars)' })

    // DM authorization + thread validation.
    if (dm_thread_id) {
      const { row: t, forbidden } = await assertDmParticipant(supabase, me.id, dm_thread_id)
      if (forbidden) return res.status(403).json({ error: "Not your thread" })
      if (!t) return res.status(404).json({ error: 'Thread not found' })
    }

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
      dm_thread_id: dm_thread_id || null,
    }).select().maybeSingle()
    if (error) return res.status(500).json({ error: error.message })

    // Bump author's own read stamp so their own message isn't unread.
    if (dm_thread_id) {
      await supabase.from('team_dm_reads').upsert({
        provider_id: me.id, dm_thread_id, last_read_at: new Date().toISOString(),
      })
      await supabase.from('team_dm_threads').update({ updated_at: new Date().toISOString() }).eq('id', dm_thread_id)
    } else {
      await supabase.from('team_reads').upsert({ provider_id: me.id, last_read_at: new Date().toISOString() })
    }

    return res.status(200).json({ message: inserted })
  }

  // ── PATCH edit (works for channel + DM messages) ────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    const { body } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const text = String(body || '').trim()
    if (!text) return res.status(400).json({ error: 'body required' })

    const { data: existing, error: gErr } = await supabase
      .from('team_messages').select('author_id, dm_thread_id').eq('id', id).maybeSingle()
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

  // ── DELETE (soft) ──────────────────────────────────────────────────────
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
