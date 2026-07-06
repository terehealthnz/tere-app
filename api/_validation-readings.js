// GET/POST/PATCH /api/validation-readings — server-side gateway that replaces
// direct Supabase reads/writes on validation_readings. Requires an
// authenticated provider (Supabase JWT via Authorization header). Runs with
// service_role so anon SELECT/UPDATE on validation_readings can be dropped.
//
// GET   /api/validation-readings                       → list, most-recent first
// GET   /api/validation-readings?subjectId=<uuid>      → list, filtered
// GET   /api/validation-readings?filter=trainable      → BP-labelled with rPPG signal
// GET   /api/validation-readings?filter=count          → total row count
// GET   /api/validation-readings?filter=paired-spo2    → { estimated, reference } pairs
//                                                        (used by spo2.js fallback calibration)
// POST  /api/validation-readings                       → creates a reading from the
//                                                        saveValidationReading() payload
// PATCH /api/validation-readings?id=<uuid>             → updates tere_spo2, tere_hr,
//                                                        tere_rr, hr_quality per body

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  const supabase = admin()

  if (req.method === 'GET') {
    const { subjectId, filter } = req.query || {}

    if (filter === 'count') {
      const { count, error } = await supabase
        .from('validation_readings')
        .select('*', { count: 'exact', head: true })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ count: count || 0 })
    }

    if (filter === 'trainable') {
      // Callers use this for BP model training — rows that have a raw rPPG signal
      // plus a BP-cuff ground truth. Enriched with subject demographics.
      const { data, error } = await supabase
        .from('validation_readings')
        .select('*, validation_subjects(age, sex, height_cm, weight_kg, fitzpatrick_scale)')
        .not('raw_rppg_signal', 'is', null)
        .not('manual_systolic', 'is', null)
        .not('manual_diastolic', 'is', null)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ readings: data || [] })
    }

    if (filter === 'paired-spo2') {
      // Small projection used by spo2.js when no shared calibration row exists yet.
      // Only two columns cross the wire.
      const { data, error } = await supabase
        .from('validation_readings')
        .select('tere_spo2, manual_spo2')
        .not('tere_spo2', 'is', null)
        .not('manual_spo2', 'is', null)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ pairs: data || [] })
    }

    // Default: full list ordered recorded_at desc, optionally filtered by subject_id.
    let q = supabase.from('validation_readings').select('*').order('recorded_at', { ascending: false })
    if (subjectId) q = q.eq('subject_id', subjectId)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ readings: data || [] })
  }

  if (req.method === 'POST') {
    const d = req.body || {}
    const hrDiff = (d.manualHr && d.tereHr) ? Math.abs(d.manualHr - d.tereHr) : null
    const payload = {
      subject_id:         d.subjectId || null,
      subject_code:       d.subjectCode || null,
      manual_systolic:    d.manualSystolic || null,
      manual_diastolic:   d.manualDiastolic || null,
      manual_hr:          d.manualHr || null,
      manual_temperature: d.manualTemperature || null,
      ambient_temp:       d.ambientTemp ?? null,
      tere_hr:            d.tereHr || null,
      tere_rr:            d.tereRr || null,
      hr_difference:      hrDiff,
      raw_rppg_signal:    d.rawRppgSignal || null,
      device_info:        d.deviceInfo || null,
      notes:              d.notes || null,
      session_conditions: d.sessionConditions || null,
      manual_spo2:        d.manualSpO2 || null,
      tere_spo2:          d.tereSpo2 || null,
      spo2_error:         (d.manualSpO2 && d.tereSpo2) ? (d.tereSpo2 - d.manualSpO2) : null,
      hrv_sdnn:           d.hrvSdnn   || null,
      hrv_rmssd:          d.hrvRmssd  || null,
      hrv_pnn50:          d.hrvPnn50  || null,
      af_score:           d.afScore   || null,
      af_likelihood:      d.afLikelihood || null,
      af_confirmed:       d.afConfirmed ?? null,
      af_confirmed_by:    d.afConfirmedBy || null,
    }
    if (d.videoUrl !== undefined)       payload.video_url = d.videoUrl
    if (d.hrQuality !== undefined)      payload.hr_quality = d.hrQuality
    if (d.extractionRuns !== undefined) payload.extraction_runs = d.extractionRuns

    const { data: reading, error } = await supabase
      .from('validation_readings')
      .insert(payload)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ reading })
  }

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param is required' })
    const p = req.body || {}
    const patch = {}

    // updateValidationSpo2 path
    if (p.tereSpo2 !== undefined) patch.tere_spo2 = p.tereSpo2

    // updateValidationHrRr path — same semantics as the original client helper.
    // opts.forceOverwrite = true writes even nulls (to clear stale values from
    // older algorithm runs). Default is defensive: only overwrite when a real
    // value is provided.
    const force = !!p.forceOverwrite
    if (force || p.tereHr != null) {
      patch.tere_hr = p.tereHr ?? null
      patch.hr_difference = (p.tereHr != null && p.manualHr != null) ? Math.abs(p.tereHr - p.manualHr) : null
    }
    if (force || p.tereRr != null) patch.tere_rr = p.tereRr ?? null
    if (p.hrQuality !== undefined) patch.hr_quality = p.hrQuality
    if (p.tereHr !== undefined || p.tereRr !== undefined || p.hrQuality !== undefined) {
      patch.reprocessed_at = new Date().toISOString()
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nothing to update — patch body is empty' })
    }
    const { error } = await supabase.from('validation_readings').update(patch).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
