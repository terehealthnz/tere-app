export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    )

    const ACTIVE = ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'in_progress']

    // Run two queries: active consultations + paid-waitlisted (patient in WaitingRoom
    // but DB status not promoted due to RLS blocking the client-side update)
    const [activeRes, paidWaitlistRes] = await Promise.all([
      supabase.from('consultations').select('*').in('status', ACTIVE).order('created_at', { ascending: true }),
      supabase.from('consultations').select('*').eq('status', 'waitlisted').not('payment_intent_id', 'is', null).order('created_at', { ascending: true }),
    ])

    if (activeRes.error) throw activeRes.error

    const seen = new Set()
    const consultations = [...(activeRes.data || []), ...(paidWaitlistRes.data || [])]
      .filter(c => {
        if (seen.has(c.id)) return false
        seen.add(c.id)
        // Exclude async message consultations — they belong in the Messages tab only
        if (c.consultation_subtype === 'async_message') return false
        return true
      })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    res.status(200).json({ consultations })
  } catch (e) {
    console.error('[get-queue]', e)
    res.status(500).json({ error: e.message })
  }
}
