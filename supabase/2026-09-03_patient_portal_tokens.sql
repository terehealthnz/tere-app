-- Patient portal magic-link tokens (task #358).
--
-- Patients don't have persistent accounts in Tere. To give them
-- self-service access to their own access log + FHIR Bundle export +
-- correction-request submission (HDC Right 6, Privacy Act IPP6/7), we
-- use a magic-link flow: patient enters email → we check they exist as
-- a patient → we email a short-lived signed token → they click → they
-- see their portal for ~30 minutes.
--
-- Security posture:
--   - Tokens are 24-byte base64url, 30-min expiry, single-use.
--   - We only email tokens to addresses that already exist on a
--     patients row (no enumeration signal — same "check your email"
--     response either way).
--   - Rate-limited per IP + per email at the router.
--   - Session state is client-side (token in URL / sessionStorage).

CREATE TABLE IF NOT EXISTS patient_portal_tokens (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash      text NOT NULL UNIQUE,           -- SHA-256 hex of raw token
  patient_email   text NOT NULL,
  patient_id      uuid,                           -- patients.id resolved at request time
  patient_nhi     text,                           -- denormalised for audit-log lookups
  requested_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  used_ip         text,
  requested_ip    text,
  requested_ua    text
);

CREATE INDEX IF NOT EXISTS patient_portal_tokens_email ON patient_portal_tokens(patient_email);
CREATE INDEX IF NOT EXISTS patient_portal_tokens_expires ON patient_portal_tokens(expires_at);
CREATE INDEX IF NOT EXISTS patient_portal_tokens_hash ON patient_portal_tokens(token_hash);

ALTER TABLE patient_portal_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON patient_portal_tokens;
CREATE POLICY "service_role_all" ON patient_portal_tokens FOR ALL USING (true);

COMMENT ON TABLE patient_portal_tokens IS
  'Short-lived (30 min) single-use magic-link tokens for the patient self-service portal. Stores SHA-256 hash of the raw token (never the raw value). Feeds /api/patient-portal request/verify actions.';
