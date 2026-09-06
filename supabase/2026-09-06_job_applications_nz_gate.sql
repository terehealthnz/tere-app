-- Add geo + NZ-eligibility fields to job_applications so admin can filter
-- out-of-scope applicants at a glance and the API can hard-reject
-- unaffirmed foreign submissions.
--
-- applicant_country_code: 2-letter ISO code from Vercel/CF geo header,
--                         captured at insert. Not authoritative (VPN, etc.)
--                         but the honest signal we can capture cheaply.
-- nz_eligibility_confirmed: applicant actively ticked "I'm registered
--                         (or eligible for registration) with a NZ
--                         health regulator". If false, API rejects.

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS applicant_country_code TEXT,
  ADD COLUMN IF NOT EXISTS nz_eligibility_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Historical rows predate the checkbox — mark them affirmed so the admin
-- queue doesn't show a blanket amber flag on all pre-migration applicants.
UPDATE job_applications
  SET nz_eligibility_confirmed = true
  WHERE applied_at < now() - interval '1 hour';
