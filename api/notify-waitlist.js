export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return res.status(200).json({ sent: 0, error: 'No Resend key' })

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    )

    // Get all waitlisted consultations with email
    const { data: waitlisted } = await supabase
      .from('consultations')
      .select('id, patient_first_name, patient_last_name, patient_phone')
      .eq('status', 'waitlisted')
      .order('created_at', { ascending: true })

    if (!waitlisted?.length) return res.status(200).json({ sent: 0 })

    let sent = 0
    for (const c of waitlisted) {
      const paymentUrl = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/resume/${c.id}`
      const name = `${c.patient_first_name} ${c.patient_last_name}`

      // Update status to waiting so they can resume
      await supabase.from('consultations')
        .update({ status: 'waiting', waitlist_notified_at: new Date().toISOString() })
        .eq('id', c.id)

      // Send email if we have contact - for now log it
      console.log(`Notifying ${name} — ${paymentUrl}`)
      sent++
    }

    res.status(200).json({ sent })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
