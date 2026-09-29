// api/_generate-med-cert.js — Generate a medical certificate PDF and email
// it to the patient as an attachment.
//
// Previous version rendered the certificate inline in the email body. Gmail
// strips base64 data-URL <img> tags so the provider signature always
// disappeared, and long HTML layouts get mangled across email clients — the
// artefact never looked like a real certificate. Now: proper A4 PDF built by
// buildMedCertPdf (mirrors prescription/referral PDFs), delivered as an
// attachment with a short cover email.
import { escapeHtml, sanitizeSubject } from './_email-safety.js'
import { writeAuditEvent } from './_audit-write.js'
import { hasEmailProvider } from './_email-client.js'
import { buildMedCertPdf } from './_pdf-builders.js'

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
    // data-URL PNG captured from the provider's signature canvas — passed
    // through to the PDF builder which decodes to a Buffer for pdfkit.
    providerSignature,
  } = req.body || {}

  if (!consultationId || !patientEmail) return res.status(400).json({ error: 'consultationId and patientEmail required' })
  if (!hasEmailProvider()) return res.status(500).json({ error: 'Email not configured' })

  const dateStr = consultationDate
    ? new Date(consultationDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })

  try {
    const pdfBuf = await buildMedCertPdf({
      patientName, patientDob, patientNhi, employer,
      consultationDate: consultationDate || new Date().toISOString(),
      certFrom, certTo,
      workCapacity, diagnosis, restrictions, modifiedHours, modifiedDays, reviewDate,
      providerName, providerReg,
      providerSignatureDataUrl: providerSignature,
    })

    const filename = `medical-certificate-${(patientName || 'patient').replace(/[^A-Za-z0-9]+/g, '-')}-${dateStr.replace(/ /g, '-')}.pdf`

    const { sendEmail } = await import('./_email-client.js')
    const emailRes = await sendEmail({
      from: 'Tere Health <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to: patientEmail,
      subject: sanitizeSubject(`Medical certificate — ${patientName || 'Patient'} — ${dateStr}`),
      html: `<p>Hi ${patientName ? escapeHtml(String(patientName).split(' ')[0]) : 'there'},</p>
<p>Please find your medical certificate from your Tere Health telehealth consultation attached as a PDF. You can forward this to your employer or ACC as needed.</p>
<p>If you have any questions, reply to this email and we'll get back to you.</p>
<p>— Tere Health<br>terehealth.co.nz</p>`,
      attachments: [{ filename, content: pdfBuf.toString('base64'), contentType: 'application/pdf' }],
    })
    if (!emailRes.ok) {
      console.error('[generate-med-cert] email send failed:', emailRes.error)
      return res.status(502).json({ error: 'Email delivery failed' })
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

    writeAuditEvent(req, req.auth, {
      event_type:      'medical_certificate.issued',
      consultation_id: consultationId || null,
      resource_type:   'medical_certificate',
      metadata: {
        work_capacity: workCapacity, cert_from: certFrom, cert_to: certTo,
        employer:      employer || null,
      },
    })

    res.json({ ok: true })
  } catch (e) {
    console.error('med-cert error:', e)
    res.status(500).json({ error: 'Server error' })
  }
}
