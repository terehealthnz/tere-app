-- Distinguish where a patient document came from. Same table, three
-- provenance values — the ClinicianPatient chart renders them under
-- different sections so providers can tell at a glance what they uploaded
-- themselves vs what the patient shared vs what got captured mid-call.
--
--   'provider_upload' — manual upload by a provider (existing default)
--   'patient_upload'  — reserved for the future patient-portal upload flow
--   'video_capture'   — screenshot grabbed from a live video call
--
-- This is a follow-up to the 2026-08-04_patient_documents migration —
-- run that one first, then this. Safe repeat-run.

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'provider_upload';

-- Split the constraint add so we can drop-and-recreate on repeated runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_documents_source_check'
  ) THEN
    ALTER TABLE patient_documents
      ADD CONSTRAINT patient_documents_source_check
      CHECK (source IN ('provider_upload','patient_upload','video_capture'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS patient_documents_source_idx
  ON patient_documents (patient_id, source, created_at DESC);

COMMENT ON COLUMN patient_documents.source IS
  'Provenance: provider_upload (chart file upload) | video_capture (screenshot from live call) | patient_upload (future patient-portal upload).';
