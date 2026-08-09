-- 2026-08-09 — RLS lockdown on all tables that were using the broken
-- "Service role full access" policy pattern.
--
-- BACKGROUND
-- Every existing policy of the form:
--   CREATE POLICY "Service role full access X" ON X FOR ALL USING (true);
-- was written WITHOUT a `TO service_role` clause. Under Postgres, an
-- omitted TO clause defaults to PUBLIC — which in Supabase includes
-- anon + authenticated. Combined with FOR ALL and USING (true), these
-- policies were open read+write to anyone holding the public anon key
-- (which is baked into every browser bundle).
--
-- This migration fixes the class of issue across ALL affected tables
-- by:
--   1. DROPping the buggy over-permissive policy
--   2. REVOKing all privileges from anon + authenticated (belt-and-braces
--      so a future incorrectly-scoped policy still can't hand out access
--      that isn't grantable)
--   3. Relying on service_role bypassing RLS entirely (Supabase behaviour)
--      so backend/API access continues to work unchanged.
--
-- Any table where legitimate anon or authenticated direct-access is
-- required (there should be very few — the platform is server-mediated
-- since the July 2026 refactor) MUST have an explicit, correctly-scoped
-- policy added separately with TO anon / TO authenticated and a
-- non-trivial USING clause.
--
-- Idempotent: DROP POLICY IF EXISTS + REVOKE both safe to re-run.
-- Verified by re-running the pg_policies + has_table_privilege
-- diagnostics after apply.

BEGIN;

-- ── 1. DROP the broken policies ──────────────────────────────────────

DROP POLICY IF EXISTS "Service role full access consents"                  ON consents;
DROP POLICY IF EXISTS "Service role full access incidents"                 ON incidents;
DROP POLICY IF EXISTS "Service role full access complaints"                ON complaints;
DROP POLICY IF EXISTS "Service role full access breach_log"                ON breach_log;
DROP POLICY IF EXISTS "Service role full access handover"                  ON handover_notes;
DROP POLICY IF EXISTS "Service role full access patient_flags"             ON patient_flags;
DROP POLICY IF EXISTS "Service role full access tokens"                    ON consultation_tokens;
DROP POLICY IF EXISTS "Service role full access analytics"                 ON analytics_events;
DROP POLICY IF EXISTS "Service role full access drug_log"                  ON drug_interactions_log;
DROP POLICY IF EXISTS "Service role full access audit_logs"                ON audit_logs;
DROP POLICY IF EXISTS "Service role full access appointments"              ON appointments;
DROP POLICY IF EXISTS "Service role full access payroll_periods"           ON payroll_periods;
DROP POLICY IF EXISTS "Service role full access pharmacy_contacts"         ON pharmacy_contacts;
DROP POLICY IF EXISTS "Service role full access prescription_templates"    ON prescription_templates;
DROP POLICY IF EXISTS "Service role full access team_messages"             ON team_messages;
DROP POLICY IF EXISTS "Service role full access team_reads"                ON team_reads;

-- imaging_reviews table may not exist in every environment (its own
-- migration was added later). Guard the DROP so this file still
-- applies cleanly where the table isn't present yet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='imaging_reviews') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Service role full access imaging_reviews" ON imaging_reviews';
  END IF;
END $$;

-- ── 2. REVOKE anon + authenticated privileges (belt-and-braces) ──────
--
-- Even if RLS is left permissive by mistake in some future policy,
-- Postgres still won't let the role act without table-level GRANTs.
-- Revoking these means the grant layer itself blocks direct access.
-- service_role has its own grants that bypass this; backend unaffected.

REVOKE ALL ON consents                  FROM anon, authenticated;
REVOKE ALL ON incidents                 FROM anon, authenticated;
REVOKE ALL ON complaints                FROM anon, authenticated;
REVOKE ALL ON breach_log                FROM anon, authenticated;
REVOKE ALL ON handover_notes            FROM anon, authenticated;
REVOKE ALL ON patient_flags             FROM anon, authenticated;
REVOKE ALL ON consultation_tokens       FROM anon, authenticated;
REVOKE ALL ON analytics_events          FROM anon, authenticated;
REVOKE ALL ON drug_interactions_log     FROM anon, authenticated;
REVOKE ALL ON audit_logs                FROM anon, authenticated;
REVOKE ALL ON appointments              FROM anon, authenticated;
REVOKE ALL ON payroll_periods           FROM anon, authenticated;
REVOKE ALL ON pharmacy_contacts         FROM anon, authenticated;
REVOKE ALL ON prescription_templates    FROM anon, authenticated;
REVOKE ALL ON team_messages             FROM anon, authenticated;
REVOKE ALL ON team_reads                FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='imaging_reviews') THEN
    EXECUTE 'REVOKE ALL ON imaging_reviews FROM anon, authenticated';
  END IF;
END $$;

-- ── 3. consultations — DROP two over-permissive authenticated policies ─
--
-- Post-fix diagnostic confirmed both policies grant blanket access:
--   "Authenticated full access"                 — TO authenticated, ALL, USING true
--   "authenticated can select consultations"    — TO authenticated, SELECT, USING true
-- Any user with a Supabase Auth session could read/write ANY consultation.
-- Since the app is fully server-mediated (patient consult writes go via
-- /api/patient-consult, provider reads via /api/consultations), no
-- legitimate use of these policies exists. Drop them.

DROP POLICY IF EXISTS "Authenticated full access"              ON consultations;
DROP POLICY IF EXISTS "authenticated can select consultations" ON consultations;

-- ── 4. providers — DROP anon read + authenticated update ────────────
--
-- Post-fix diagnostic confirmed:
--   "Public read providers"        — TO {anon, authenticated}, SELECT, USING true
--     → Anyone with the anon key could list all provider names, emails,
--       phones, MCNZ numbers, HPI-CPNs, roles, supervisor structure,
--       and any TOTP secrets stored on the row.
--   "Authenticated update providers" — TO authenticated, UPDATE, USING true
--     → Any authenticated user could UPDATE any provider row
--       (role escalation vector).
-- Provider lookups during login now go through /api/auth, so no
-- legitimate use of these policies exists. Drop them.

DROP POLICY IF EXISTS "Public read providers"          ON providers;
DROP POLICY IF EXISTS "Authenticated update providers" ON providers;

-- ── 5. Belt-and-braces REVOKE on core clinical tables ──────────────
--
-- Even though the tables above now have their policies fixed, revoking
-- the anon/authenticated grants at the Postgres GRANT layer means
-- future migrations that misconfigure a policy still can't hand out
-- access that isn't grantable. service_role bypasses RLS *and* GRANTs
-- so the backend/API continues to work unchanged.

REVOKE ALL ON patients      FROM anon, authenticated;
REVOKE ALL ON consultations FROM anon, authenticated;
REVOKE ALL ON prescriptions FROM anon, authenticated;
REVOKE ALL ON providers     FROM anon, authenticated;
REVOKE ALL ON messages      FROM anon, authenticated;

COMMIT;

-- ── POST-APPLY VERIFICATION ──────────────────────────────────────────
-- Re-run these queries in the Supabase SQL editor after this migration
-- and confirm the expected output. Do NOT skip this step.

-- 1. Any policies still targeting PUBLIC (should return 0 rows for
--    "Service role full access" pattern):
--    SELECT schemaname, tablename, policyname, roles, cmd
--    FROM pg_policies
--    WHERE schemaname = 'public'
--      AND (roles::text = '{public}' OR roles::text LIKE '%public%')
--    ORDER BY tablename;

-- 2. anon/authenticated privileges on formerly-exposed tables (should
--    all return `f`):
--    SELECT tablename,
--           has_table_privilege('anon',          'public.'||tablename, 'SELECT') anon_select,
--           has_table_privilege('anon',          'public.'||tablename, 'INSERT') anon_insert,
--           has_table_privilege('authenticated', 'public.'||tablename, 'SELECT') auth_select
--    FROM pg_tables
--    WHERE schemaname='public'
--      AND tablename IN ('patients','consultations','consents','handover_notes',
--                        'incidents','complaints','breach_log','patient_flags',
--                        'drug_interactions_log','consultation_tokens','audit_logs',
--                        'imaging_reviews','appointments','analytics_events',
--                        'payroll_periods','pharmacy_contacts','prescription_templates',
--                        'team_messages','team_reads','prescriptions','providers','messages')
--    ORDER BY tablename;

-- 3. Smoke test — the app should still work end-to-end from the
--    patient side (triage → payment → waiting room) and provider side
--    (queue → consult). All happens via service_role so nothing here
--    is affected. If anything breaks, that means a code path was
--    inadvertently using the anon key against these tables — needs a
--    real per-user policy added.
