-- Two-factor safeguard for the /work/[slug] employer flow.
--
-- Factor 1 (already live): the slug URL is validated by /api/employer-lookup
-- against the employers table (active + under monthly cap).
--
-- Factor 2 (this migration): the worker's identity (first name + last name
-- + DOB) must match a row in employer_employees for that employer_id.
-- Employer HR uploads a CSV roster of authorised workers ahead of go-live.
-- Match logic runs server-side during consult creation; a mismatch blocks
-- the consult and shows the worker a soft fallback ("continue as a paying
-- patient").
--
-- Also adds two ACC45-notification fields to the employers table so that
-- consults created via /work/[slug] can auto-populate consultations.acc_employer,
-- .acc_employer_address, and .acc_employer_phone without asking the worker
-- (we already know their employer — that's the whole point of this flow).
--
-- Rationale for require_employee_match defaulting TRUE:
--   Early B2B partners (Cloudy Bay, Sanford, Thornhill, Kono, Top 10) will
--   maintain rosters. Sets the safer default. Admin can toggle FALSE for
--   partners who don't want the roster maintenance burden (URL-only flow
--   still works for them; slug + monthly cap contain abuse).

ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS require_employee_match boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS site_address           text,
  ADD COLUMN IF NOT EXISTS site_phone             text;

-- Fast lookup on the identity-match query used by every /work/[slug]
-- consult creation. Case-insensitive comparison via lower() so a worker
-- entering 'John' still matches a roster row for 'john'. DOB is stored
-- as a date so equality lookup is direct.
CREATE INDEX IF NOT EXISTS employer_employees_match_idx
  ON employer_employees (employer_id, lower(first_name), lower(last_name), dob);
