// GET /api/provider-list
//
// Anonymous, no auth required. Returns the minimum provider info
// needed to render the login picker: display name, avatar colour,
// active clinical roles. Explicitly excludes email, phone, pin_hash,
// mfa_secret, and any other sensitive field.
//
// Exists because the direct-anon `supabase.from('providers').select(...)`
// pattern that the login picker used broke when we revoked anon
// grants on the providers table (2026-08-09 RLS lockdown). Everything
// else that lists providers happens in authenticated contexts and
// should use the auth-gated `/api/providers` endpoint instead.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Public-safe column allowlist. Anything not in this list is NEVER
// returned to an unauthenticated caller, even if the DB has more.
const PUBLIC_COLUMNS = [
  'id', 'first_name', 'last_name',
  'credential', 'specialty', 'color',
  'is_active', 'is_admin', 'is_provider', 'is_supervisor',
  'can_prescribe', 'can_refer', 'can_acc',
  'prescriber_number', 'cpn',
]

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = admin()
  const { data, error } = await supabase
    .from('providers')
    .select(PUBLIC_COLUMNS.join(','))
    .eq('is_active', true)
    .order('first_name')

  if (error) {
    console.error('[provider-list]', error)
    return res.status(500).json({ error: 'Failed to load providers' })
  }
  res.status(200).json({ providers: data || [] })
}
