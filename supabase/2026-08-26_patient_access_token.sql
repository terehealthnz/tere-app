-- Pen-test M-4/M-5 fix — patient session token for anon patient endpoints.
--
-- Anon patient-facing endpoints (patient-consult, patient-flags, patient-upload,
-- consents, confirm-waiting, patient-support) currently take consultation_id
-- in the request body and trust it based on UUID unguessability. That's weak:
--   - UUIDs leak into URLs, session storage, PostMessage, Referer headers,
--     3rd-party logs, and Vercel/Cloudflare access logs.
--   - Once an attacker learns any patient's consultation UUID, they can
--     read/write against that consult indefinitely (no expiry, no revoke).
--
-- Fix: mint a 256-bit random token at consult creation, return it to the
-- patient client (stored in sessionStorage), and require it as
-- X-Patient-Token on every subsequent patient-side write. Server helper
-- resolvePatientToken() exchanges token -> consultation_id at the boundary.
-- Token is scoped to a single consultation and expires 24 h after creation.
--
-- This migration only adds the column + index. The endpoint + client
-- migration ships in the same commit; existing consultations get their token
-- lazily on next PATCH (backfill NULL is fine — anon endpoints accept both
-- token OR consultation_id during the transition window).

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS patient_access_token TEXT;

-- Unique when present. Nulls allowed for pre-existing rows (transition).
CREATE UNIQUE INDEX IF NOT EXISTS consultations_patient_access_token_uniq
  ON consultations (patient_access_token)
  WHERE patient_access_token IS NOT NULL;

-- No RLS change needed — the token is only exchanged server-side via
-- service_role in resolvePatientToken(); anon clients never SELECT this
-- column directly.

COMMENT ON COLUMN consultations.patient_access_token IS
  'Server-minted 256-bit token used to authenticate anon patient writes
   against this consultation. Set at INSERT by /api/create-consultation,
   returned to client, sent back as X-Patient-Token header on all
   patient-facing writes. See api/_lib/patient-token.js.';
