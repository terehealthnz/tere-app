// Provider onboarding gate — shared enforcement helper.
//
// Called from every PHI endpoint after guardProvider succeeds. If the
// provider's patient_access_from timestamp is in the future, the request
// is denied with 403 { error: 'patient_access_gated', unlock_at: <iso> }.
//
// Design: check the provider object attached by guardProvider. If it
// lacks the column (older cached provider row), fall through to allow —
// don't gate on missing metadata. Admins are never gated regardless of
// the column value (admin surfaces need to be usable to set the gate).

/**
 * @param {object} provider - The provider row (from auth.provider).
 * @param {object} res - The Vercel/Node response for writing 403 on gate hit.
 * @returns {boolean} true if the request was gated (and 403 already written);
 *                    false if the request may proceed.
 */
export function enforcePatientAccessGate(provider, res) {
  if (!provider) return false                  // no provider = no-op
  if (provider.is_admin) return false          // admins bypass
  const gate = provider.patient_access_from
  if (!gate) return false                      // no gate set
  const gateMs = Date.parse(gate)
  if (isNaN(gateMs)) return false              // malformed value, don't block
  if (Date.now() >= gateMs) return false       // gate has passed
  // Provider is still onboarding — deny.
  res.status(403).json({
    error:     'patient_access_gated',
    message:   'Your full patient access activates on the scheduled onboarding date. Use practice mode until then.',
    unlock_at: new Date(gateMs).toISOString(),
  })
  return true
}
