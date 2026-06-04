import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )

  const [{ data, error }, { data: manualProviders }] = await Promise.all([
    supabase.from('availability').select('is_open, message').eq('id', 1).single(),
    supabase.from('providers').select('id').eq('is_available', true).eq('is_provider', true).eq('is_active', true),
  ])

  if (error) {
    console.error('[get-availability]', error)
    return res.status(200).json({ is_open: false, message: '' })
  }

  // A manually-available provider overrides the availability table
  const anyManuallyAvailable = (manualProviders?.length ?? 0) > 0
  const isOpen = data.is_open || anyManuallyAvailable

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ is_open: isOpen, message: data.message || '' })
}
