-- Safety-netting as a gated field on consult close (task #417).
-- HDC Right 6 (informed choice) + Right 5(2) (accessible communication)
-- both hinge on documented, patient-comprehensible return advice. Every
-- HDC + coronial telehealth finding I've seen turns on whether the patient
-- knew what to do if things got worse. Making this a required, structured
-- field on close closes the highest-frequency safety failure in telehealth.

-- 2026-09-03 · safety_netting

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS safety_netting_text        text,
  ADD COLUMN IF NOT EXISTS safety_netting_template_id text,
  ADD COLUMN IF NOT EXISTS safety_netting_at          timestamptz;

CREATE INDEX IF NOT EXISTS consultations_safety_netting_at_idx
  ON consultations (safety_netting_at)
  WHERE safety_netting_at IS NOT NULL;

COMMENT ON COLUMN consultations.safety_netting_text
  IS 'Structured return-advice given to patient at consult close. Required
      before finalise. Minimum 40 chars. HDC Right 6 evidence.';
COMMENT ON COLUMN consultations.safety_netting_template_id
  IS 'ID of the template picked from src/lib/safetyNettingTemplates.js, or
      "custom" if the provider wrote it from scratch.';
COMMENT ON COLUMN consultations.safety_netting_at
  IS 'Timestamp the safety-netting field was captured. Distinct from
      completed_at so we can audit that the field was present at close.';
