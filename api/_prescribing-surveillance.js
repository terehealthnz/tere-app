// Patient-level prescribing surveillance (task #424).
//
// Aggregates prescriptions across ALL providers for the same patient over a
// lookback window (default 90d). Surfaces doctor-shopping + polypharmacy
// signatures that the per-provider dashboard can't see.
//
// GET /api/prescribing-surveillance
//   ?days=90                (lookback window, default 90, max 365)
//   ?class=controlled       (controlled | benzo_opioid | all — default all)
//   ?min_providers=2        (only surface patients with >= N distinct
//                            providers in window; default 2)
//   ?min_prescriptions=3    (only surface patients with >= N total scripts;
//                            default 3)
//
// Response: array of patient summaries with distinct provider count + drug
// list + first/last date. Admin surface uses this to click into any patient
// for full history.
//
// JIT elevation required — same threshold as the controlled drugs register.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const HIGH_RISK_STEM_RE = /(diazepam|lorazepam|oxazepam|temazepam|midazolam|clonazepam|zopiclone|zolpidem|codeine|tramadol|morphine|oxycodone|fentanyl|methadone|buprenorphine|amphetamine|dexamphetamine|methylphenidate|pregabalin|gabapentin)/i

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider.is_admin && !auth.provider.is_supervisor) {
    return res.status(403).json({ error: 'Admin/supervisor only' })
  }

  // JIT elevation gate — reuse the pattern used by CD register.
  try {
    const { checkElevation } = await import('./_elevation.js')
    const elev = await checkElevation(req, { required: true })
    if (!elev.ok) return res.status(elev.status).json({ error: elev.error, requires_elevation: true })
  } catch {}

  const days           = Math.min(365, Math.max(7,  Number(req.query?.days) || 90))
  const minProviders   = Math.max(1, Number(req.query?.min_providers) || 2)
  const minPrescripts  = Math.max(1, Number(req.query?.min_prescriptions) || 3)
  const cls            = String(req.query?.class || 'all').toLowerCase()

  const supabase = admin()
  const lookback = new Date(Date.now() - days * 86400 * 1000).toISOString()

  let q = supabase.from('prescriptions')
    .select('id, drug_name, drug, controlled, quantity, repeats, created_at, patient_name, patient_nhi, patient_email, provider_id, provider_name, approval_status')
    .gte('created_at', lookback)
    .in('approval_status', ['approved', 'pending_approval'])
    .limit(5000)
  if (cls === 'controlled') q = q.eq('controlled', true)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })

  const rows = (data || []).filter(r => {
    if (cls === 'benzo_opioid') return HIGH_RISK_STEM_RE.test(`${r.drug_name || ''} ${r.drug || ''}`)
    return true
  })

  // Group by (nhi || email || name).
  const groups = new Map()
  for (const r of rows) {
    const key = r.patient_nhi || r.patient_email || r.patient_name || 'unknown'
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        patient_nhi:   r.patient_nhi   || null,
        patient_email: r.patient_email || null,
        patient_name:  r.patient_name  || null,
        prescriptions: [],
        providers:     new Set(),
        drugs:         new Set(),
        first_at:      r.created_at,
        last_at:       r.created_at,
        total_qty:     0,
      })
    }
    const g = groups.get(key)
    g.prescriptions.push({ id: r.id, drug: r.drug_name || r.drug, qty: Number(r.quantity) || 0, repeats: Number(r.repeats) || 0, at: r.created_at, provider: r.provider_name, controlled: !!r.controlled })
    if (r.provider_id)                g.providers.add(r.provider_id)
    if (r.drug_name || r.drug)        g.drugs.add(String(r.drug_name || r.drug).toLowerCase())
    if (r.created_at < g.first_at)    g.first_at = r.created_at
    if (r.created_at > g.last_at)     g.last_at  = r.created_at
    g.total_qty += (Number(r.quantity) || 0) * (1 + (Number(r.repeats) || 0))
  }

  const surveillance = [...groups.values()]
    .map(g => ({
      patient_nhi:        g.patient_nhi,
      patient_email:      g.patient_email,
      patient_name:       g.patient_name,
      prescription_count: g.prescriptions.length,
      distinct_providers: g.providers.size,
      distinct_drugs:     g.drugs.size,
      total_quantity:     g.total_qty,
      first_at:           g.first_at,
      last_at:            g.last_at,
      prescriptions:      g.prescriptions.sort((a, b) => new Date(b.at) - new Date(a.at)),
      risk_score:         g.providers.size * 3 + g.prescriptions.length + (g.prescriptions.filter(p => p.controlled).length * 5),
    }))
    .filter(g => g.distinct_providers >= minProviders && g.prescription_count >= minPrescripts)
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 500)

  return res.status(200).json({ window_days: days, class: cls, count: surveillance.length, patients: surveillance })
}
