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

    // Get all waitlisted consultations
    const { data: waitlisted } = await supabase
      .from('consultations')
      .select('id, patient_first_name, patient_last_name, patient_email, patient_phone')
      .eq('status', 'waitlisted')
      .order('created_at', { ascending: true })

    if (!waitlisted?.length) return res.status(200).json({ sent: 0 })

    const appUrl = process.env.VITE_APP_URL || 'https://tere.co.nz'
    const resendKey = process.env.RESEND_API_KEY
    let sent = 0

    for (const c of waitlisted) {
      const resumeUrl = `${appUrl}/resume/${c.id}`
      const firstName = c.patient_first_name || 'there'
      const name = `${c.patient_first_name} ${c.patient_last_name}`.trim()

      // Update status to waiting
      await supabase.from('consultations')
        .update({ status: 'waiting', updated_at: new Date().toISOString() })
        .eq('id', c.id)

      // Send email notification
      if (resendKey && c.patient_email) {
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 24px;color:#374151">
      The Tere Health clinic is now open. Your spot is saved — click below to complete your payment and join the queue.
      <strong>You have 15 minutes before your place expires.</strong>
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${resumeUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:16px;font-weight:700">
        Claim my spot →
      </a>
    </div>
    <p style="font-size:13px;color:#9CA3AF;margin:0">Can't click? Copy this link: ${resumeUrl}</p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:24px">
      ⚠️ <strong>In an emergency, always call 111 — do not use Tere Health.</strong>
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a>
  </div>
</body></html>`

        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
            body: JSON.stringify({
              from: 'Tere Health <hello@terehealth.co.nz>',
              replyTo: 'terehealthnz@gmail.com',
              to: [c.patient_email],
              subject: `Tere Health is now open — claim your spot`,
              html,
              text: `Kia ora ${firstName},\n\nThe Tere Health clinic is now open. Click here to claim your spot (15 minutes to complete payment):\n\n${resumeUrl}\n\nIn an emergency, call 111.\n\nTere Health`,
            }),
          })
        } catch (e) { console.error('Resend error for', c.patient_email, e) }
      }

      console.log(`Notified ${name} — ${resumeUrl}`)
      sent++
    }

    res.status(200).json({ sent })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
