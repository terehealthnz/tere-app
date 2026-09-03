-- GP handover / continuity guarantee at consult close (task #421).
-- Every consult must explicitly close-the-loop or hand over to a named GP
-- (or acknowledge no-GP + patient told). HDC Right 4(4) evidence — quality
-- and continuity of care. Especially load-bearing for the rural cohort
-- where many patients have no regular GP.
--
-- Also feeds the Section 22F FHIR bundle: when a handover_target is set,
-- outbound HL7 GP-letter generation knows where to send it.

-- 2026-09-03 · continuity_handover

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS continuity_disposition   text,       -- CHECK below
  ADD COLUMN IF NOT EXISTS continuity_gp_name       text,
  ADD COLUMN IF NOT EXISTS continuity_gp_practice   text,
  ADD COLUMN IF NOT EXISTS continuity_gp_hpi        text,
  ADD COLUMN IF NOT EXISTS continuity_notes         text,
  ADD COLUMN IF NOT EXISTS continuity_captured_at   timestamptz,
  ADD COLUMN IF NOT EXISTS continuity_patient_told  boolean;

-- Disposition values kept as free-text CHECK for cheap forward-compat.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_continuity_disposition_check'
  ) THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_continuity_disposition_check
      CHECK (continuity_disposition IS NULL OR continuity_disposition IN (
        'gp_letter_sent',
        'gp_letter_to_send',
        'closed_no_followup_needed',
        'handover_to_specialist',
        'patient_no_gp_told_to_enrol',
        'patient_declined_gp_disclosure'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS consultations_continuity_captured_at_idx
  ON consultations (continuity_captured_at)
  WHERE continuity_captured_at IS NOT NULL;

COMMENT ON COLUMN consultations.continuity_disposition IS
  'Task #421 — every consult must record how continuity of care is handed
   off. Required for finalise. HDC Right 4(4) evidence.';
