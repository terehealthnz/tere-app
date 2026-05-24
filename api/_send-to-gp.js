// api/send-to-gp.js — Send finalised note PDF to GP via Resend
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    consultationId,
    gpName,
    gpEmail,
    patientName,
    patientNhi,
    patientDob,
    consultationDate,
    providerName,
    providerCredentials,
    chiefComplaint,
    noteContent,  // { presentingHistory, medicalHistory, allergies, socialHistory, examination, mdm, plan, accSection }
  } = req.body || {}

  if (!gpEmail || !consultationId) return res.status(400).json({ error: 'gpEmail and consultationId required' })

  const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return res.status(500).json({ error: 'Resend not configured' })

  const date = consultationDate
    ? new Date(consultationDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })

  const n = noteContent || {}
  const exam = n.examination || {}

  const examHtml = [
    exam.general     && `<tr><td style="padding:4px 8px;color:#6B7280;width:120px">General</td><td style="padding:4px 8px">${exam.general}</td></tr>`,
    exam.vitals      && `<tr><td style="padding:4px 8px;color:#6B7280">Vitals</td><td style="padding:4px 8px;font-family:monospace">${exam.vitals}</td></tr>`,
    exam.msk         && exam.msk !== 'Not clinically indicated — N/A' && `<tr><td style="padding:4px 8px;color:#6B7280">MSK</td><td style="padding:4px 8px">${exam.msk}</td></tr>`,
    exam.respiratory && exam.respiratory !== 'Not clinically indicated — N/A' && `<tr><td style="padding:4px 8px;color:#6B7280">Respiratory</td><td style="padding:4px 8px">${exam.respiratory}</td></tr>`,
    exam.cardiac     && exam.cardiac !== 'Not clinically indicated — N/A' && `<tr><td style="padding:4px 8px;color:#6B7280">Cardiac</td><td style="padding:4px 8px">${exam.cardiac}</td></tr>`,
    exam.abdomen     && exam.abdomen !== 'Not clinically indicated — N/A' && `<tr><td style="padding:4px 8px;color:#6B7280">Abdomen</td><td style="padding:4px 8px">${exam.abdomen}</td></tr>`,
    exam.skin        && exam.skin !== 'Not clinically indicated — N/A' && `<tr><td style="padding:4px 8px;color:#6B7280">Skin</td><td style="padding:4px 8px">${exam.skin}</td></tr>`,
    exam.neurological && exam.neurological !== 'Not clinically indicated — N/A' && `<tr><td style="padding:4px 8px;color:#6B7280">Neuro</td><td style="padding:4px 8px">${exam.neurological}</td></tr>`,
    exam.heent       && exam.heent !== 'Not clinically indicated — N/A' && `<tr><td style="padding:4px 8px;color:#6B7280">HEENT</td><td style="padding:4px 8px">${exam.heent}</td></tr>`,
  ].filter(Boolean).join('')

  const safePatientName = esc(patientName)
  const safePatientNhi = esc(patientNhi)
  const safePatientDob = esc(patientDob)
  const safeGpName = esc(gpName)
  const safeProvider = esc(providerName)
  const safeProviderCreds = esc(providerCredentials)
  const safeComplaint = esc(chiefComplaint)
  const safeHistory = esc(n.presentingHistory)
  const safeMedHistory = esc(n.medicalHistory)
  const safeAllergies = esc(n.allergies)
  const safeSocial = esc(n.socialHistory)
  const safeMdm = esc(n.mdm)
  const safePlan = esc(n.plan)

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1A2A33; max-width: 700px; margin: 0 auto; background: #fff; }
  .header { background: #0D2B45; padding: 24px 32px; }
  .logo { font-family: Georgia, serif; font-style: italic; color: #D4EEF0; font-size: 22px; }
  .sublogo { color: rgba(212,238,240,.5); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .patient-bar { background: #F0F9FF; border-left: 4px solid #0B6E76; padding: 12px 24px; margin: 0; }
  .body { padding: 24px 32px; }
  h3 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #0B6E76; margin: 24px 0 6px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; }
  p { font-size: 14px; line-height: 1.7; margin: 0 0 8px; color: #374151; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .footer { background: #F8FAFC; padding: 16px 32px; font-size: 11px; color: #9CA3AF; border-top: 1px solid #E2E8F0; }
</style></head>
<body>
<div class="header">
  <div class="logo">Tere Health</div>
  <div class="sublogo">He tere, he ora — Marlborough Sounds, New Zealand</div>
</div>

<div class="patient-bar">
  <strong>${safePatientName}</strong> &nbsp;·&nbsp; NHI: ${safePatientNhi || '—'} &nbsp;·&nbsp; DOB: ${safePatientDob || '—'}<br>
  <span style="font-size:13px;color:#6B7280">Telehealth consultation — ${date}</span>
</div>

<div class="body">
  <p style="margin-top:16px">Dear ${safeGpName ? 'Dr ' + safeGpName : 'Colleague'},</p>
  <p>I am writing to provide a summary of a telehealth consultation conducted via the Tere Health platform on ${date} with your patient, <strong>${safePatientName}</strong> (NHI: ${safePatientNhi || '—'}).</p>
  <p><strong>Presenting complaint:</strong> ${safeComplaint || '—'}</p>

  <h3>Presenting History</h3>
  <p>${safeHistory || '—'}</p>

  <h3>Medical History</h3>
  <p>${safeMedHistory || '—'}</p>

  <h3>Allergies</h3>
  <p>${safeAllergies || 'NKDA'}</p>

  <h3>Social History</h3>
  <p>${safeSocial || '—'}</p>

  <h3>Examination — performed by ${safeProvider}${safeProviderCreds ? ', ' + safeProviderCreds : ''}</h3>
  <table>${examHtml}</table>

  <h3>Medical Decision Making</h3>
  <p style="white-space:pre-line">${safeMdm || '—'}</p>

  <h3>Plan</h3>
  <p style="white-space:pre-line">${safePlan || '—'}</p>

  <p style="margin-top:24px">Please do not hesitate to contact us if you have any questions regarding this patient's care.</p>

  <p style="margin-top:16px">
    Kind regards,<br>
    <strong>${safeProvider}</strong>${safeProviderCreds ? '<br><span style="font-size:13px;color:#6B7280">' + safeProviderCreds + '</span>' : ''}
  </p>
</div>

<div class="footer">
  Tere Health · Marlborough Sounds, New Zealand · terehealth.co.nz<br>
  This letter contains confidential patient information. If received in error please destroy and notify us immediately.
</div>
</body></html>`

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Tere Health <noreply@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: gpEmail,
        subject: `Telehealth Consultation Summary — ${patientName}${patientNhi ? ' ' + patientNhi : ''} — ${date}`,
        html,
      }),
    })
    if (!emailRes.ok) {
      const err = await emailRes.text()
      return res.status(500).json({ error: err })
    }

    // Update gp_letter_sent_at and gp_email on consultation via Supabase REST
    const supaUrl = process.env.VITE_SUPABASE_URL
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (supaUrl && supaKey && consultationId) {
      await fetch(`${supaUrl}/rest/v1/consultations?id=eq.${consultationId}`, {
        method: 'PATCH',
        headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ gp_letter_sent_at: new Date().toISOString(), gp_email: gpEmail }),
      })
    }

    res.json({ ok: true })
  } catch (e) {
    console.error('send-to-gp error:', e)
    res.status(500).json({ error: e.message })
  }
}
