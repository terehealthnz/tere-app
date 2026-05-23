import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/

export default async function handler(req, res) {
  const { providerId, currentPassword, newPassword } = req.body || {}
  if (!providerId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing fields' })
  }

  if (!PASSWORD_REGEX.test(newPassword)) {
    return res.status(400).json({
      error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.'
    })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: provider, error } = await supabase
    .from('providers')
    .select('id, pin_hash')
    .eq('id', providerId)
    .eq('is_active', true)
    .single()

  if (error || !provider?.pin_hash) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const currentValid = await bcrypt.compare(String(currentPassword), provider.pin_hash)
  if (!currentValid) {
    return res.status(401).json({ error: 'Current password is incorrect.' })
  }

  const newHash = await bcrypt.hash(newPassword, 12)

  const { error: updateError } = await supabase
    .from('providers')
    .update({ pin_hash: newHash, must_change_password: false })
    .eq('id', providerId)

  if (updateError) return res.status(500).json({ error: 'Failed to update password.' })

  res.json({ ok: true })
}
