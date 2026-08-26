-- Pen-test P2 findings A1 + A2: hash bearer tokens at rest.
--
-- Two tokens are currently stored PLAINTEXT in the database:
--   consultations.patient_access_token — 24 h TTL, grants patient write
--     access to their consult via X-Patient-Token header
--   consultation_tokens.token — 30 day TTL, grants read access to
--     /my-consultation/:token (post-consult summary + prescriptions)
--
-- Threat model: any DB read (SQL injection, service-role key leak, PITR
-- restore handed to a contractor, Supabase support ticket, RO backup dump)
-- yields live bearer tokens for the entire remaining TTL. Same pattern as
-- passwords in the 1980s — solved the same way: store SHA-256(token),
-- compare hash-to-hash. Plaintext token exists only in the response body
-- to the original mint call, and only in the patient client's
-- sessionStorage / email link. DB never has it.
--
-- Migration strategy:
--   1. Add token_hash columns alongside the plaintext columns.
--   2. Backfill token_hash = sha256(token) for all rows where token is set.
--   3. New writes populate token_hash only; endpoint code compares hash.
--   4. Follow-up migration (after 24 h for patient_access_token, 30 days
--      for consultation_tokens) drops the plaintext columns.
--
-- This migration is Step 1+2. Step 3 (endpoint code) ships in the same
-- commit. Step 4 is a scheduled follow-up.

-- Step 1: add hash columns.
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS patient_access_token_hash TEXT;

ALTER TABLE consultation_tokens
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Step 2: backfill from existing plaintext values.
-- pgcrypto's digest() gives us SHA-256 in bytea, encode() → hex, matching
-- the Node.js `createHash('sha256').update(t).digest('hex')` shape.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE consultations
SET patient_access_token_hash = encode(digest(patient_access_token, 'sha256'), 'hex')
WHERE patient_access_token IS NOT NULL
  AND patient_access_token_hash IS NULL;

UPDATE consultation_tokens
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token IS NOT NULL
  AND token_hash IS NULL;

-- Step 3: index the hash for constant-time lookup. Partial unique on hash
-- (matches the existing partial unique on the plaintext column).
CREATE UNIQUE INDEX IF NOT EXISTS consultations_patient_access_token_hash_uniq
  ON consultations (patient_access_token_hash)
  WHERE patient_access_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS consultation_tokens_token_hash_idx
  ON consultation_tokens (token_hash);

COMMENT ON COLUMN consultations.patient_access_token_hash IS
  'SHA-256 hex of patient_access_token. resolvePatientAuth compares hash.
   The plaintext column will be dropped in a follow-up migration once the
   24 h TTL of every currently-active token has passed.';

COMMENT ON COLUMN consultation_tokens.token_hash IS
  'SHA-256 hex of token. Post-consult summary endpoint compares hash.
   The plaintext token column will be dropped in a follow-up migration
   once the 30 day TTL of every currently-active token has passed.';
