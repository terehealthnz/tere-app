-- Lock down public.patient_support_requests (plural — the real, actively-used
-- table) after Supabase Advisor flagged rls_disabled_in_public on 2026-08-25.
--
-- Same class of exposure as the singular orphan handled in
-- 2026-08-25_lockdown_orphan_support_table.sql, but this table is the one
-- the app actually reads and writes:
--   • 13 references in api/_patient-support.js — all via the SERVICE_ROLE
--     client (createClient(URL, SUPABASE_SERVICE_ROLE_KEY)), which bypasses
--     RLS entirely.
--   • Zero references from the browser bundle (grep src/ — no hits).
--
-- Because every legitimate access goes through service_role, we can safely
-- deny-all for anon + authenticated. If a future browser-side path ever
-- needs direct access, add a targeted policy at that point — do not weaken
-- this deny-all.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.patient_support_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_support_requests_deny_public ON public.patient_support_requests;

CREATE POLICY patient_support_requests_deny_public
  ON public.patient_support_requests
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

REVOKE ALL ON public.patient_support_requests FROM anon, authenticated;
