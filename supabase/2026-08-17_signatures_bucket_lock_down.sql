-- Follow-up to 2026-08-17_signatures_bucket.sql — drops the anon INSERT
-- policy on the signatures bucket once client-side upload has moved to
-- POST /api/providers?action=upload_signature (server-mediated, service_role,
-- admin-authed, PNG-magic-byte validated, 512KB cap).
--
-- ORDER OF OPERATIONS (important):
--   1. Deploy commit that ships the new endpoint + client swap.
--   2. Verify one signature save works end-to-end via the new path.
--   3. THEN run this SQL. If run too early, all signature saves break.

DROP POLICY IF EXISTS "Anon insert signatures" ON storage.objects;

-- Sanity: confirm the public-read policy remains (needed so pharmacies can
-- render signatures inside prescription PDFs).
--   SELECT * FROM pg_policies WHERE tablename='objects' AND policyname LIKE '%signatures%';
