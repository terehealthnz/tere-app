-- 2026-08-09 — Waitlist table lockdown.
--
-- Follow-up to the same-day RLS lockdown migration. The waitlist table
-- had three public policies:
--   "public insert waitlist"  — intentional, patients join the list
--   "public read waitlist"    — leak: any anon can enumerate every signup
--   "public update waitlist"  — leak: any anon can modify any row
--
-- Only insert is legitimate for the anon path. Reads happen via admin
-- panel (server-mediated, service_role) and updates via admin as well.
-- DROP the read + update policies; keep insert. Also add a WITH CHECK
-- to the insert policy to reject obviously bogus rows (empty email).
--
-- Idempotent.

BEGIN;

DROP POLICY IF EXISTS "public read waitlist"   ON waitlist;
DROP POLICY IF EXISTS "public update waitlist" ON waitlist;

-- Recreate insert with a tighter WITH CHECK — the previous policy had
-- no WITH CHECK so anon could insert rows with NULL email etc.
DROP POLICY IF EXISTS "public insert waitlist" ON waitlist;
CREATE POLICY "public insert waitlist" ON waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND length(email) > 3
    AND email LIKE '%@%'
  );

-- Revoke non-insert grants so even a future misconfigured policy
-- can't hand out read/update at the grant layer.
REVOKE ALL      ON waitlist FROM anon, authenticated;
GRANT  INSERT   ON waitlist TO   anon, authenticated;
-- Sequences: if waitlist has an autoincrementing id, insert needs
-- USAGE + SELECT on the sequence. If it's a UUID PK this is a no-op.
-- Wrap in exception handler so it doesn't fail on UUID-PK setups.
DO $$
BEGIN
  BEGIN
    GRANT USAGE, SELECT ON SEQUENCE waitlist_id_seq TO anon, authenticated;
  EXCEPTION WHEN undefined_table THEN
    -- No sequence (UUID or non-serial PK) — nothing to grant
    NULL;
  END;
END $$;

COMMIT;

-- Verification queries (run separately):
--
-- 1. Only insert policy should remain on waitlist:
--    SELECT policyname, roles, cmd, with_check::text
--    FROM pg_policies
--    WHERE tablename='waitlist' ORDER BY policyname;
--
-- 2. anon should have INSERT but NOT SELECT/UPDATE/DELETE:
--    SELECT
--      has_table_privilege('anon','public.waitlist','SELECT') anon_select,
--      has_table_privilege('anon','public.waitlist','INSERT') anon_insert,
--      has_table_privilege('anon','public.waitlist','UPDATE') anon_update,
--      has_table_privilege('anon','public.waitlist','DELETE') anon_delete;
--    Expected: false, true, false, false
