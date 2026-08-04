-- Fix Supabase security alert: RLS not enabled on two public tables.
--
-- pharmacy_contacts and imaging_reviews were created without
-- ENABLE ROW LEVEL SECURITY, meaning any client holding the anon key
-- could read, write, or delete them.
--
-- Both tables are only ever accessed server-side via service_role
-- (service_role bypasses RLS regardless), so enabling RLS with no
-- anon policy blocks anon access without breaking any real code path.
--
-- Idempotent: safe to re-run.

ALTER TABLE pharmacy_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE imaging_reviews   ENABLE ROW LEVEL SECURITY;

-- Explicit service-role policies so intent is legible in the schema.
-- (service_role bypasses RLS regardless, but the policy documents that
-- the server is the intended writer.)
DROP POLICY IF EXISTS "Service role full access pharmacy_contacts" ON pharmacy_contacts;
CREATE POLICY        "Service role full access pharmacy_contacts" ON pharmacy_contacts FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access imaging_reviews" ON imaging_reviews;
CREATE POLICY        "Service role full access imaging_reviews" ON imaging_reviews FOR ALL USING (true);
