-- Applicant-driven reference intake — the "give us your referees" step.
--
-- Flow (typically triggered after interview completes):
--   1. Admin clicks "Ask applicant for referees" → server creates a row
--      here and emails the applicant a token'd link to
--      /references/provide/<token>.
--   2. Applicant lands on the page, enters 2-3 referees (name, email,
--      phone, relationship).
--   3. On submit, server sets status='submitted' AND for each referee
--      creates a job_references row + immediately triggers the existing
--      referee-request email flow. Fully automated from that point.
--
-- One intake per application (unique application_id). If admin wants to
-- re-ask, cancel the existing intake first.

CREATE TABLE IF NOT EXISTS applicant_reference_intakes (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id              uuid NOT NULL UNIQUE REFERENCES job_applications(id) ON DELETE CASCADE,
  requested_by_provider_id    uuid REFERENCES providers(id) ON DELETE SET NULL,
  request_token               text NOT NULL UNIQUE,
  min_referees                integer NOT NULL DEFAULT 2,
  max_referees                integer NOT NULL DEFAULT 3,
  status                      text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','submitted','cancelled')),
  requested_at                timestamptz NOT NULL DEFAULT now(),
  submitted_at                timestamptz,
  submitted_ip                text,
  submitted_user_agent        text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applicant_reference_intakes_status_idx
  ON applicant_reference_intakes (status);

-- All access via /api/job-applications (service role bypasses RLS).
ALTER TABLE applicant_reference_intakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON applicant_reference_intakes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.applicant_reference_intakes_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS applicant_reference_intakes_touch ON applicant_reference_intakes;
CREATE TRIGGER applicant_reference_intakes_touch
  BEFORE UPDATE ON applicant_reference_intakes
  FOR EACH ROW EXECUTE FUNCTION public.applicant_reference_intakes_touch_updated_at();

-- Track that a job_references row came from an applicant-driven intake vs.
-- admin-typed. Useful for admin display + future analytics.
ALTER TABLE job_references
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin_typed'
    CHECK (source IN ('admin_typed','applicant_intake'));
