-- Provider competence-to-roster credentialling (task #435).
-- Beyond "registered and in-scope" — a defined clinical-competence-to-roster
-- gate before a provider is unlocked for solo emergency-telehealth triage.
-- MCNZ + HDC expect this level of scope-of-clinical-practice definition
-- for a service seeing undifferentiated acute presentations.

-- 2026-09-03 · provider_competency

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS competency_status text,
  ADD COLUMN IF NOT EXISTS competency_notes text,
  ADD COLUMN IF NOT EXISTS competency_assessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS competency_assessed_by uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS probation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS probation_min_supervised_consults int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS probation_supervised_completed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scope_of_clinical_practice text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'providers_competency_status_check') THEN
    ALTER TABLE providers
      ADD CONSTRAINT providers_competency_status_check
      CHECK (competency_status IS NULL OR competency_status IN (
        'onboarding',          -- initial state; no clinical roster access
        'probationary',        -- can consult, but every consult is supervised
        'full_roster',         -- solo rostering permitted
        'restricted',          -- limited scope (e.g. no controlled prescribing)
        'suspended'            -- temporary hold after incident / concern
      ));
  END IF;
END $$;

-- Per-competency-domain sign-off. Adds a row per (provider, competency).
-- Assessor + date + evidence pointer. Deep case-scenario library is v2 —
-- this is enough to record who signed off what, when, and against what.
CREATE TABLE IF NOT EXISTS provider_competencies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id          uuid REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  competency_key       text NOT NULL,       -- e.g. 'video_consult_undifferentiated_acute', 'controlled_prescribing_c'
  competency_label     text NOT NULL,
  status               text NOT NULL DEFAULT 'not_assessed' CHECK (status IN (
                         'not_assessed','in_training','competent','not_competent'
                       )),
  assessed_at          timestamptz,
  assessed_by          uuid REFERENCES providers(id) ON DELETE SET NULL,
  assessor_name        text,
  evidence_notes       text,
  next_review_due_at   timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, competency_key)
);

CREATE INDEX IF NOT EXISTS provider_competencies_status_idx ON provider_competencies (provider_id, status);

ALTER TABLE provider_competencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON provider_competencies FROM anon;
REVOKE ALL ON provider_competencies FROM authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON provider_competencies TO service_role;
CREATE POLICY provider_competencies_service_role_all ON provider_competencies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION provider_competencies_touch_updated_at()
RETURNS trigger AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS provider_competencies_touch_updated_at_trg ON provider_competencies;
CREATE TRIGGER provider_competencies_touch_updated_at_trg
  BEFORE UPDATE ON provider_competencies
  FOR EACH ROW EXECUTE FUNCTION provider_competencies_touch_updated_at();

COMMENT ON TABLE provider_competencies IS
  'Task #435 — per-domain competency sign-off. Full-roster status on
   providers gates on all required competencies being assessed as competent.';
