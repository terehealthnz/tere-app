-- Day-after thank-you email + testimonial / feedback feature.
--
-- 1. Adds consultations.thank_you_sent_at so the daily cron picks up a
--    consult once (idempotent) and never spams.
-- 2. New patient_feedback table: one row per consult, captures the
--    thumbs-up / thumbs-down response, free-text, display name, publish
--    consent, moderation status + cross-reference to the support ticket
--    when the patient routed to a complaint.
--
-- All writes go through server endpoints under service_role; RLS denies
-- anon + authenticated so the table is service-role-only.
--
-- Idempotent. Safe to re-run.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS thank_you_sent_at timestamptz;

-- Partial index tuned for the daily cron scan. It only indexes rows that
-- haven't been emailed yet and aren't sandbox, so stays small forever.
CREATE INDEX IF NOT EXISTS consultations_thank_you_due
  ON consultations (notes_finalised_at)
  WHERE thank_you_sent_at IS NULL
    AND is_practice = false
    AND notes_finalised_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS patient_feedback (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id    uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  rating             text NOT NULL CHECK (rating IN ('positive','negative')),
  testimonial_text   text,
  patient_display_name text,
  allow_publish      boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','complaint')),
  support_ticket_id  uuid REFERENCES patient_support_requests(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  moderated_at       timestamptz,
  moderated_by       uuid REFERENCES providers(id) ON DELETE SET NULL,
  moderation_notes   text
);

CREATE UNIQUE INDEX IF NOT EXISTS patient_feedback_one_per_consult
  ON patient_feedback (consultation_id);

CREATE INDEX IF NOT EXISTS patient_feedback_status
  ON patient_feedback (status, created_at DESC);

CREATE INDEX IF NOT EXISTS patient_feedback_public
  ON patient_feedback (status, allow_publish, created_at DESC);

ALTER TABLE patient_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_feedback_deny_public ON patient_feedback;
CREATE POLICY patient_feedback_deny_public
  ON patient_feedback
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

REVOKE ALL ON patient_feedback FROM anon, authenticated;
GRANT ALL ON patient_feedback TO service_role;
