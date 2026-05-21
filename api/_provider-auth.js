import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { providerId, pin } = req.body || {}
  if (!providerId || !pin) return res.status(400).json({ error: 'Missing fields' })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )

  const { data: provider, error } = await supabase
    .from('providers')
    .select('*')
    .eq('id', providerId)
    .eq('is_active', true)
    .single()

  if (error || !provider) return res.status(401).json({ error: 'Invalid credentials' })
  if (provider.pin !== pin) return res.status(401).json({ error: 'Invalid credentials' })

  const { pin: _pin, ...safe } = provider
  res.json({ provider: safe })
}
