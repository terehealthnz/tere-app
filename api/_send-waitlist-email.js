export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.warn('[send-waitlist-email] No RESEND_API_KEY — skipping')
    return res.status(200).json({ sent: false, reason: 'no_key' })
  }

  const { consultationId, patientName, patientEmail, chiefComplaint } = req.body || {}

  if (!patientEmail) {
    console.warn('[send-waitlist-email] No patient email — skipping')
    return res.status(200).json({ sent: false, reason: 'no_email' })
  }

  console.log('[send-waitlist-email] Sending waitlist email to:', patientEmail)

  const firstName = (patientName || 'there').split(' ')[0]
  const appUrl = process.env.VITE_APP_URL || 'https://tere.co.nz'
  const resumeUrl = consultationId ? `${appUrl}/resume/${consultationId}` : `${appUrl}/triage`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px;color:#374151">
      You're on the Tere Health waitlist. The clinic is currently closed but your details are saved.
    </p>
    <div style="background:#F0F9FA;border-left:4px solid #0B6E76;padding:16px;border-radius:4px;margin:20px 0;font-size:14px;color:#374151">
      <strong>When we open:</strong> You'll receive a text and email with a link to complete your consultation.
      You'll have <strong>15 minutes</strong> to respond and secure your spot.
    </div>
    ${chiefComplaint ? `<p style="font-size:14px;color:#6B7280;margin:0 0 20px"><strong>Your complaint:</strong> ${chiefComplaint}</p>` : ''}
    <p style="font-size:14px;line-height:1.6;color:#374151">
      While you wait, if your condition worsens please seek immediate care.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:20px;text-align:center">
      <strong>⚠️ Emergency? Call 111 immediately — do not use Tere Health.</strong>
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · terehealth.co.nz
  </div>
</body>
</html>`

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [patientEmail],
        subject: "You're on the Tere Health waitlist",
        html,
        text: `Kia ora ${firstName},\n\nYou're on the Tere Health waitlist. The clinic is currently closed but your details are saved.\n\nWhen we open, you'll receive a text and email with a link to complete your consultation. You'll have 15 minutes to respond.\n\n${chiefComplaint ? `Your complaint: ${chiefComplaint}\n\n` : ''}If your condition worsens, seek immediate care. Emergency? Call 111.\n\nTere Health\nterehealth.co.nz`,
      }),
    })

    const data = await response.json()
    console.log('[send-waitlist-email] Resend response:', JSON.stringify(data))

    if (!response.ok) {
      console.error('[send-waitlist-email] Resend error:', data)
      return res.status(200).json({ sent: false, error: data })
    }

    return res.status(200).json({ sent: true, id: data.id })
  } catch (e) {
    console.error('[send-waitlist-email] Fetch error:', e.message)
    return res.status(200).json({ sent: false, error: e.message })
  }
}
