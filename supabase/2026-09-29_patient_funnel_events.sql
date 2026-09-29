-- Patient funnel events — anon patient-side telemetry for observability.
-- Fires on route change (and any explicit milestones we add). Lets admin
-- see where patients get stuck: "40% drop off at /payment" or "average
-- session hits /triage → /consent → /vitals → /payment before landing on
-- /done".
--
-- NO PHI. Only the path (/payment, /triage/step-3) and optional session
-- + consultation IDs. No message body, no name, no email. This is the
-- observability channel — the support pipeline (patient_support_tickets)
-- is where PHI-bearing messages live.
--
-- session_id is client-generated (crypto.randomUUID) and lives in
-- sessionStorage — it resets on tab close, so long-tail attribution
-- across days is out of scope. That's fine for funnel analysis.
--
-- ip_hash is a SHA-256 of the source IP + IP_HASH_SALT — pseudonymised
-- for optional per-IP rate-limiting analysis without storing the raw
-- IP. Not treated as PHI (patient never authenticates the IP as theirs).

CREATE TABLE IF NOT EXISTS patient_funnel_events (
  id              BIGSERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL,
  consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL,
  event_name      TEXT NOT NULL,
  path            TEXT,
  meta            JSONB DEFAULT '{}'::jsonb,
  ip_hash         TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for admin funnel queries — the two hot filters are time window and
-- event_name (group by / count by name). Session-scoped drill-downs use the
-- session_id column.
CREATE INDEX IF NOT EXISTS idx_funnel_events_created_at ON patient_funnel_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_event_name ON patient_funnel_events (event_name);
CREATE INDEX IF NOT EXISTS idx_funnel_events_session    ON patient_funnel_events (session_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_consult    ON patient_funnel_events (consultation_id) WHERE consultation_id IS NOT NULL;

-- RLS: only the service_role writes (via the /api/patient-event endpoint).
-- No anon INSERT, no anon SELECT — server owns both sides.
ALTER TABLE patient_funnel_events ENABLE ROW LEVEL SECURITY;

-- Rentention: 90 days is plenty for funnel analysis. Nightly retention
-- cron (existing cron-retention-purge) can be extended to sweep this
-- table by created_at when we're happy with the schema.
COMMENT ON TABLE patient_funnel_events IS 'Anon patient-side telemetry for funnel/drop-off observability. NO PHI. 90-day retention.';
