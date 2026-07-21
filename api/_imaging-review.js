// POST /api/imaging-review — provider submits a review for one referral.
//
// Body: { reviewId, decision: 'normal'|'concerning', comment, customEmailBody? }
//   - decision='normal': sends the standard "no acute findings" patient email
//   - decision='concerning': sends a custom email body composed by the reviewer
//     (call button lives in the UI and hits /api/make-call directly)
//
// Idempotency: if patient_email_sent_at is already set on this review, we do
// not re-send. Return 200 with { alreadySent: true } so the client can show a
// friendly notice. Reviewer identity comes from req.auth.provider (guardProvider).

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const MODALITY_LABEL = {
  xray: 'X-ray', ct: 'CT', mri: 'MRI', us: 'ultrasound', ultrasound: 'ultrasound',
}

function firstName(name) {
  return (name || '').split(' ')[0] || 'there'
}

function formatNzDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland',
  })
}

function modalityLabel(investigation) {
  if (!investigation) return 'imaging'
  const key = String(investigation).toLowerCase()
  for (const [k, v] of Object.entries(MODALITY_LABEL)) {
    if (key.includes(k)) return v
  }
  return investigation
}

async function sendResend({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY
  if (!key || !to) return { sent: false, skipped: 'no_key_or_recipient' }
  const { Resend } = await import('resend')
  const resend = new Resend(key)
  await resend.emails.send({
    from: 'Tere Health <hello@terehealth.co.nz>',
    replyTo: 'terehealthnz@gmail.com',
    to: [to],
    subject,
    html,
    text,
  })
  return { sent: true }
}

function wrapHtml(bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px;font-size:15px;line-height:1.7;color:#374151">
    ${bodyHtml}
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a><br>
    In an emergency, call 111.
  </div>
</body></html>`
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  })[c])
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { reviewId, decision, comment, customEmailBody } = req.body || {}
  if (!reviewId) return res.status(400).json({ error: 'reviewId required' })
  if (!decision || !['normal', 'concerning'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "normal" or "concerning"' })
  }
  if (!comment || !String(comment).trim()) {
    return res.status(400).json({ error: 'comment is required' })
  }
  if (decision === 'concerning' && (!customEmailBody || !String(customEmailBody).trim())) {
    return res.status(400).json({ error: 'customEmailBody required for concerning decisions' })
  }

  const reviewer = req.auth?.provider
  if (!reviewer?.id) return res.status(401).json({ error: 'Provider auth required' })

  const supabase = admin()

  const { data: review, error: rErr } = await supabase
    .from('imaging_reviews')
    .select(`
      id, patient_email_sent_at, reviewed_at,
      referral:radiology_referrals!inner(
        id, patient_name, patient_email, investigation, body_part, created_at
      )
    `)
    .eq('id', reviewId)
    .single()
  if (rErr || !review) return res.status(404).json({ error: 'Review not found' })

  // Idempotency guard — do not resend the patient email if we've already sent one.
  if (review.patient_email_sent_at) {
    return res.status(200).json({ ok: true, alreadySent: true })
  }

  const reviewerName = [reviewer.first_name, reviewer.last_name].filter(Boolean).join(' ') || reviewer.email

  // Persist the review first (so if email fails we can retry from the row).
  const nowIso = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('imaging_reviews')
    .update({
      reviewer_provider_id: reviewer.id,
      reviewer_name: reviewerName,
      decision,
      comment: String(comment).trim(),
      custom_email_body: decision === 'concerning' ? String(customEmailBody).trim() : null,
      reviewed_at: nowIso,
    })
    .eq('id', reviewId)
  if (updErr) return res.status(500).json({ error: updErr.message })

  // Send outbound patient email (Resend). Never SMS — SMS is transactional-only.
  const patientEmail = review.referral?.patient_email
  const patientFirst = firstName(review.referral?.patient_name)
  const modality     = modalityLabel(review.referral?.investigation)
  const referralDate = formatNzDate(review.referral?.created_at)

  let emailResult = { sent: false, skipped: 'no_email' }
  if (patientEmail) {
    try {
      if (decision === 'normal') {
        const line = `Kia ora ${patientFirst}, we've reviewed the report from your ${modality} on ${referralDate}. No acute findings. If your symptoms worsen or persist, please seek care. Ngā mihi — Tere Health.`
        emailResult = await sendResend({
          to: patientEmail,
          subject: 'Your imaging result — Tere Health',
          html: wrapHtml(`<p style="margin:0">${escapeHtml(line)}</p>`),
          text: line,
        })
      } else {
        const bodyHtml = escapeHtml(String(customEmailBody).trim()).replace(/\n/g, '<br>')
        emailResult = await sendResend({
          to: patientEmail,
          subject: 'Update on your imaging result — Tere Health',
          html: wrapHtml(`<p style="margin:0 0 12px">Kia ora ${escapeHtml(patientFirst)},</p><div>${bodyHtml}</div><p style="margin:16px 0 0">Ngā mihi — Tere Health</p>`),
          text: `Kia ora ${patientFirst},\n\n${String(customEmailBody).trim()}\n\nNgā mihi — Tere Health`,
        })
      }
    } catch (e) {
      // Non-fatal: the review row is already saved, so the reviewer can retry.
      console.error('[imaging-review] Resend error:', e.message)
      return res.status(200).json({ ok: true, emailError: e.message })
    }
  }

  if (emailResult.sent) {
    await supabase
      .from('imaging_reviews')
      .update({ patient_email_sent_at: new Date().toISOString() })
      .eq('id', reviewId)
  }

  return res.status(200).json({ ok: true, emailSent: !!emailResult.sent, emailSkipped: emailResult.skipped || null })
}
