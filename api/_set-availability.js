import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { isOpen, message } = req.body || {}
  if (typeof isOpen !== 'boolean') return res.status(400).json({ error: 'isOpen (boolean) required' })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const patch = {
    is_open: isOpen,
    updated_at: new Date().toISOString(),
    ...(message !== undefined ? { message } : {}),
  }

  // Try with manual_override first (column may or may not exist)
  const { error } = await supabase
    .from('availability')
    .update({ ...patch, manual_override: true })
    .eq('id', 1)

  if (error) {
    // Retry without manual_override if the column doesn't exist yet
    if (error.message?.includes('manual_override')) {
      const { error: e2 } = await supabase
        .from('availability')
        .update(patch)
        .eq('id', 1)
      if (e2) {
        console.error('[set-availability]', e2)
        return res.status(500).json({ error: e2.message })
      }
    } else {
      console.error('[set-availability]', error)
      return res.status(500).json({ error: error.message })
    }
  }

  res.json({ ok: true, isOpen })
}
