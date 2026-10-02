// GET  /api/bp-v2-model             → returns the active v2 ridge model JSON
// POST /api/bp-v2-model              → promote a trained v2 model (admin-only)
//                                      body: { model_json, n_training, n_val,
//                                              val_mae_sys, val_mae_dia,
//                                              lambda, feature_names, notes }
//
// Mirrors the pattern of _model-version.js for v15. GET is anon-callable so
// the live /vitals surface can load the active model without a session (same
// deal as validation-readings — the training data was anon-contributed, the
// resulting weights go back out via the same door). POST is admin-only — a
// drive-by promote would let anyone replace the live-displayed BP, so we
// require a signed-in admin + fresh re-auth is NOT required (model promotes
// are infrequent, admin-only, and audit-logged below).

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
  const supabase = admin()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('bp_v2_models')
      .select('id, trained_at, n_training, n_val, val_mae_sys, val_mae_dia, lambda, feature_names, model_json, notes')
      .eq('is_active', true)
      .order('trained_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('[bp-v2-model] load failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json(data || null)
  }

  if (req.method === 'POST') {
    const auth = await guardProvider(req, res)
    if (!auth) return  // 401 already sent
    const provider = auth.provider
    if (!provider?.is_admin) {
      return res.status(403).json({ error: 'Admin role required to promote a model' })
    }

    const p = req.body || {}
    if (!p.model_json || typeof p.model_json !== 'object') {
      return res.status(400).json({ error: 'model_json required' })
    }

    // Deactivate any current active row, then insert the new one as active.
    const { error: deactErr } = await supabase
      .from('bp_v2_models')
      .update({ is_active: false })
      .eq('is_active', true)
    if (deactErr) {
      console.error('[bp-v2-model] deactivate failed:', deactErr)
      return res.status(500).json({ error: 'Server error' })
    }

    const row = {
      model_json:    p.model_json,
      n_training:    p.n_training ?? null,
      n_val:         p.n_val ?? null,
      val_mae_sys:   p.val_mae_sys ?? null,
      val_mae_dia:   p.val_mae_dia ?? null,
      lambda:        p.lambda ?? null,
      feature_names: Array.isArray(p.feature_names) ? p.feature_names : null,
      notes:         p.notes ?? null,
      is_active:     true,
      promoted_by:   provider.id || null,
    }
    const { data, error } = await supabase.from('bp_v2_models').insert(row).select().single()
    if (error) {
      console.error('[bp-v2-model] insert failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }

    // Audit log the promote so we can see who flipped the live BP model when.
    try {
      await supabase.from('audit_log').insert({
        actor_id: provider.id, actor_type: 'provider',
        action: 'bp_v2_model_promoted',
        target_type: 'bp_v2_model', target_id: data.id,
        metadata: { n_training: row.n_training, val_mae_sys: row.val_mae_sys, val_mae_dia: row.val_mae_dia, lambda: row.lambda },
      })
    } catch (e) { console.warn('[bp-v2-model] audit log failed:', e?.message || e) }

    return res.status(200).json({ ok: true, id: data.id })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
