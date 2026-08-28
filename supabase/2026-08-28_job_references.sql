-- Job references — emailed reference request flow.
--
-- Admin enters referee contact details in the applicant panel and clicks
-- "Send request". Referee gets a tokenised email link to a structured
-- web form (Would you rehire? Strengths? Concerns? Overall recommendation?).
-- Responses land back in this table and render in the applicant panel.
--
-- Applicant-side referee entry can be added later (extend the apply form
-- with optional referee fields) but the admin-driven MVP covers Tere's
-- current hiring pace.

CREATE TABLE IF NOT EXISTS job_references (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id              uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  created_by_provider_id      uuid REFERENCES providers(id) ON DELETE SET NULL,

  -- Who we're asking
  referee_name                text NOT NULL,
  referee_email               text NOT NULL,
  referee_phone               text,
  referee_relationship        text,             -- as seen by admin at request time

  -- Access
  request_token               text NOT NULL UNIQUE,   -- URL-safe (~32 chars)

  -- Referee's response (all nullable until they submit)
  responded_at                timestamptz,
  responded_ip                text,
  responded_user_agent        text,
  confirmed_relationship      text,             -- their version — can differ
  confirmed_dates             text,
  would_rehire                text CHECK (would_rehire IS NULL OR would_rehire IN ('yes','with_reservation','no','unable_to_say')),
  strengths                   text,
  concerns                    text,
  overall_recommendation      text CHECK (overall_recommendation IS NULL OR overall_recommendation IN ('strong','positive','neutral','negative')),
  additional_comments         text,

  status                      text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','responded','declined','cancelled')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_references_application_idx ON job_references (application_id);
CREATE INDEX IF NOT EXISTS job_references_status_idx      ON job_references (status);

-- Lock down — all access via /api/job-applications (service role).
ALTER TABLE job_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON job_references FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.job_references_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_references_touch ON job_references;
CREATE TRIGGER job_references_touch
  BEFORE UPDATE ON job_references
  FOR EACH ROW EXECUTE FUNCTION public.job_references_touch_updated_at();
