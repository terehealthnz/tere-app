// SMS via Twilio — patient notifications, appointment confirmations, recall reminders
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { to, message, type } = req.body || {}
  if (!to || !message) return res.status(400).json({ error: 'Missing to or message' })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    // Graceful no-op if Twilio not configured (log for visibility)
    console.log(JSON.stringify({ ts: new Date().toISOString(), type: 'sms_skipped', to: to.slice(-4), sms_type: type }))
    return res.status(200).json({ ok: true, skipped: true, reason: 'Twilio not configured' })
  }

  // Sanitise NZ numbers — ensure +64 prefix
  const normalised = (() => {
    const digits = to.replace(/\D/g, '')
    if (digits.startsWith('64')) return '+' + digits
    if (digits.startsWith('0')) return '+64' + digits.slice(1)
    return '+' + digits
  })()

  const body = `[Tere Health] ${message}`

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: normalised, From: fromNumber, Body: body }).toString(),
    })
    const data = await r.json()
    if (!r.ok) return res.status(500).json({ error: data.message || 'Twilio error' })
    return res.status(200).json({ ok: true, sid: data.sid })
  } catch (e) {
    console.error('[sms]', e)
    return res.status(500).json({ error: e.message })
  }
}
