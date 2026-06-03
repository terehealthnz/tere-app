export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { consultationId } = req.body
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    )

    // Promote waitlisted → waiting only if payment has been taken
    // (guards against a patient calling this before paying)
    const { data: consult } = await supabase
      .from('consultations')
      .select('status, payment_intent_id')
      .eq('id', consultationId)
      .single()

    if (!consult) return res.status(404).json({ error: 'Not found' })
    if (consult.status !== 'waitlisted') return res.status(200).json({ ok: true, status: consult.status })
    if (!consult.payment_intent_id) return res.status(400).json({ error: 'Payment not taken' })

    const { error } = await supabase
      .from('consultations')
      .update({ status: 'waiting', updated_at: new Date().toISOString() })
      .eq('id', consultationId)
      .eq('status', 'waitlisted')

    if (error) throw error

    res.status(200).json({ ok: true, promoted: true })
  } catch (e) {
    console.error('[confirm-waiting]', e)
    res.status(500).json({ error: e.message })
  }
}
