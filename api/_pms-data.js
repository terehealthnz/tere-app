import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const providerId = req.query.providerId
  const supabase = supabaseAdmin()

  const nzNow      = new Date(new Date().toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }))
  const todayStart = new Date(nzNow.getFullYear(), nzNow.getMonth(), nzNow.getDate()).toISOString()

  try {
    const [consultsRes, claimsRes, rxRes, referralsRes] = await Promise.allSettled([
      // Today's completed consultations for this provider
      supabase.from('consultations')
        .select('id,status,consultation_type,is_acc,payment_amount_nzd,notes_finalised,created_at,patient_first_name,patient_last_name,chief_complaint,acc_claim_number,acc_claim_status,outcome')
        .eq('status', 'complete')
        .gte('created_at', todayStart)
        .eq(providerId ? 'provider_id' : 'status', providerId || 'complete')
        .order('created_at', { ascending: false }),

      // ACC claims for this provider (all time, recent first)
      supabase.from('acc_claims')
        .select('*')
        .eq(providerId ? 'provider_id' : 'status', providerId || 'submitted')
        .order('created_at', { ascending: false })
        .limit(50),

      // Recent prescriptions
      supabase.from('prescriptions')
        .select('id,drug_name,drug,dose,delivery_status,created_at,patient_name,nzeps_token')
        .eq(providerId ? 'provider_id' : 'delivery_status', providerId || 'sent')
        .order('created_at', { ascending: false })
        .limit(30),

      // Recent referrals
      supabase.from('radiology_referrals')
        .select('id,investigation,body_part,urgency,delivery_status,created_at,patient_name,referral_status')
        .eq(providerId ? 'provider_id' : 'delivery_status', providerId || 'sent')
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    const todayConsults   = consultsRes.status  === 'fulfilled' ? (consultsRes.value.data  || []) : []
    const accClaims       = claimsRes.status    === 'fulfilled' ? (claimsRes.value.data    || []) : []
    const prescriptions   = rxRes.status        === 'fulfilled' ? (rxRes.value.data        || []) : []
    const referrals       = referralsRes.status === 'fulfilled' ? (referralsRes.value.data || []) : []

    // Compute summary stats
    const todayRevenue    = todayConsults.reduce((s, c) => s + (c.payment_amount_nzd || 0), 0)
    const todayACC        = todayConsults.filter(c => c.is_acc).length
    const pendingNotes    = todayConsults.filter(c => !c.notes_finalised).length
    const claimsByStatus  = accClaims.reduce((m, c) => { m[c.status] = (m[c.status] || 0) + 1; return m }, {})
    const outstandingACC  = accClaims.filter(c => ['submitted','invoiced'].includes(c.status)).reduce((s, c) => s + (c.amount_claimed || 0), 0)

    res.json({
      ok: true,
      today: {
        consultations: todayConsults.length,
        accClaims:     todayACC,
        prescriptions: prescriptions.filter(rx => {
          const d = new Date(rx.created_at)
          return d >= new Date(todayStart)
        }).length,
        referrals:     referrals.filter(r => {
          const d = new Date(r.created_at)
          return d >= new Date(todayStart)
        }).length,
        revenueCents:  Math.round(todayRevenue * 100),
      },
      pending: {
        notes:          pendingNotes,
        accClaims:      claimsByStatus.submitted || 0,
        declinedClaims: claimsByStatus.declined  || 0,
      },
      accClaims: {
        all:            accClaims,
        byStatus:       claimsByStatus,
        outstandingCents: outstandingACC,
      },
      prescriptions,
      referrals,
      recentConsults: todayConsults.slice(0, 10),
    })
  } catch (e) {
    console.error('pms-data error:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
}
