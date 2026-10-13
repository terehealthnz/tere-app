-- Resend bookkeeping on prescriptions. Separate from redirected_at (which
-- tracks pharmacy-change redirects); resend keeps same pharmacy but reissues
-- the PDF with corrected patient/provider details (e.g. patient address added
-- after Wairau Pharmacy flagged a missing field).
--
-- Nullable, zero-default — existing rows don't need a backfill.
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS last_resent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_resent_by_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resend_count      integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN prescriptions.last_resent_at    IS 'Last time /api/resend-prescription rebuilt + re-sent this script to the same pharmacy. Nullable.';
COMMENT ON COLUMN prescriptions.last_resent_by_id IS 'Provider who triggered the most recent resend. FK → providers.id.';
COMMENT ON COLUMN prescriptions.resend_count      IS 'Count of resends (not counting original send or pharmacy redirects).';
