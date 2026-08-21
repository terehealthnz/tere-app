-- Extend is_practice to child PHI tables so query filters can stay flat.
--
-- The original 2026-08-03_practice_mode migration added is_practice only to
-- the two top-level tables (consultations, patients) on the theory that
-- everything downstream would join via FK. In practice (pun intended),
-- Supabase PostgREST JOIN filters are fiddly and every insert already
-- knows the parent's is_practice from the request context. Adding the
-- flag inline lets every endpoint do a single .eq('is_practice', mode)
-- instead of maintaining JOINs across N tables.
--
-- All defaults false. No backfill needed because no practice data exists
-- yet. Servers that INSERT into these tables must set is_practice to
-- match the parent consultation/patient — the app-side write paths need
-- an audit alongside this migration.
--
-- Idempotent.

ALTER TABLE patient_allergens
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS patient_allergens_is_practice_idx
  ON patient_allergens (is_practice) WHERE is_practice = true;

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS patient_medications_is_practice_idx
  ON patient_medications (is_practice) WHERE is_practice = true;

ALTER TABLE patient_conditions
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS patient_conditions_is_practice_idx
  ON patient_conditions (is_practice) WHERE is_practice = true;

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS patient_documents_is_practice_idx
  ON patient_documents (is_practice) WHERE is_practice = true;

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS prescriptions_is_practice_idx
  ON prescriptions (is_practice) WHERE is_practice = true;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS messages_is_practice_idx
  ON messages (is_practice) WHERE is_practice = true;

ALTER TABLE inbound_hl7_messages
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS inbound_hl7_messages_is_practice_idx
  ON inbound_hl7_messages (is_practice) WHERE is_practice = true;

ALTER TABLE radiology_referrals
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS radiology_referrals_is_practice_idx
  ON radiology_referrals (is_practice) WHERE is_practice = true;

ALTER TABLE radiology_reports
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS radiology_reports_is_practice_idx
  ON radiology_reports (is_practice) WHERE is_practice = true;

-- Convenience: quick check on how much practice data exists per table.
--   SELECT tablename, count(*) FROM (
--     SELECT 'patient_allergens' tablename, id FROM patient_allergens WHERE is_practice
--     UNION ALL SELECT 'patient_medications', id FROM patient_medications WHERE is_practice
--     ...
--   ) t GROUP BY tablename;
