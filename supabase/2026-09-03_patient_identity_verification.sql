-- Patient identity verification (task #426).
-- Confirms the person on video is the NHI holder. First-cut approach:
-- patient uploads a photo ID (driver's licence / passport) at consult
-- start; provider does a visual compare against the on-camera face and
-- records the attestation. Full AI face-compare comes later.
--
-- Fields live on consultations directly so the audit trail is single-row.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS id_verification_status       text,   -- CHECK below
  ADD COLUMN IF NOT EXISTS id_verification_method       text,   -- CHECK below
  ADD COLUMN IF NOT EXISTS id_verification_document_id  uuid,   -- FK loose to patient_documents
  ADD COLUMN IF NOT EXISTS id_verification_document_type text,  -- 'drivers_licence' | 'passport' | 'other'
  ADD COLUMN IF NOT EXISTS id_verification_provider_id  uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_verification_provider_name text,
  ADD COLUMN IF NOT EXISTS id_verification_at           timestamptz,
  ADD COLUMN IF NOT EXISTS id_verification_notes        text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_id_verification_status_check') THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_id_verification_status_check
      CHECK (id_verification_status IS NULL OR id_verification_status IN (
        'verified_photo_id',
        'verified_kba',
        'verified_repeat_patient',
        'verified_carer_present',
        'unverified_declined_by_patient',
        'unverified_no_id_available',
        'unverified_uncertain_match'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_id_verification_method_check') THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_id_verification_method_check
      CHECK (id_verification_method IS NULL OR id_verification_method IN (
        'photo_id_upload',
        'photo_id_camera',
        'knowledge_based',
        'repeat_visual',
        'other'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS consultations_id_verified_at_idx
  ON consultations (id_verification_at)
  WHERE id_verification_at IS NOT NULL;

COMMENT ON COLUMN consultations.id_verification_status IS
  'Task #426 — provider attestation that the on-camera person matches the
   NHI holder. Recorded per consult. Prevents wrong-patient records +
   NHI-borrow prescribing fraud.';
