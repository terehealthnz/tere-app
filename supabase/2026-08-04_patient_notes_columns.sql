-- Two provider-only free-text notes columns on patients — persistent across
-- consults. Distinct from the SOAP consultation notes (which are per-consult).
--
--   admin_notes  — scheduling / billing / administrative context
--   doctor_notes — cross-consult clinical observations that don't belong in
--                  the specific consult's SOAP note (e.g. "difficult
--                  historian", "prefers phone consults", "known to service")
--
-- Both are provider-only. The /api/patients anon path (used by the public
-- triage flow) explicitly excludes these columns from its allowlist so a
-- patient can't set their own doctor_notes = "Please give me methadone".

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS admin_notes  text,
  ADD COLUMN IF NOT EXISTS doctor_notes text;

COMMENT ON COLUMN patients.admin_notes IS
  'Provider-only free-text notes for scheduling / billing / admin context. Never anon-writable.';
COMMENT ON COLUMN patients.doctor_notes IS
  'Provider-only cross-consult clinical observations. Distinct from per-consult SOAP notes. Never anon-writable.';
