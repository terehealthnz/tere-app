// Nightly v3 BP model retrain. Picks up new patient-contributed cuff +
// scan pairs from validation_readings, retrains the gradient-boost model
// at the 20-tree knee, and auto-promotes if the new model beats both the
// mean baseline AND the currently-promoted model's val MAE.
//
// This is the autonomous loop that turns every cuff-equipped scan into
// a slightly-better model the next day. No clinician click required.
//
// Safety gates (all must hold before promotion):
//   1. ≥ 20 total labelled signals (ridge/GBM minimum)
//   2. New-sample delta ≥ 10 since last promoted model (don't thrash)
//   3. Val MAE sys ≤ mean-baseline sys MAE (beat always-mean emitter)
//   4. Val MAE dia ≤ mean-baseline dia MAE
//   5. Val MAE sys ≤ current active model's val_mae_sys (don't regress)
//   6. Val MAE dia ≤ current active model's val_mae_dia + 0.5 (tolerance)
//
// Any failed gate = log + skip, no promotion. Attempts are always
// audit-logged with the reason.
//
// Schedule: 03:00 NZT nightly (14:00 UTC). Low-traffic window + leaves
// headroom for the dataset to grow during the day's scans.

import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from './_cron-auth.js'
import { trainV3, framesToV3Features } from '../src/lib/bpModelV3.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const KNEE_TREES = 20
const DEPTH      = 3
const LR         = 0.1
const VAL_FRAC   = 0.2
const MIN_NEW_SAMPLES = 10  // don't retrain if fewer than 10 new rows since last promote

export default async function handler(req, res) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorised' })
  }

  const supabase = admin()
  const started = Date.now()
  const audit = { attempted_at: new Date().toISOString(), reasons: [] }

  // 1. Pull trainable rows (cuff BP + raw rPPG + demographics).
  const { data: readings, error: rErr } = await supabase
    .from('validation_readings')
    .select('*, validation_subjects(age, sex, height_cm, weight_kg)')
    .not('raw_rppg_signal', 'is', null)
    .not('manual_systolic', 'is', null)
    .not('manual_diastolic', 'is', null)
  if (rErr) {
    console.error('[cron-retrain-bp-v3] load failed:', rErr)
    return res.status(500).json({ error: 'Server error', detail: rErr.message })
  }

  audit.n_total = readings?.length || 0
  if (audit.n_total < 20) {
    audit.reasons.push(`not enough labelled samples (${audit.n_total} < 20)`)
    return res.status(200).json({ ok: true, promoted: false, audit })
  }

  // 2. Compare count to the currently-promoted model's training n.
  const { data: active, error: aErr } = await supabase
    .from('bp_v3_models')
    .select('id, n_training, val_mae_sys, val_mae_dia')
    .eq('is_active', true)
    .maybeSingle()
  if (aErr) console.warn('[cron-retrain-bp-v3] active lookup failed:', aErr.message)

  const activeN = active?.n_training || 0
  if (audit.n_total < activeN + MIN_NEW_SAMPLES) {
    audit.reasons.push(`only ${audit.n_total - activeN} new samples since last promote (need ≥ ${MIN_NEW_SAMPLES})`)
    return res.status(200).json({ ok: true, promoted: false, audit })
  }

  // 3. Extract features. Mirrors the dashboard trainAndRunV3 loop.
  const features = []
  const labels = []
  let nSkippedExtraction = 0
  for (const r of readings) {
    const sub = r.validation_subjects || {}
    const frames = r.raw_rppg_signal?.frames
    const fps    = r.raw_rppg_signal?.fps || 30
    if (!Array.isArray(frames) || frames.length < fps * 10) { nSkippedExtraction++; continue }
    try {
      const feats = framesToV3Features(frames, fps, sub)
      if (feats) {
        features.push(feats)
        labels.push([r.manual_systolic, r.manual_diastolic])
      } else {
        nSkippedExtraction++
      }
    } catch (e) {
      nSkippedExtraction++
      console.warn(`[cron-retrain-bp-v3] feature extraction failed on reading ${r.id}: ${e.message}`)
    }
  }
  audit.n_features_extracted = features.length
  audit.n_skipped_extraction = nSkippedExtraction

  if (features.length < 20) {
    audit.reasons.push(`only ${features.length} rows produced features (need ≥ 20)`)
    return res.status(200).json({ ok: true, promoted: false, audit })
  }

  // 4. Compute mean baseline from the labelled rows (what "always predict
  //    cuff mean" would score). v3 must beat this to be worth promoting.
  const sysMean = labels.reduce((s, l) => s + l[0], 0) / labels.length
  const diaMean = labels.reduce((s, l) => s + l[1], 0) / labels.length
  const meanBaselineSys = labels.reduce((s, l) => s + Math.abs(l[0] - sysMean), 0) / labels.length
  const meanBaselineDia = labels.reduce((s, l) => s + Math.abs(l[1] - diaMean), 0) / labels.length
  audit.mean_baseline = { sys: +meanBaselineSys.toFixed(2), dia: +meanBaselineDia.toFixed(2) }

  // 5. Train at the known knee.
  let model
  try {
    model = trainV3(features, labels, { nTrees: KNEE_TREES, depth: DEPTH, lr: LR, valFrac: VAL_FRAC })
  } catch (e) {
    audit.reasons.push(`training failed: ${e.message || e}`)
    console.error('[cron-retrain-bp-v3] train failed:', e)
    return res.status(500).json({ error: 'Train failed', audit })
  }
  audit.candidate = {
    n:      model.meta.n,
    n_val:  model.meta.nVal,
    train:  model.meta.trainMae,
    val:    model.meta.valMae,
    trees:  model.meta.nTrees,
    lr:     model.meta.lr,
  }

  // 6. Gate: val MAE must beat mean baseline on BOTH sys and dia.
  if (model.meta.valMae.sys > meanBaselineSys) {
    audit.reasons.push(`val MAE sys ${model.meta.valMae.sys} does not beat mean baseline ${meanBaselineSys.toFixed(2)}`)
    await logAttempt(supabase, audit)
    return res.status(200).json({ ok: true, promoted: false, audit })
  }
  if (model.meta.valMae.dia > meanBaselineDia) {
    audit.reasons.push(`val MAE dia ${model.meta.valMae.dia} does not beat mean baseline ${meanBaselineDia.toFixed(2)}`)
    await logAttempt(supabase, audit)
    return res.status(200).json({ ok: true, promoted: false, audit })
  }

  // 7. Gate: val MAE must not regress against the currently-promoted model.
  //    0.5 mmHg tolerance on dia (variance across val splits is natural).
  if (active?.val_mae_sys != null && model.meta.valMae.sys > active.val_mae_sys) {
    audit.reasons.push(`val MAE sys ${model.meta.valMae.sys} regresses vs active ${active.val_mae_sys}`)
    await logAttempt(supabase, audit)
    return res.status(200).json({ ok: true, promoted: false, audit })
  }
  if (active?.val_mae_dia != null && model.meta.valMae.dia > active.val_mae_dia + 0.5) {
    audit.reasons.push(`val MAE dia ${model.meta.valMae.dia} regresses vs active ${active.val_mae_dia} (+0.5 tolerance)`)
    await logAttempt(supabase, audit)
    return res.status(200).json({ ok: true, promoted: false, audit })
  }

  // 8. Promote: deactivate current, insert new as active.
  const { error: deactErr } = await supabase
    .from('bp_v3_models')
    .update({ is_active: false })
    .eq('is_active', true)
  if (deactErr) {
    console.error('[cron-retrain-bp-v3] deactivate failed:', deactErr)
    return res.status(500).json({ error: 'Deactivate failed', audit })
  }

  const row = {
    model_json:    model,
    n_training:    model.meta.n,
    n_val:         model.meta.nVal,
    val_mae_sys:   model.meta.valMae.sys,
    val_mae_dia:   model.meta.valMae.dia,
    n_trees:       model.meta.nTrees,
    depth:         model.meta.depth,
    lr:            model.meta.lr,
    feature_names: model.featureNames,
    is_active:     true,
    notes:         `Auto-retrained by nightly cron · n=${model.meta.n} val=${model.meta.nVal} · beats mean ${meanBaselineSys.toFixed(1)}/${meanBaselineDia.toFixed(1)} · prior active ${active?.val_mae_sys ?? '—'}/${active?.val_mae_dia ?? '—'}`,
  }
  const { data: inserted, error: insErr } = await supabase.from('bp_v3_models').insert(row).select().single()
  if (insErr) {
    console.error('[cron-retrain-bp-v3] insert failed:', insErr)
    return res.status(500).json({ error: 'Insert failed', audit })
  }

  audit.promoted_id = inserted.id
  audit.prior_active_id = active?.id || null
  audit.reasons.push(`PROMOTED: val MAE ±${model.meta.valMae.sys}/±${model.meta.valMae.dia} on ${model.meta.nVal} unseen (n=${model.meta.n}, baseline ±${meanBaselineSys.toFixed(1)}/±${meanBaselineDia.toFixed(1)}, prior ±${active?.val_mae_sys ?? '—'}/±${active?.val_mae_dia ?? '—'})`)

  try {
    await supabase.from('audit_log').insert({
      actor_id: null, actor_type: 'cron',
      action: 'bp_v3_model_auto_promoted',
      target_type: 'bp_v3_model', target_id: inserted.id,
      metadata: {
        n_training: row.n_training, n_val: row.n_val,
        val_mae_sys: row.val_mae_sys, val_mae_dia: row.val_mae_dia,
        mean_baseline_sys: meanBaselineSys, mean_baseline_dia: meanBaselineDia,
        prior_active_id: active?.id || null,
        prior_val_mae_sys: active?.val_mae_sys || null,
        prior_val_mae_dia: active?.val_mae_dia || null,
      },
    })
  } catch (e) { console.warn('[cron-retrain-bp-v3] audit log failed:', e?.message || e) }

  console.log(`[cron-retrain-bp-v3] promoted ${inserted.id} — ${Date.now() - started}ms`)
  return res.status(200).json({ ok: true, promoted: true, audit })
}

async function logAttempt(supabase, audit) {
  try {
    await supabase.from('audit_log').insert({
      actor_id: null, actor_type: 'cron',
      action: 'bp_v3_model_retrain_skipped',
      target_type: 'bp_v3_model', target_id: null,
      metadata: audit,
    })
  } catch (e) { console.warn('[cron-retrain-bp-v3] attempt log failed:', e?.message || e) }
}
