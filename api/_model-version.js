// POST /api/model-version — saves a trained BP model version. Called by
// src/lib/bpModel.js after training completes on the client. Runs with
// service_role, requires an authenticated provider (only trusted staff
// should be able to push new model weights).

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

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const p = req.body || {}
  const supabase = admin()

  const { error } = await supabase.from('model_versions').insert({
    model_version:      p.model_version,
    training_samples:   p.training_samples,
    final_mae:          p.final_mae,
    val_mae:            p.val_mae,
    val_mae_sys:        p.val_mae_sys,
    val_mae_dia:        p.val_mae_dia,
    model_topology:     p.model_topology,
    weight_specs:       p.weight_specs,
    weight_data_base64: p.weight_data_base64,
    bp_mean:            p.bp_mean,
    bp_std:             p.bp_std,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
