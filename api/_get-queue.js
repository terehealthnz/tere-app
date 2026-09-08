import { guardProvider } from './_auth.js'
import { resolveDataMode } from './_provider-access-gate.js'
import { ensurePracticeSandbox } from './_practice-seed.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const auth = await guardProvider(req, res)
  if (!auth) return

  // Practice mode / onboarding gate. Gated providers force practice=true;
  // non-gated providers opt in via the x-practice-mode header. All
  // consultation queries below filter by is_practice=<mode> so a gated
  // provider only ever sees the sandbox queue, and a non-gated provider
  // in practice mode is fully insulated from real patient rows.
  const { practice, mode, unlockAt } = resolveDataMode(auth.provider, req)

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    )

    // Practice mode invariant: the sandbox always has patients waiting.
    // If a provider lands in practice mode with an empty queue, seed the
    // 3 fake patients (Aroha / David / Emily) on demand. Idempotent — no
    // duplicate seed on subsequent loads. Fail-open: if seeding fails,
    // don't block the queue read.
    if (practice) {
      try { await ensurePracticeSandbox(supabase, auth.provider) }
      catch (e) { console.error('[get-queue] ensurePracticeSandbox failed (non-fatal):', e?.message) }
    }

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
    // patient who never joined. The row STAYS in the queue during cooldown
    // so the provider can retry (they get 3 attempts total before no-show).
    // The client renders a "just released — retry when ready" chip on
    // cooldown rows so it's visually clear the patient hasn't joined yet.
    const [activeRes, paidWaitlistRes] = await Promise.all([
      supabase.from('consultations').select('*')
        .in('status', ACTIVE)
        .eq('is_practice', practice)
        .order('created_at', { ascending: true }),
      supabase.from('consultations').select('*')
        .eq('status', 'waitlisted')
        .eq('is_practice', practice)
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

    // Return the effective data mode so the UI can render banner + toggle
    // state without a second round-trip. Gated providers can't turn it
    // off; live providers see the toggle sync back to whatever the
    // server actually applied.
    res.status(200).json({ consultations, dataMode: { mode, practice, unlockAt } })
  } catch (e) {
    console.error('[get-queue]', e)
    res.status(500).json({ error: 'Server error' })
  }
}
