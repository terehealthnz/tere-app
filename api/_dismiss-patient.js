import Stripe from 'stripe'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { consultationId, patientEmail, patientName, paymentIntentId } = req.body
  if (!consultationId) return res.status(400).json({ error: 'Missing consultationId' })

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )

  // Mark dismissed
  await supabase.from('consultations')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', consultationId)

  // Release Stripe hold (fire-and-forget)
  if (paymentIntentId) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      await stripe.paymentIntents.cancel(paymentIntentId)
    } catch {}
  }

  // Email patient (fire-and-forget)
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey && patientEmail) {
    const firstName = (patientName || '').split(' ')[0] || 'there'
    const appUrl = process.env.VITE_APP_URL || 'https://tere.co.nz'
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [patientEmail],
        subject: 'Your Tere Health consultation — unable to connect today',
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff"><div style="background:#0D2B45;padding:20px 28px"><div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div></div><div style="padding:24px 28px"><p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p><p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">Unfortunately we were unable to see you today. <strong>No charge has been applied to your card.</strong></p><p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px">Your details are saved — please start a new consultation when you're ready.</p><div style="text-align:center;margin:28px 0"><a href="${appUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:16px;font-weight:700">Start a new consultation →</a></div><div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:24px">⚠️ <strong>In an emergency, call 111.</strong></div></div><div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">Tere Health · <a href="${appUrl}" style="color:#0B6E76">${appUrl.replace('https://','')}</a></div></body></html>`,
        text: `Kia ora ${firstName},\n\nUnfortunately we were unable to see you today. No charge has been applied.\n\nPlease start a new consultation when you're ready: ${appUrl}\n\nIn an emergency, call 111.\n\nTere Health`,
      }),
    }).catch(() => {})
  }

  res.status(200).json({ ok: true })
}
