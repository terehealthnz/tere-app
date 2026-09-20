// Sandbox outbound-safety helper. Any endpoint that sends to a patient / GP /
// pharmacy / HNZ / MedicalObjects / ACC etc. should check the target consult
// with isPracticeConsult() before touching an external side effect. If the
// consult is is_practice=true, suppress the send and return the shape the
// caller wants (usually { ok: true, simulated: true }).
//
// Root incident (2026-09-20): sandbox consult had a phone number that
// collided with a real NZ mobile number. Provider clicked 'Call' and Telnyx
// dialled a stranger. Fix: at the boundary of every outbound integration,
// the practice flag on the consult short-circuits the send.
//
// Design notes:
//   - Never throws — a DB error returns false (allow the send) rather than
//     blocking legit prod flows. The seed-safety change is defence in depth.
//   - Result is cached per (consultationId, tick) inside the caller — this
//     helper is a lookup, not a memoiser.
//   - Not applied to admin/careers/legal/internal emails (contract signing,
//     interview scheduling, provider onboarding). Those aren't tied to a
//     consultation and never dial patient contact points.

export async function isPracticeConsult(supabase, consultationId) {
  if (!supabase || !consultationId) return false
  try {
    const { data, error } = await supabase
      .from('consultations')
      .select('is_practice')
      .eq('id', consultationId)
      .maybeSingle()
    if (error) {
      console.warn('[practice-guard] lookup failed, defaulting to allow:', error.message)
      return false
    }
    return !!(data && data.is_practice)
  } catch (e) {
    console.warn('[practice-guard] threw, defaulting to allow:', e.message)
    return false
  }
}
