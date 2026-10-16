// POST /api/acc-confirm
//   Body: { consultationId, decision: 'confirmed' | 'declined', declineReason?, providerId }
//
// Records the provider's answer to the mandatory ACC confirmation popup
// that fires at Complete Encounter when a consult is still flagged ACC
// from patient triage (AITriage.jsx:260).
//
//   decision = 'confirmed' → patient's ACC claim is genuine; stamp
//                            acc_provider_confirmed_at/by. is_acc stays true.
//
//   decision = 'declined'  → provider disagrees with the patient's ACC
//                            claim. Stamp acc_provider_declined_at/by/reason,
//                            flip is_acc=false + acc_eligible='no'. Billing
//                            reconciliation (top-up charge, email, etc.)
//                            is a separate admin workflow.
//
// Rationale lives in 2026-10-15_acc_provider_confirmation.sql.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultationId, decision, declineReason, providerId } = req.body || {}

  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })
  if (decision !== 'confirmed' && decision !== 'declined') {
    return res.status(400).json({ error: 'decision must be "confirmed" or "declined"' })
  }
  if (decision === 'declined' && (!declineReason || !String(declineReason).trim())) {
    return res.status(400).json({ error: 'declineReason required when declining ACC' })
  }

  const supaUrl = process.env.VITE_SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const now = new Date().toISOString()

  const patch = decision === 'confirmed'
    ? {
        acc_provider_confirmed_at: now,
        acc_provider_confirmed_by: providerId || null,
        // Clear any prior decline on this consult if provider re-confirms.
        acc_provider_declined_at: null,
        acc_provider_declined_by: null,
        acc_provider_decline_reason: null,
      }
    : {
        acc_provider_declined_at: now,
        acc_provider_declined_by: providerId || null,
        acc_provider_decline_reason: String(declineReason).trim(),
        acc_provider_confirmed_at: null,
        acc_provider_confirmed_by: null,
        // The actual reclassification: patient's ACC flag doesn't survive
        // the provider's rejection. VendorSlaMetrics, ACC audit bundle, and
        // any future ACC_AUTOSEND_INVOICES cron all key off these flags.
        is_acc: false,
        acc_eligible: 'no',
      }

  const r = await fetch(`${supaUrl}/rest/v1/consultations?id=eq.${consultationId}`, {
    method: 'PATCH',
    headers: {
      apikey:        supaKey,
      Authorization: `Bearer ${supaKey}`,
      'Content-Type':'application/json',
      Prefer:        'return=representation',
    },
    body: JSON.stringify(patch),
  })

  if (!r.ok) {
    const text = await r.text().catch(() => '')
    console.error('[acc-confirm] PATCH failed:', r.status, text)
    return res.status(500).json({ error: 'Failed to record provider ACC decision' })
  }

  const [updated] = await r.json()
  return res.status(200).json({ ok: true, consultation: updated, decision })
}
