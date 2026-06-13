// Admin patch endpoint — service-role update for validation_readings
// Auth: requires TERE_API_KEY header
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = req.headers['x-tere-api-key'] || req.body?.apiKey
  if (auth !== process.env.TERE_API_KEY) return res.status(401).json({ error: 'Unauthorized' })

  const { table, id, patch } = req.body
  if (!table || !id || !patch) return res.status(400).json({ error: 'Missing table, id, or patch' })

  // Allowlist — only permit patching validation tables
  const allowed = ['validation_readings', 'validation_subjects']
  if (!allowed.includes(table)) return res.status(403).json({ error: 'Table not permitted' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, data })
}
