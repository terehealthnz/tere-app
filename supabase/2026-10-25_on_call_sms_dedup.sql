-- Per-consultation dedup for the on-call provider SMS. Four code paths
-- fire notifyOnCallProviders when a consult transitions to
-- status='waiting' (create-consultation, create-consultation retry,
-- patient-consult PATCH, Windcave FPRN callback). Pre-fix, concurrent
-- callers all passed the per-provider 10-min rate check and sent the
-- same provider the same SMS twice. This column is the atomic claim
-- marker: UPDATE ... WHERE on_call_sms_sent_at IS NULL only succeeds
-- for the first caller; the others see zero rows and bail silently.

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS on_call_sms_sent_at timestamptz;
