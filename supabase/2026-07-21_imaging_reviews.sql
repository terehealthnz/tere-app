-- Retrospective imaging result review workflow (QI, RCPA-aligned).
--
-- Every radiology referral that leaves Tere (delivery_status='sent') needs a
-- provider to log a review once the report arrives back by email. Reviews are
-- peer-reviewable: any active Tere provider can sign one off, not just the
-- ordering clinician. Kept in a separate table so we can support multiple
-- amendments / re-reviews later without bloating radiology_referrals.
--
-- Row lifecycle:
--   1. radiology_referrals row inserted with delivery_status='sent'
--      → trigger creates a pending imaging_reviews row (reviewer_provider_id NULL)
--   2. Provider opens the review panel, writes a comment + decision, submits
--      → reviewer_provider_id, decision, comment, reviewed_at populated
--      → /api/imaging-review sends the outbound patient email (Resend)
--      → patient_email_sent_at set (also used as idempotency guard)
--
-- Run in Supabase Studio → SQL editor before the api/*.js changes ship.

CREATE TABLE IF NOT EXISTS imaging_reviews (
  id                     uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_id            uuid        NOT NULL REFERENCES radiology_referrals(id) ON DELETE CASCADE,
  consultation_id        uuid        REFERENCES consultations(id) ON DELETE SET NULL,
  reviewer_provider_id   uuid        REFERENCES providers(id) ON DELETE SET NULL,
  reviewer_name          text,
  decision               text        CHECK (decision IN ('normal','concerning')),
  comment                text,
  custom_email_body      text,
  reviewed_at            timestamptz,
  patient_email_sent_at  timestamptz,
  created_at             timestamptz DEFAULT now()
);

-- One pending review per referral. Once reviewed_at is set, another reviewer
-- can still create a follow-up review by re-running the flow manually.
CREATE UNIQUE INDEX IF NOT EXISTS imaging_reviews_one_pending_per_referral
  ON imaging_reviews (referral_id) WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS imaging_reviews_pending_idx
  ON imaging_reviews (created_at) WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS imaging_reviews_reviewer_idx
  ON imaging_reviews (reviewer_provider_id, reviewed_at);

-- Trigger: auto-create pending review when a referral reaches delivery_status='sent'.
-- Fires on both INSERT (fast path — non-supervised orders) and UPDATE (approve-draft
-- path — supervised orders flip delivery_status to 'sent' after countersignature).
-- Idempotent via the unique partial index above; ON CONFLICT DO NOTHING absorbs
-- the race where both INSERT and UPDATE would fire during the same session.
CREATE OR REPLACE FUNCTION imaging_reviews_autocreate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.delivery_status = 'sent' THEN
    INSERT INTO imaging_reviews (referral_id, consultation_id)
    VALUES (NEW.id, NEW.consultation_id)
    ON CONFLICT (referral_id) WHERE reviewed_at IS NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_imaging_reviews_autocreate_ins ON radiology_referrals;
CREATE TRIGGER trg_imaging_reviews_autocreate_ins
  AFTER INSERT ON radiology_referrals
  FOR EACH ROW EXECUTE FUNCTION imaging_reviews_autocreate();

DROP TRIGGER IF EXISTS trg_imaging_reviews_autocreate_upd ON radiology_referrals;
CREATE TRIGGER trg_imaging_reviews_autocreate_upd
  AFTER UPDATE OF delivery_status ON radiology_referrals
  FOR EACH ROW
  WHEN (NEW.delivery_status = 'sent' AND (OLD.delivery_status IS DISTINCT FROM NEW.delivery_status))
  EXECUTE FUNCTION imaging_reviews_autocreate();

-- Backfill: create a pending review for every already-sent referral that
-- doesn't have one yet. Safe to re-run.
INSERT INTO imaging_reviews (referral_id, consultation_id)
SELECT r.id, r.consultation_id
  FROM radiology_referrals r
  LEFT JOIN imaging_reviews ir ON ir.referral_id = r.id
 WHERE r.delivery_status = 'sent'
   AND ir.id IS NULL;
