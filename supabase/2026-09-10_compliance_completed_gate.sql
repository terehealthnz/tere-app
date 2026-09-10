-- 2026-09-10_compliance_completed_gate.sql
--
-- First-login compliance gate: new hires must upload their APC and
-- Medical Indemnity certificate before they get anywhere near the
-- sandbox (let alone real patients). Adds a stamp that flips only when
-- both docs are on file with future expiries.
--
--   providers.compliance_completed_at
--     - Timestamp of the moment the provider had valid APC + MI on
--       file (both storage keys populated AND both expiry dates in
--       the future).
--     - NULL = block: send them to /clinician/compliance-required
--       until they upload both.
--     - Auto-set by /api/job-applications?action=upload_provider_compliance
--       whenever the trailing upload lands. Auto-cleared by the nightly
--       expiry cron (task #413) if either doc goes past its expiry —
--       forces re-upload before rostering resumes.
--
-- Existing providers (Patrick, Rachel) will have this NULL until they
-- upload their docs. That's the intended behaviour — we DO want them
-- to be caught by the gate on next login and asked to fill in the
-- compliance docs they haven't loaded yet. To grandfather anyone who
-- absolutely can't be interrupted, an admin can manually set the
-- timestamp via the providers admin surface (out-of-band SQL update).

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS compliance_completed_at TIMESTAMPTZ;

-- Fast lookup for the nightly expiry cron: "any provider whose
-- compliance_completed_at is set but has an expired APC or MI".
CREATE INDEX IF NOT EXISTS providers_compliance_completed_idx
  ON providers (compliance_completed_at)
  WHERE compliance_completed_at IS NOT NULL;
