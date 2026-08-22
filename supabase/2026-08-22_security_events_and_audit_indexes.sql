-- Security events log + audit_logs range-scan indexes.
--
-- Two purposes bundled because they support the same feature: nightly
-- security-anomaly cron (api/_cron-security-anomalies.js) needs a place
-- to persist alertable events (auth failures, off-hours access, unusual
-- volume) AND fast time-range queries on audit_logs to surface anomalies.
--
-- Idempotent: uses IF NOT EXISTS. Safe to re-run.

-- ── security_events table ───────────────────────────────────────────────
--
-- Distinct from audit_logs, which records normal-course PHI access with
-- reason-for-access. security_events records deviations worth alerting on:
-- failed auth, off-hours access anomalies, rate-limit breaches, and
-- anything the nightly cron flags. Rows may be inserted from any endpoint
-- (via api/_security-events.js helper) or the cron itself.

CREATE TABLE IF NOT EXISTS security_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  severity        text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'alert')),
  provider_id     uuid REFERENCES providers(id) ON DELETE SET NULL,
  ip              text,
  user_agent      text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  alert_sent_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE security_events IS
  'Persisted security-relevant events (auth failures, anomalies, rate-limit breaches). Feeds the nightly anomaly cron. Distinct from audit_logs — audit is normal-course PHI access, this is deviations.';

COMMENT ON COLUMN security_events.event_type IS
  'e.g. auth_failure | auth_lockout | anomaly_high_pph | anomaly_off_hours | rate_limit_hit | admin_view_outside_scope';

COMMENT ON COLUMN security_events.severity IS
  'info (log only) | warn (aggregate → cron summary) | alert (email immediately if the writer chooses).';

COMMENT ON COLUMN security_events.alert_sent_at IS
  'Set when an email alert has been dispatched for this event, so subsequent scans do not re-alert on the same row.';

-- Indexes: cron scans are always time-range + type/ip filtered.
CREATE INDEX IF NOT EXISTS security_events_created_idx
  ON security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_created_idx
  ON security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_ip_created_idx
  ON security_events (ip, created_at DESC) WHERE ip IS NOT NULL;
CREATE INDEX IF NOT EXISTS security_events_provider_created_idx
  ON security_events (provider_id, created_at DESC) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS security_events_unsent_alerts_idx
  ON security_events (created_at DESC) WHERE alert_sent_at IS NULL AND severity IN ('warn', 'alert');

-- RLS: service_role only (writes via helper, reads via cron only).
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_events_no_public ON security_events;
CREATE POLICY security_events_no_public ON security_events
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Append-only guard (same pattern as audit_logs).
CREATE OR REPLACE FUNCTION prevent_security_events_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Allow UPDATE only to set alert_sent_at (cron marking as processed).
  IF TG_OP = 'UPDATE' AND OLD.event_type = NEW.event_type
     AND OLD.severity = NEW.severity
     AND OLD.provider_id IS NOT DISTINCT FROM NEW.provider_id
     AND OLD.ip IS NOT DISTINCT FROM NEW.ip
     AND OLD.metadata IS NOT DISTINCT FROM NEW.metadata
     AND OLD.created_at = NEW.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'security_events is append-only (except alert_sent_at) — % blocked', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS security_events_no_mutation ON security_events;
CREATE TRIGGER security_events_no_mutation
  BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION prevent_security_events_mutation();

-- ── audit_logs range-scan indexes ───────────────────────────────────────
--
-- The nightly anomaly cron needs to query audit_logs by (created_at range,
-- provider_id) and (created_at range, event_type). Without indexes these
-- are table scans. Audit_logs grows unbounded so this becomes O(N) per run.

CREATE INDEX IF NOT EXISTS audit_logs_created_idx
  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_provider_created_idx
  ON audit_logs (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_event_created_idx
  ON audit_logs (event_type, created_at DESC);
