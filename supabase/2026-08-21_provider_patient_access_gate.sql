-- Provider onboarding gate.
--
-- A hired provider often needs to log in, learn the app, and try flows
-- against practice patients before they're ready to see real PHI. This
-- column lets an admin set a future timestamp before which the provider
-- cannot access any real patient data — but can still log in, edit
-- their profile, and use the practice-mode sandbox.
--
-- Semantics:
--   NULL                          → no gate, full access (default for
--                                   existing providers)
--   patient_access_from > now()   → gated — server 403s on real PHI
--                                   endpoints, UI auto-enables practice
--                                   mode and shows a banner with the
--                                   unlock date
--   patient_access_from <= now()  → gate has passed, full access
--
-- Server enforcement lives in api/_provider-access-gate.js and is called
-- from every PHI endpoint. UI treatment lives in the provider surfaces.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS patient_access_from timestamptz;

COMMENT ON COLUMN providers.patient_access_from IS
  'Provider onboarding gate. NULL = full access. Future timestamp = provider can log in, edit own profile, and use practice mode, but real PHI endpoints 403 until timestamp passes.';

-- Track whether the 24h-pre-unlock reminder email has been sent so the
-- cron job doesn't fire twice.
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS patient_access_unlock_email_sent_at timestamptz;

COMMENT ON COLUMN providers.patient_access_unlock_email_sent_at IS
  'Timestamp when the 24h-pre-unlock reminder email was sent. NULL = not yet sent (or not applicable because no gate). Prevents duplicate sends.';

-- Partial index — most providers will not have a gate set, so we only
-- index the ones that do. Used by the reminder cron.
CREATE INDEX IF NOT EXISTS providers_patient_access_from_idx
  ON providers (patient_access_from)
  WHERE patient_access_from IS NOT NULL;
