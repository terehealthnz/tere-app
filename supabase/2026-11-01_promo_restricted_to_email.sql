-- Patient-restricted promo codes.
--
-- Codes issued as compensation ("sorry about today's 5h wait") should only
-- be redeemable by the patient they were issued to — otherwise anyone who
-- hears the code could burn Alexandra's 50%-off before she does.
--
-- Nullable so existing promo codes (SPRING50 etc.) stay open to all patients.
-- Case-insensitive match handled in validateAndCompute() because
-- consultations.patient_email stores whatever the patient typed, which can
-- vary in case.

ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS restricted_to_email TEXT;

CREATE INDEX IF NOT EXISTS idx_promo_codes_restricted_email
  ON promo_codes (lower(restricted_to_email))
  WHERE restricted_to_email IS NOT NULL;

COMMENT ON COLUMN promo_codes.restricted_to_email IS
  'If set, only redemptions where consultations.patient_email matches (case-insensitive) are allowed. Used by admin-issued compensation codes.';
