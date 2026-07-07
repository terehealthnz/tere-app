// Audit log — write events and read recent activity
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // The audit_logs table was planned but never migrated in. Both endpoints
  // degrade to a no-op instead of surfacing "table does not exist" errors,
  // so Admin panels that fetch audit history render empty instead of dying.
  const missingTable = (err) => err?.message?.includes('does not exist') || err?.message?.includes('schema cache')

  if (req.method === 'POST') {
    const { event_type, provider_id, provider_name, consultation_id, patient_ref, metadata } = req.body
    if (!event_type) return res.status(400).json({ error: 'Missing event_type' })
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
    const { error } = await supabase.from('audit_logs').insert({
      event_type, provider_id, provider_name, consultation_id, patient_ref, metadata, ip
    })
    if (error && missingTable(error)) return res.status(200).json({ ok: true, skipped: 'audit_logs table missing' })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'GET') {
    const { limit: lim = 100, event_type, provider_id, from, to } = req.query
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(parseInt(lim))
    if (event_type) q = q.eq('event_type', event_type)
    if (provider_id) q = q.eq('provider_id', provider_id)
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)
    const { data, error } = await q
    if (error && missingTable(error)) return res.status(200).json({ logs: [] })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ logs: data || [] })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
