import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { isOpen, message } = req.body || {}
  if (typeof isOpen !== 'boolean') return res.status(400).json({ error: 'isOpen (boolean) required' })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )

  const patch = {
    id: 1,
    is_open: isOpen,
    manual_override: true,
    updated_at: new Date().toISOString(),
    ...(message !== undefined ? { message } : {}),
  }

  // UPSERT so it works even if the row doesn't exist yet
  const { error } = await supabase
    .from('availability')
    .upsert(patch, { onConflict: 'id' })

  if (error) {
    console.error('[set-availability]', error)
    return res.status(500).json({ error: error.message })
  }

  res.json({ ok: true, isOpen })
}
