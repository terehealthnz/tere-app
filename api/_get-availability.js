import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )

  const { data, error } = await supabase
    .from('availability')
    .select('is_open, message')
    .eq('id', 1)
    .single()

  if (error) {
    console.error('[get-availability]', error)
    return res.status(200).json({ is_open: false, message: '' })
  }

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ is_open: data.is_open, message: data.message || '' })
}
