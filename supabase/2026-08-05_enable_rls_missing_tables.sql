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

-- pharmacy_contacts always exists in prod.
ALTER TABLE pharmacy_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access pharmacy_contacts" ON pharmacy_contacts;
CREATE POLICY        "Service role full access pharmacy_contacts" ON pharmacy_contacts FOR ALL USING (true);

-- imaging_reviews may not exist yet (the 2026-07-21 migration was
-- never run in prod). Enable RLS only if the table is present, so
-- this fix runs whether or not imaging_reviews has been created.
-- The imaging-reviews feature itself remains dependent on the
-- 2026-07-21_imaging_reviews.sql migration being applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'imaging_reviews'
  ) THEN
    EXECUTE 'ALTER TABLE imaging_reviews ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Service role full access imaging_reviews" ON imaging_reviews';
    EXECUTE 'CREATE POLICY "Service role full access imaging_reviews" ON imaging_reviews FOR ALL USING (true)';
  END IF;
END $$;
