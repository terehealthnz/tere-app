import { createClient } from '@supabase/supabase-js'

const ACC_BASE_URL = process.env.ACC_SANDBOX === 'false'
  ? 'https://apiservices.acc.co.nz'
  : 'https://apiservicesnpe.acc.co.nz'

function supabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function getServiceCode(consultationType) {
  // Confirm exact codes with ACC (0800 222 994) before going live.
  // Placeholder codes for Emergency Medicine telehealth.
  const codes = {
    video:   process.env.ACC_SERVICE_CODE_VIDEO   || 'ETELE001',
    phone:   process.env.ACC_SERVICE_CODE_PHONE   || 'ETELE001',
    message: process.env.ACC_SERVICE_CODE_MESSAGE || 'ETELE002',
  }
  return codes[consultationType] || codes.video
}

function getACCRateCents(consultationType) {
  // Standard ACC co-payment rates — confirm with ACC before going live.
  const rates = {
    video:   parseInt(process.env.ACC_RATE_VIDEO_CENTS   || '3750'),
    phone:   parseInt(process.env.ACC_RATE_PHONE_CENTS   || '3750'),
    message: parseInt(process.env.ACC_RATE_MESSAGE_CENTS || '2500'),
  }
  return rates[consultationType] || rates.video
}

async function submitToACC(claimPayload) {
  const response = await fetch(`${ACC_BASE_URL}/api/v2/claims`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ACC_API_KEY}`,
      'X-Vendor-ID': process.env.ACC_VENDOR_ID,
    },
    body: JSON.stringify(claimPayload),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || `ACC API error ${response.status}`)
  }
  return data
}

// Simulate a claim number for sandbox/dev when ACC credentials aren't configured.
function generateSimulatedClaimNumber() {
  const prefix = process.env.ACC_SANDBOX === 'false' ? 'ACC' : 'TEST'
  return `${prefix}${Date.now().toString().slice(-8)}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { consultationId, providerId, providerHpi, providerName, providerType } = req.body
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const supabase = supabaseAdmin()

  try {
    // Fetch full consultation
    const { data: consult, error: cErr } = await supabase
      .from('consultations')
      .select('*')
      .eq('id', consultationId)
      .single()
    if (cErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

    const serviceCode  = getServiceCode(consult.consultation_type)
    const amountCents  = getACCRateCents(consult.consultation_type)
    const hpiNumber    = providerHpi || process.env.PATRICK_HPI_NUMBER || ''
    const pName        = providerName || 'Tere Health Provider'
    const isSandbox    = process.env.ACC_SANDBOX !== 'false'
    const hasCredentials = !!(process.env.ACC_API_KEY && process.env.ACC_VENDOR_ID && hpiNumber)

    let claimNumber, rawResponse

    if (hasCredentials) {
      const claimPayload = {
        providerHPI:         hpiNumber,
        providerName:        pName,
        providerType:        providerType || 'specialist',
        vendorId:            process.env.ACC_VENDOR_ID,
        patientNHI:          consult.patient_nhi,
        patientFirstName:    consult.patient_first_name,
        patientLastName:     consult.patient_last_name,
        patientDOB:          consult.patient_dob,
        patientPhone:        consult.patient_phone,
        patientEmail:        consult.patient_email,
        injuryDate:          consult.acc_injury_date,
        injuryDescription:   consult.acc_injury_details || consult.chief_complaint,
        readCode:            consult.acc_read_code,
        employerName:        consult.acc_employer || null,
        consultationDate:    consult.created_at,
        consultationType:    'telehealth',
        serviceCode,
        bankAccount:         process.env.WISE_ACCOUNT_NUMBER || '',
        bankName:            'Wise',
        accountName:         'Tere Health Limited',
      }
      rawResponse   = await submitToACC(claimPayload)
      claimNumber   = rawResponse.claimNumber
    } else {
      // No credentials — simulate for dev/sandbox
      claimNumber   = generateSimulatedClaimNumber()
      rawResponse   = { simulated: true, claimNumber, note: isSandbox ? 'ACC credentials not configured — simulated claim' : 'Missing ACC credentials' }
    }

    // Save claim record
    const { error: insertErr } = await supabase.from('acc_claims').insert({
      consultation_id: consultationId,
      patient_nhi:     consult.patient_nhi,
      patient_name:    `${consult.patient_first_name} ${consult.patient_last_name}`,
      provider_id:     providerId || null,
      provider_hpi:    hpiNumber,
      provider_name:   pName,
      claim_number:    claimNumber,
      service_code:    serviceCode,
      amount_claimed:  amountCents,
      status:          hasCredentials ? 'submitted' : 'simulated',
      submitted_at:    new Date().toISOString(),
      raw_response:    rawResponse,
    })

    // Tolerate if acc_claims table doesn't exist yet (migration not run)
    if (insertErr && !insertErr.message?.includes('does not exist')) {
      console.error('acc_claims insert error:', insertErr.message)
    }

    // Update consultation
    await supabase.from('consultations').update({
      acc_claim_number:  claimNumber,
      acc_claim_status:  hasCredentials ? 'submitted' : 'simulated',
      acc_submitted_at:  new Date().toISOString(),
    }).eq('id', consultationId)

    res.json({
      ok: true,
      claimNumber,
      simulated: !hasCredentials,
      amountCents,
      note: !hasCredentials
        ? 'ACC credentials not configured — set ACC_API_KEY, ACC_VENDOR_ID, and provider HPI number'
        : undefined,
    })
  } catch (e) {
    console.error('acc-claims error:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
}
