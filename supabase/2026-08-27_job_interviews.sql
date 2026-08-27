-- Video interviews inside the Tere careers pipeline.
--
-- One row per interview. Links a job_applications row to a LiveKit room
-- (via a short room_key) and mints a URL-safe applicant_join_token so the
-- applicant can join from an emailed link without needing an account.
--
-- Interviewer authenticates as an admin/provider via the standard
-- guardProvider path and joins via /api/job-applications?action=start_interview.
--
-- Scope: MVP. No recording, single interviewer per interview. Multi-interviewer
-- + recording can be added later via extra columns.

CREATE TABLE IF NOT EXISTS job_interviews (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id            uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  interviewer_provider_id   uuid REFERENCES providers(id) ON DELETE SET NULL,
  room_key                  text NOT NULL UNIQUE,
  applicant_join_token      text NOT NULL UNIQUE,
  scheduled_at              timestamptz,             -- null = instant / join-now
  started_at                timestamptz,
  ended_at                  timestamptz,
  status                    text NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled','instant','in_progress','completed','cancelled','no_show')),
  notes                     text DEFAULT '',
  created_by_provider_id    uuid REFERENCES providers(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_interviews_application_idx    ON job_interviews (application_id);
CREATE INDEX IF NOT EXISTS job_interviews_status_idx         ON job_interviews (status);
CREATE INDEX IF NOT EXISTS job_interviews_scheduled_at_idx   ON job_interviews (scheduled_at);

-- Lock down the table — all access is server-mediated via the
-- /api/job-applications endpoint (service role bypasses RLS).
ALTER TABLE job_interviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON job_interviews FROM anon, authenticated;

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.job_interviews_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_interviews_touch ON job_interviews;
CREATE TRIGGER job_interviews_touch
  BEFORE UPDATE ON job_interviews
  FOR EACH ROW EXECUTE FUNCTION public.job_interviews_touch_updated_at();
