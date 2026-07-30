import { guardProvider } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const auth = await guardProvider(req, res)
  if (!auth) return

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    )

    const ACTIVE = ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'in_progress', 'reviewing']

    // Auto-expire stale reviewing locks (provider closed browser without going back)
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    await supabase.from('consultations')
      .update({ status: 'waiting', provider_display_name: null, provider_id: null })
      .eq('status', 'reviewing')
      .lt('updated_at', staleThreshold)

    // Run two queries: active consultations + paid-waitlisted (patient in WaitingRoom
    // but DB status not promoted due to RLS blocking the client-side update).
    //
    // cooldown_until is set by /api/ring-timeout when a provider bails on a
    // patient who never joined — the row must stay out of the queue for 5
    // minutes so the same provider (or another) can't accidentally re-pick
    // the same no-answer patient immediately. `cooldown_until.is.null` covers
    // the normal case; `cooldown_until.lt.<now>` covers cooldowns that have
    // already expired.
    const nowIso = new Date().toISOString()
    const [activeRes, paidWaitlistRes] = await Promise.all([
      supabase.from('consultations').select('*')
        .in('status', ACTIVE)
        .or(`cooldown_until.is.null,cooldown_until.lt.${nowIso}`)
        .order('created_at', { ascending: true }),
      supabase.from('consultations').select('*')
        .eq('status', 'waitlisted')
        .not('payment_intent_id', 'is', null)
        .order('created_at', { ascending: true }),
    ])

    if (activeRes.error) throw activeRes.error

    const seen = new Set()
    const consultations = [...(activeRes.data || []), ...(paidWaitlistRes.data || [])]
      .filter(c => {
        if (seen.has(c.id)) return false
        seen.add(c.id)
        return true
      })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    res.status(200).json({ consultations })
  } catch (e) {
    console.error('[get-queue]', e)
    res.status(500).json({ error: e.message })
  }
}
