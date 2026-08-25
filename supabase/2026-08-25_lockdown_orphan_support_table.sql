-- Emergency lockdown of an orphan public table flagged by Supabase Advisor
-- (rls_disabled_in_public) on 2026-08-25.
--
-- public.patient_support_request (singular) had NO RLS and was reachable by
-- the anon key — anyone with the project URL could read / edit / delete
-- every row. Not exploited (as far as we know) but a live exposure.
--
-- The application code uses patient_support_requestS (plural — see
-- api/_patient-support.js), which is a different, properly-secured table.
-- The singular table is an orphan, almost certainly a leftover from an
-- early Supabase Table Editor session.
--
-- Idempotent — safe to re-run.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'patient_support_request') THEN
    EXECUTE 'ALTER TABLE public.patient_support_request ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'patient_support_request'
        AND policyname = 'patient_support_request_deny_public'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY patient_support_request_deny_public
          ON public.patient_support_request
          FOR ALL TO anon, authenticated
          USING (false) WITH CHECK (false)
      $sql$;
    END IF;

    EXECUTE 'REVOKE ALL ON public.patient_support_request FROM anon, authenticated';
  END IF;
END $$;

-- Once we confirm the table is empty (see rows-count check in the
-- accompanying chat), a follow-up migration will DROP TABLE it to remove
-- the orphan entirely.
