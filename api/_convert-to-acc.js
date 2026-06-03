export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    consultationId,
    injuryDate,
    mechanism,
    bodyPart,
    workRelated,
    employer,
    readCode,
    readCodeLabel,
    providerId,
    providerName,
  } = req.body || {}

  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const supaUrl = process.env.VITE_SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const now = new Date().toISOString()

  // 1. Get current consultation
  const consultRes = await fetch(
    `${supaUrl}/rest/v1/consultations?id=eq.${consultationId}&select=*`,
    { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
  )
  const [consult] = await consultRes.json()
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  // 2. Update consultation record
  const updatePayload = {
    acc_eligible: 'yes',
    is_acc: true,
    acc_converted_by_provider: true,
    acc_converted_at: now,
    acc_converted_by: providerId || null,
    acc_injury_date: injuryDate || null,
    acc_injury_details: mechanism || null,
    acc_body_part: bodyPart || null,
    acc_employer: workRelated === 'yes' ? (employer || consult.acc_employer || null) : null,
    acc_read_code: readCode || null,
    notes_flagged: true,
    payment_amount: 2500,
  }
  await fetch(`${supaUrl}/rest/v1/consultations?id=eq.${consultationId}`, {
    method: 'PATCH',
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePayload),
  })

  // 3. Handle Stripe payment — cancel if not yet captured
  let paymentNote = ''
  if (consult.payment_intent_id) {
    try {
      const { default: Stripe } = await import('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const intent = await stripe.paymentIntents.retrieve(consult.payment_intent_id)
      if (intent.status === 'requires_capture') {
        await stripe.paymentIntents.cancel(consult.payment_intent_id)
        paymentNote = 'Uncaptured payment cancelled — ACC co-payment ($25) to be collected.'
      } else if (intent.status === 'succeeded') {
        const paid = intent.amount_received / 100
        paymentNote = `Patient paid $${paid} — ACC co-pay is $25. Admin review required for refund of $${paid - 25}.`
      }
    } catch (e) {
      console.error('[convert-to-acc] Stripe:', e.message)
    }
  }

  // 4. Audit log
  try {
    await fetch(`${supaUrl}/rest/v1/audit_log`, {
      method: 'POST',
      headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        action: 'acc_conversion',
        provider_id: providerId || null,
        consultation_id: consultationId,
        details: `${providerName || 'Provider'} converted to ACC — ${mechanism || '—'} | ${bodyPart || '—'} | ${readCode || '—'}`,
        created_at: now,
      }),
    })
  } catch {}

  // 5. Notifications
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const patientName = `${consult.patient_first_name || ''} ${consult.patient_last_name || ''}`.trim()
    const shortId = consultationId.slice(0, 8).toUpperCase()

    // Admin notification
    await resend.emails.send({
      from: 'Tere Health <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to: 'terehealthnz@gmail.com',
      subject: `[ACC Conversion] ${patientName} — ${shortId}`,
      text: [
        'ACC CONVERSION — REQUIRES LODGEMENT WITH PROVIDERHUB',
        '',
        `Provider:       ${providerName || '—'}`,
        `Patient:        ${patientName}`,
        `Consultation:   ${consultationId}`,
        `Converted at:   ${new Date(now).toLocaleString('en-NZ')}`,
        '',
        'ACC Details:',
        `  Injury date:  ${injuryDate || '—'}`,
        `  Mechanism:    ${mechanism || '—'}`,
        `  Body part:    ${bodyPart || '—'}`,
        `  Work related: ${workRelated === 'yes' ? 'Yes' : 'No'}`,
        `  Employer:     ${employer || '—'}`,
        `  Read code:    ${readCode || '—'} ${readCodeLabel ? '(' + readCodeLabel + ')' : ''}`,
        '',
        paymentNote ? `Payment note: ${paymentNote}` : '',
        '',
        'Action required: Lodge ACC45 claim via ProviderHub.',
        'Mark as lodged in the admin dashboard once submitted.',
      ].filter(l => l !== undefined).join('\n'),
    })

    // Patient notification
    if (consult.patient_email) {
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: consult.patient_email,
        subject: 'Your Tere Health consultation — ACC claim update',
        text: [
          `Kia ora ${consult.patient_first_name || ''},`,
          '',
          'Your provider has reviewed your consultation and determined your injury qualifies for an ACC claim.',
          '',
          'Your consultation has been updated to ACC billing.',
          'The ACC co-payment for a video consultation is $25.',
          '',
          'ACC claim details:',
          `  Injury:      ${mechanism || '—'}`,
          `  Body part:   ${bodyPart || '—'}`,
          `  Injury date: ${injuryDate || '—'}`,
          '',
          'ACC documentation will be lodged on your behalf. ACC may contact you for further information.',
          '',
          'Questions? Email terehealthnz@gmail.com',
          '',
          'Ngā mihi,',
          'Tere Health',
        ].join('\n'),
      })
    }
  } catch (e) {
    console.error('[convert-to-acc] Email:', e.message)
  }

  res.json({ ok: true, paymentNote: paymentNote || null })
}
