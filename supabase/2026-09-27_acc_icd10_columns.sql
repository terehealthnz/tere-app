-- ACC ICD-10 columns on consultations
-- ACC now uses ICD-10-AM codes (HL7 NZ CodeSystem acc-icd10) for ACC45
-- claim lodgement. Previously we stored only the Read code (acc_read_code);
-- keep that column for legacy rows + as a secondary breadcrumb, but the
-- ICD-10 code is now the mandatory field on the wire to ACC.
--
-- Format: no-dot (e.g. 'S9340' not 'S93.40'), validated server-side against
-- the 12,494-code whitelist in api/_acc-icd10-codes.js at write time.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS acc_icd10_code        text,
  ADD COLUMN IF NOT EXISTS acc_icd10_description text;

COMMENT ON COLUMN consultations.acc_icd10_code IS
  'ACC ICD-10-AM diagnosis code (HL7 NZ acc-icd10 CodeSystem, no-dot format e.g. S9340). Required on the wire for ACC45 lodgement. Populated by AI at note-generation OR by provider in ConvertToAccModal. Validated against the 12,494-code whitelist server-side.';

COMMENT ON COLUMN consultations.acc_icd10_description IS
  'Plain-English description of acc_icd10_code as it appears in the HL7 NZ acc-icd10 CodeSystem. Auto-filled from the whitelist when the code is set; never trust an AI-supplied description.';
