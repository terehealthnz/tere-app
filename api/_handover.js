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
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true, note: data })
    }

    if (action === 'acknowledge') {
      const { id, provider_id, provider_name } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      const { data: current } = await supabase.from('handover_notes').select('acknowledged_by').eq('id', id).single()
      const acks = Array.isArray(current?.acknowledged_by) ? current.acknowledged_by : []
      if (!acks.find(a => a.provider_id === provider_id)) {
        acks.push({ provider_id, provider_name, at: new Date().toISOString() })
        await supabase.from('handover_notes').update({ acknowledged_by: acks }).eq('id', id)
      }
      return res.status(200).json({ ok: true })
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
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ notes: data || [] })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
