-- Retention purge audit trail (task #360).
--
-- The retention cron (api/_cron-retention-purge.js) records every purge
-- run here — what policy fired, how many rows deleted, whether it was a
-- dry-run or a live purge. Auditors can trace exactly what was destroyed
-- and when, satisfying HIPC Rule 9 (kept no longer than required) +
-- Privacy Act 2020 IPP9 while still demonstrating we can prove what was
-- removed.
--
-- Append-only. Same pattern as audit_logs / disclosure_events / security_events.

CREATE TABLE IF NOT EXISTS retention_purge_runs (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at              timestamptz NOT NULL DEFAULT now(),
  policy_name         text NOT NULL,
  table_name          text NOT NULL,
  strategy            text NOT NULL CHECK (strategy IN ('auto_delete', 'anonymise', 'candidate_flagged')),
  cutoff_date         timestamptz NOT NULL,
  candidates_found    integer NOT NULL DEFAULT 0,
  rows_actioned       integer NOT NULL DEFAULT 0,
  dry_run             boolean NOT NULL DEFAULT false,
  summary             text,
  metadata            jsonb
);

CREATE INDEX IF NOT EXISTS retention_purge_runs_when ON retention_purge_runs(run_at DESC);
CREATE INDEX IF NOT EXISTS retention_purge_runs_policy ON retention_purge_runs(policy_name, run_at DESC);

ALTER TABLE retention_purge_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON retention_purge_runs;
CREATE POLICY "service_role_all" ON retention_purge_runs FOR ALL USING (true);

-- Append-only guard
CREATE OR REPLACE FUNCTION prevent_retention_purge_runs_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'retention_purge_runs is append-only — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS retention_purge_runs_no_update ON retention_purge_runs;
CREATE TRIGGER retention_purge_runs_no_update
  BEFORE UPDATE ON retention_purge_runs
  FOR EACH ROW EXECUTE FUNCTION prevent_retention_purge_runs_mutation();
DROP TRIGGER IF EXISTS retention_purge_runs_no_delete ON retention_purge_runs;
CREATE TRIGGER retention_purge_runs_no_delete
  BEFORE DELETE ON retention_purge_runs
  FOR EACH ROW EXECUTE FUNCTION prevent_retention_purge_runs_mutation();

COMMENT ON TABLE retention_purge_runs IS
  'Every retention-purge cron run recorded here. Append-only. Satisfies HIPC Rule 9 evidence requirement — we can show what was destroyed and when, and prove that clinical records past minimum retention were reviewed (either auto-purged for low-risk categories or flagged for admin review for high-value data).';
