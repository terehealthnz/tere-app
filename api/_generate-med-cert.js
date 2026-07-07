// api/_generate-med-cert.js — Generate and email a medical certificate
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    consultationId,
    patientName,
    patientDob,
    patientEmail,
    patientNhi,
    employer,
    consultationDate,
    providerName,
    providerReg,
    workCapacity,    // 'modified' | 'unfit'
    certFrom,
    certTo,
    restrictions,
    diagnosis,
    modifiedHours,
    modifiedDays,
    reviewDate,
  } = req.body || {}

  if (!consultationId || !patientEmail) return res.status(400).json({ error: 'consultationId and patientEmail required' })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return res.status(500).json({ error: 'Resend not configured' })

  const dateStr = consultationDate
    ? new Date(consultationDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })

  const certFromStr   = certFrom   ? new Date(certFrom).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : dateStr
  const certToStr     = certTo     ? new Date(certTo).toLocaleDateString('en-NZ',   { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
  const reviewDateStr = reviewDate ? new Date(reviewDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  const capacityLabel = workCapacity === 'unfit' ? 'Unfit for work' : 'Modified duties only'
  const capacityColor = workCapacity === 'unfit' ? '#DC2626' : '#D97706'

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1A2A33; max-width: 680px; margin: 0 auto; background: #fff; }
  .header { background: #0D2B45; padding: 24px 32px; }
  .logo { font-family: Georgia, serif; font-style: italic; color: #D4EEF0; font-size: 22px; }
  .sublogo { color: rgba(212,238,240,.5); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .cert-title { background: #F8FAFC; border: 2px solid #0B6E76; border-radius: 8px; padding: 16px 24px; margin: 24px 32px 0; text-align: center; }
  .body { padding: 20px 32px 24px; }
  .row { display: flex; border-bottom: 1px solid #F3F4F6; padding: 8px 0; font-size: 14px; }
  .row-label { color: #6B7280; width: 180px; flex-shrink: 0; }
  .row-value { color: #1A2A33; font-weight: 600; }
  .capacity-box { border-radius: 8px; padding: 12px 16px; margin: 16px 0; text-align: center; font-size: 18px; font-weight: 700; }
  .footer { background: #F8FAFC; padding: 16px 32px; font-size: 11px; color: #9CA3AF; border-top: 1px solid #E2E8F0; }
</style></head>
<body>
<div class="header">
  <div class="logo">Tere Health</div>
  <div class="sublogo">Marlborough Sounds, New Zealand</div>
</div>

<div class="cert-title">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#0B6E76;font-weight:700;margin-bottom:4px">Medical Certificate</div>
  <div style="font-size:22px;font-family:Georgia,serif;font-weight:700;color:#0D2B45">${patientName}</div>
</div>

<div class="body">
  <div style="margin-bottom:20px">
    <div class="row"><span class="row-label">Date of consultation</span><span class="row-value">${dateStr}</span></div>
    <div class="row"><span class="row-label">Date of birth</span><span class="row-value">${patientDob || '—'}</span></div>
    <div class="row"><span class="row-label">NHI number</span><span class="row-value">${patientNhi || '—'}</span></div>
    <div class="row"><span class="row-label">Employer</span><span class="row-value">${employer || '—'}</span></div>
    <div class="row"><span class="row-label">Diagnosis</span><span class="row-value">${diagnosis || '—'}</span></div>
  </div>

  <div class="capacity-box" style="background:${workCapacity === 'unfit' ? '#FEF2F2' : '#FFFBEB'};border:2px solid ${capacityColor};color:${capacityColor}">
    ${capacityLabel}
  </div>

  <div style="margin-bottom:16px">
    <div class="row"><span class="row-label">From</span><span class="row-value">${certFromStr}</span></div>
    <div class="row"><span class="row-label">To</span><span class="row-value">${certToStr}</span></div>
    ${workCapacity === 'modified' && modifiedHours && modifiedDays ? `<div class="row"><span class="row-label">Hours / days</span><span class="row-value">${modifiedHours} hours/day · ${modifiedDays} days/week</span></div>` : ''}
    ${restrictions ? `<div class="row"><span class="row-label">Restrictions</span><span class="row-value">${restrictions}</span></div>` : ''}
    ${reviewDateStr ? `<div class="row"><span class="row-label">Review date</span><span class="row-value">${reviewDateStr}</span></div>` : ''}
  </div>

  <p style="font-size:13px;color:#6B7280;line-height:1.7;margin-top:20px">
    This certificate was issued following a telehealth consultation conducted via Tere Health (terehealth.co.nz)
    in accordance with MCNZ telehealth standards.
  </p>

  <div style="margin-top:20px;border-top:1px solid #E2E8F0;padding-top:16px">
    <div style="font-size:14px;font-weight:700;color:#0D2B45">${providerName}</div>
    ${providerReg ? `<div style="font-size:12px;color:#6B7280">${providerReg}</div>` : ''}
    <div style="font-size:12px;color:#6B7280">Tere Health · terehealthnz@gmail.com</div>
    <div style="font-size:12px;color:#6B7280">Issued: ${dateStr}</div>
  </div>
</div>

<div class="footer">
  Tere Health · Marlborough Sounds, New Zealand · terehealth.co.nz<br>
  This certificate contains confidential patient information.
</div>
</body></html>`

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: patientEmail,
        subject: `Medical Certificate — ${patientName} — ${dateStr}`,
        html,
      }),
    })
    if (!emailRes.ok) {
      const err = await emailRes.text()
      return res.status(500).json({ error: err })
    }

    // Update medical_certificate_issued in Supabase
    const supaUrl = process.env.VITE_SUPABASE_URL
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (supaUrl && supaKey && consultationId) {
      await fetch(`${supaUrl}/rest/v1/consultations?id=eq.${consultationId}`, {
        method: 'PATCH',
        headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ medical_certificate_issued: true }),
      })
    }

    res.json({ ok: true })
  } catch (e) {
    console.error('med-cert error:', e)
    res.status(500).json({ error: e.message })
  }
}
