-- Add consult_mode to tag Tere GP consultations distinctly from the default
-- acute/urgent-care Tere Health flow. All existing rows become 'acute'. New
-- values set client-side only via sessionStorage flag today (behind
-- /gp-start on tere.co.nz); fuller enrolment-aware wiring lands when the
-- GP product moves out of beta.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS consult_mode TEXT DEFAULT 'acute';

ALTER TABLE consultations
  ADD CONSTRAINT consultations_consult_mode_chk
  CHECK (consult_mode IN ('acute','gp'));

CREATE INDEX IF NOT EXISTS consultations_consult_mode_idx
  ON consultations (consult_mode)
  WHERE consult_mode <> 'acute';
