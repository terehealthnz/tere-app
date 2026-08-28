import { createClient } from '@supabase/supabase-js'
import { resolvePatientAuth } from './_patient-token.js'
import { getClientIp } from './_client-ip.js'

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'POST') {
    const { consultation_id, consent_type, granted, patient_name } = req.body
    if (!consent_type) return res.status(400).json({ error: 'consent_type required' })

    // Pen-test M-5 phase 2: if a consultation_id is present, enforce the
    // patient session token against it. Pre-triage consents (no consult yet)
    // legitimately arrive without a consultation_id — there's nothing to
    // guard, so we skip the token check for those.
    if (consultation_id) {
      // Multi-entry-point flow (ConsentGate, HDCRightsGate,
      // PrescribingLimitationsGate, AITriage batch). Keep legacy fallback
      // ON until Vercel logs show no [patient-token] legacy-fallback hits
      // for 7 days — then flip to token-required (pen-test M-4/M-5 rollout).
      const auth = await resolvePatientAuth(req, { legacyConsultId: consultation_id, allowLegacyConsultId: true })
      if (auth.error) return res.status(auth.status).json({ error: auth.error })
      if (auth.consultationId !== consultation_id) {
        return res.status(403).json({ error: 'Token does not match consultation' })
      }
    }

    const ip = getClientIp(req)
    const { error } = await supabase.from('consents').insert({
      consultation_id: consultation_id || null,
      consent_type,
      granted: granted !== false,
      patient_name: patient_name || null,
      ip_address: ip,
    })
    if (error) { console.error('[consents] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'GET') {
    const { consultation_id } = req.query
    if (!consultation_id) return res.status(400).json({ error: 'consultation_id required' })

    // GET always names a specific consult — always enforce. Legacy fallback
    // still allowed here for the same 7-day rollout window as POST.
    const auth = await resolvePatientAuth(req, { legacyConsultId: consultation_id, allowLegacyConsultId: true })
    if (auth.error) return res.status(auth.status).json({ error: auth.error })
    if (auth.consultationId !== consultation_id) {
      return res.status(403).json({ error: 'Token does not match consultation' })
    }

    const { data, error } = await supabase.from('consents')
      .select('*').eq('consultation_id', consultation_id).order('created_at')
    if (error) { console.error('[consents] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ consents: data || [] })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
