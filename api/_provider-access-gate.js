// Provider onboarding gate + practice mode resolver.
//
// Called from every PHI endpoint after guardProvider succeeds. Returns
// the effective data mode for this request:
//
//   { mode: 'live',     practice: false }  → real PHI (default)
//   { mode: 'practice', practice: true  }  → sandbox — filter is_practice=true
//   { mode: 'gated',    practice: true  }  → onboarding gate active, forced
//                                            to practice mode, toggle disabled
//                                            in UI
//
// Design:
//   - Admins are never gated and never in practice by default.
//   - Non-admin providers with patient_access_from in the future are
//     forced to practice mode (mode='gated'). The x-practice-mode header
//     from the client is ignored in this case.
//   - Non-admin providers past their gate (or with NULL gate) opt into
//     practice mode via the x-practice-mode: true header from the UI
//     toggle. Default is live.
//   - Endpoints use resolved.practice as the value for
//     .eq('is_practice', practice) on all patient / consultation
//     queries. That single field flips the whole surface between real
//     and sandbox with no per-endpoint conditional logic.

/**
 * Resolve the effective data mode for this request.
 * @param {object} provider - auth.provider from guardProvider
 * @param {object} req - request object (for reading x-practice-mode header)
 * @returns {{ mode: 'live'|'practice'|'gated', practice: boolean, unlockAt: string|null }}
 */
export function resolveDataMode(provider, req) {
  if (!provider) return { mode: 'live', practice: false, unlockAt: null }
  if (provider.is_admin) {
    // Admin: header controls practice mode, no gate applies.
    const header = req?.headers?.['x-practice-mode']
    return { mode: header === 'true' ? 'practice' : 'live', practice: header === 'true', unlockAt: null }
  }
  const gate = provider.patient_access_from
  if (gate) {
    const gateMs = Date.parse(gate)
    if (!isNaN(gateMs) && Date.now() < gateMs) {
      return { mode: 'gated', practice: true, unlockAt: new Date(gateMs).toISOString() }
    }
  }
  // Past the gate (or no gate) — provider toggles freely via header.
  const header = req?.headers?.['x-practice-mode']
  return { mode: header === 'true' ? 'practice' : 'live', practice: header === 'true', unlockAt: null }
}

/**
 * Convenience: for endpoints that want to hard-block (return 403) rather
 * than silently serve practice data. Not used by most PHI endpoints —
 * those prefer resolveDataMode + filter. Use for endpoints where practice
 * mode doesn't make sense (e.g. real-time payment webhooks, cron endpoints
 * that shouldn't run against practice data by mistake).
 *
 * @returns {boolean} true if the request was blocked (403 written); false if OK to proceed.
 */
export function enforcePatientAccessGate(provider, res) {
  if (!provider) return false
  if (provider.is_admin) return false
  const gate = provider.patient_access_from
  if (!gate) return false
  const gateMs = Date.parse(gate)
  if (isNaN(gateMs)) return false
  if (Date.now() >= gateMs) return false
  res.status(403).json({
    error:     'patient_access_gated',
    message:   'Your full patient access activates on the scheduled onboarding date. Use practice mode until then.',
    unlock_at: new Date(gateMs).toISOString(),
  })
  return true
}
