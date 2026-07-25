-- Auto-match inbound radiology reports to patients by NHI, and surface as
-- imaging records on the patient chart.
--
-- Flow: /api/telnyx-inbound-fax uploads the PDF → calls Bedrock (Claude
-- Sonnet with vision) → extracts { nhi, patient_name, dob, study_type,
-- study_date, body_part, clinical_impression, urgency } → looks up
-- patients by NHI → auto-populates patient_id + extracted fields on the
-- radiology_reports row. Clinician still confirms + signs off in the UI.

-- 1. Extend radiology_reports with the AI-extracted fields so the report row
--    has enough context for the patient chart imaging list.
ALTER TABLE radiology_reports
  ADD COLUMN IF NOT EXISTS patient_nhi           text,
  ADD COLUMN IF NOT EXISTS patient_name_extracted text,
  ADD COLUMN IF NOT EXISTS patient_dob_extracted  date,
  ADD COLUMN IF NOT EXISTS study_type            text,
  ADD COLUMN IF NOT EXISTS study_date            date,
  ADD COLUMN IF NOT EXISTS body_part             text,
  ADD COLUMN IF NOT EXISTS clinical_impression   text,
  ADD COLUMN IF NOT EXISTS urgency               text
    CHECK (urgency IS NULL OR urgency IN ('normal','routine','urgent','critical')),
  ADD COLUMN IF NOT EXISTS extraction_confidence text
    CHECK (extraction_confidence IS NULL OR extraction_confidence IN ('high','medium','low','failed')),
  ADD COLUMN IF NOT EXISTS extracted_at          timestamptz;

CREATE INDEX IF NOT EXISTS idx_radiology_reports_nhi
  ON radiology_reports(patient_nhi) WHERE patient_nhi IS NOT NULL;

-- 2. Ensure patients.nhi column + unique index on non-null NHI values.
--    (Column may already exist depending on which migration history landed;
--    ADD COLUMN IF NOT EXISTS is a safe no-op.)
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS nhi text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_nhi_unique
  ON patients(upper(nhi)) WHERE nhi IS NOT NULL;
