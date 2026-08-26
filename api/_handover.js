import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'POST') {
    const { action } = req.body

    if (action === 'create') {
      const { provider_id, provider_name, note_text } = req.body
      if (!note_text) return res.status(400).json({ error: 'note_text required' })
      const { data, error } = await supabase.from('handover_notes').insert({
        provider_id, provider_name, note_text,
        shift_date: new Date().toISOString().slice(0, 10),
      }).select().single()
      if (error) { console.error('[handover] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true, note: data })
    }

    if (action === 'acknowledge') {
      const { id, provider_id, provider_name } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      // Optimistic-concurrency retry loop. Pen-test #309-F6: bare
      // read-modify-write on the acknowledged_by jsonb array meant two
      // providers acking simultaneously would each read the same base
      // array, push their own entry, and one write would silently drop
      // the other. Compare-and-swap on updated_at retries on conflict.
      // Low-severity (lost audit entry, not exploitable for privilege
      // elevation) but cheap to fix.
      const MAX_ATTEMPTS = 5
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const { data: current } = await supabase.from('handover_notes')
          .select('acknowledged_by, updated_at').eq('id', id).maybeSingle()
        if (!current) return res.status(404).json({ error: 'Handover note not found' })
        const acks = Array.isArray(current.acknowledged_by) ? current.acknowledged_by : []
        if (acks.find(a => a.provider_id === provider_id)) {
          // Already acked by this provider — noop success.
          return res.status(200).json({ ok: true })
        }
        const nextAcks = [...acks, { provider_id, provider_name, at: new Date().toISOString() }]
        const nextUpdatedAt = new Date().toISOString()
        const { data: updated } = await supabase.from('handover_notes')
          .update({ acknowledged_by: nextAcks, updated_at: nextUpdatedAt })
          .eq('id', id)
          .eq('updated_at', current.updated_at)   // compare-and-swap
          .select('id')
          .maybeSingle()
        if (updated) return res.status(200).json({ ok: true })
        // Someone else won the write — re-read and try again.
      }
      // Exhausted retries — heavy contention. Log so we notice; return 200
      // so the UI doesn't error (the ack request is retryable idempotently
      // from the client's next poll anyway).
      console.warn('[handover] ack retry exhausted for note', id, 'provider', provider_id)
      return res.status(200).json({ ok: true, contention: true })
    }

    if (action === 'archive') {
      const { id } = req.body
      await supabase.from('handover_notes').update({ archived: true }).eq('id', id)
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  if (req.method === 'GET') {
    const today = new Date().toISOString().slice(0, 10)
    // Return today's and yesterday's active notes
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const { data, error } = await supabase.from('handover_notes')
      .select('*')
      .eq('archived', false)
      .gte('shift_date', yesterday)
      .order('created_at', { ascending: false })
    if (error) { console.error('[handover] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ notes: data || [] })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
