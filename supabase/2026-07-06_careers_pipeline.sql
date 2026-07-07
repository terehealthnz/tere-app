-- ─────────────────────────────────────────────────────────────────────────────
-- Careers pipeline: applicants → status transitions → onboarding
-- Run this whole file in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) job_applications: one row per submitted application.
CREATE TABLE IF NOT EXISTS job_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_listing_id  uuid REFERENCES job_listings(id) ON DELETE SET NULL,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text NOT NULL,
  phone           text,
  cover_note      text,
  cv_url          text,        -- Supabase Storage public URL, set by upload flow
  cv_filename     text,
  status          text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','reviewing','interview','offer','hired','rejected','withdrawn')),
  source          text,        -- optional free-form: how did they find us?
  applied_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  hired_at        timestamptz,
  rejected_at     timestamptz,
  archived        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS job_applications_status_idx      ON job_applications (status);
CREATE INDEX IF NOT EXISTS job_applications_applied_at_idx  ON job_applications (applied_at DESC);
CREATE INDEX IF NOT EXISTS job_applications_job_listing_idx ON job_applications (job_listing_id);
CREATE INDEX IF NOT EXISTS job_applications_email_idx       ON job_applications (email);

-- 2) application_notes: admin-only running notes on each applicant.
CREATE TABLE IF NOT EXISTS application_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  author_id      uuid REFERENCES providers(id) ON DELETE SET NULL,
  author_name    text,
  note           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_notes_app_idx ON application_notes (application_id, created_at DESC);

-- 3) onboarding_steps: fixed checklist rows inserted when status transitions to 'hired'.
-- The 'key' field identifies each step so the client can render icons / grouping.
CREATE TABLE IF NOT EXISTS onboarding_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  step_key       text NOT NULL,
  label          text NOT NULL,
  sort_order     int  NOT NULL DEFAULT 0,
  done           boolean NOT NULL DEFAULT false,
  done_at        timestamptz,
  done_by        uuid REFERENCES providers(id) ON DELETE SET NULL,
  done_by_name   text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_steps_app_idx ON onboarding_steps (application_id, sort_order);

-- 4) RLS: server-mediated (service_role bypasses). Only enable RLS with narrow
-- anon INSERT for the public apply flow; everything else provider-only via API.
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_steps   ENABLE ROW LEVEL SECURITY;

-- Anonymous public apply — INSERT only, no read.
DROP POLICY IF EXISTS "anon can insert applications" ON job_applications;
CREATE POLICY "anon can insert applications"
  ON job_applications FOR INSERT TO anon WITH CHECK (true);

-- (No other anon policies — all reads/updates go via /api/job-applications
-- using the service_role client, which bypasses RLS.)

-- 5) Storage bucket for CV uploads. Public read (so admin can open CV links).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cvs', 'cvs', true, 5242880,  -- 5 MB
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies for the cvs bucket.
DROP POLICY IF EXISTS "Public can upload cvs" ON storage.objects;
CREATE POLICY "Public can upload cvs"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'cvs');

DROP POLICY IF EXISTS "Public can read cvs" ON storage.objects;
CREATE POLICY "Public can read cvs"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'cvs');
