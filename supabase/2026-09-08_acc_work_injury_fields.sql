-- Add work-injury fields to consultations for ACC45 completeness.
-- Trigger: intake now asks "was this a work injury?" and if yes, collects
-- employer name + address + phone (required for ACC45 Sched 1 employer
-- notification and for ACC to verify the claim with the employer).
--
-- Existing `acc_employer` column (schema.sql:31) already stores the name;
-- this migration adds the two missing sibling fields plus the toggle.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS is_work_injury        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acc_employer_address  text,
  ADD COLUMN IF NOT EXISTS acc_employer_phone    text;

-- No index required — fields are only read as part of consult-level ACC
-- audit bundle, keyed by consultation_id (already indexed via PK).
