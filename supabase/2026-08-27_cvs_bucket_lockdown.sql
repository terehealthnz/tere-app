-- Pen-test #322 (2026-08-27) — privatise the `cvs` storage bucket.
--
-- Before this migration:
--   `cvs` bucket was `public: true` with a "Public can read cvs" policy on
--   storage.objects. CV filenames followed a predictable pattern
--   (`${email_slug}/${timestamp}.{pdf,doc,docx}`) so anyone who knew or
--   guessed an applicant's email + submission window could pull their CV.
--
-- After this migration:
--   Bucket is private. Only service_role can read. The API endpoint
--   /api/job-applications GET issues 15-minute signed URLs at read time
--   (see api/_job-applications.js signCvUrl helper, deployed just before
--   running this migration). Admins clicking "Open CV" in the applicant
--   dashboard get a fresh signed link every page load.
--
-- The "Public can upload cvs" INSERT policy is UNCHANGED — the anon apply
-- form on /careers still needs to write to this bucket. The write policy
-- combined with the bucket's allowed_mime_types (PDF / DOC / DOCX) and
-- 5MB size_limit keeps abuse bounded, and privatising the read side stops
-- the personal-data leak.
--
-- Rollback: flip `public` back to true and re-add the "Public can read
-- cvs" policy. Existing rows in job_applications.cv_url still store the
-- public-URL shape; the signCvUrl resolver extracts the storage key and
-- works with both bucket states, so no data cleanup is required either
-- way.

UPDATE storage.buckets SET public = false WHERE id = 'cvs';

DROP POLICY IF EXISTS "Public can read cvs" ON storage.objects;

-- Explicit service-role read (belt-and-braces; service_role bypasses RLS
-- but stating it makes intent clear when someone greps for policies).
DROP POLICY IF EXISTS "Service role can read cvs" ON storage.objects;
CREATE POLICY "Service role can read cvs"
  ON storage.objects FOR SELECT TO service_role
  USING (bucket_id = 'cvs');
