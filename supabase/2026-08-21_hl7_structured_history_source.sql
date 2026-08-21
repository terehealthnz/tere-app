-- HL7 GP-letter → structured history mapping (task #231).
--
-- When an inbound HL7 message auto-files to a patient chart (strong NHI
-- match, see api/_hl7-inbound.js), any AL1 (allergy) and DG1 (diagnosis)
-- segments now insert into patient_allergens / patient_conditions with
-- source_hl7_message_id pointing back to the original message. Providers
-- get one-click audit from the chart entry to the raw HL7 that produced it.
--
-- Dedup rule: AL1 skipped if the patient already has a case-insensitive
-- match on allergen text. DG1 skipped if the patient already has the same
-- ICD-10 code (or condition text when no code). Never overwrites existing
-- rows — HL7 import only adds, never mutates provider-entered data.

ALTER TABLE patient_allergens
  ADD COLUMN IF NOT EXISTS source_hl7_message_id uuid
    REFERENCES inbound_hl7_messages(id) ON DELETE SET NULL;

ALTER TABLE patient_conditions
  ADD COLUMN IF NOT EXISTS source_hl7_message_id uuid
    REFERENCES inbound_hl7_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS patient_allergens_source_hl7_idx
  ON patient_allergens (source_hl7_message_id)
  WHERE source_hl7_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS patient_conditions_source_hl7_idx
  ON patient_conditions (source_hl7_message_id)
  WHERE source_hl7_message_id IS NOT NULL;

COMMENT ON COLUMN patient_allergens.source_hl7_message_id IS
  'When populated, this allergen was imported from an inbound HL7 AL1 segment. NULL = provider-entered.';
COMMENT ON COLUMN patient_conditions.source_hl7_message_id IS
  'When populated, this condition was imported from an inbound HL7 DG1 segment. NULL = provider-entered.';
