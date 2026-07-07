// /api/spo2-calibrations — shared SpO2 calibration for the rPPG pipeline.
//
// GET  → latest calibration row (slope, intercept, n, rmse, created_at)
// POST → insert new calibration row (provider auth required)
//
// GET is public: the calibration is not PHI (just curve-fit params) and
// VitalsCapture on the patient side needs to apply it during vitals scan.
// POST is provider-only via router AUTH_REQUIRED_ROUTES — writes come from
// VitalsValidate (provider tool) and the fitSpO2Calibration bootstrap.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  const supabase = admin()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('spo2_calibrations')
      .select('slope, intercept, n, rmse, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ calibration: data || null })
  }

  if (req.method === 'POST') {
    const { slope, intercept, n, rmse } = req.body || {}
    if (typeof slope !== 'number' || typeof intercept !== 'number' || typeof n !== 'number') {
      return res.status(400).json({ error: 'slope, intercept, n required (numeric)' })
    }
    const { error } = await supabase.from('spo2_calibrations').insert({
      slope, intercept, n, rmse: typeof rmse === 'number' ? rmse : null,
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
