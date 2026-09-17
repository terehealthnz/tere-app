-- provider_sessions — one row per provider login, closed on logout.
--
-- Motivation: audit trail. `audit_logs` records individual PHI-touching
-- actions but has no notion of a "session" — you can't answer "how long
-- was Dr X logged in on 2026-09-15?" or "who was online at 03:00?" from
-- audit_logs alone. This table sits alongside audit_logs and is joined
-- to it by (provider_id, created_at between started_at and ended_at).
--
-- Population:
--   started_at + ip + user_agent + mfa_used — set by /api/provider-auth on
--     successful login.
--   ended_at + end_reason — set by /api/provider-logout when the user hits
--     "Sign out", OR by the nightly retention cron for orphaned rows
--     (browser tab closed without signing out → end_reason='inferred_stale').
--
-- Retention: same 10-year clock as audit_logs (HIPC Rule 9 health record).
-- Wired into /api/cron-retention-purge; no DELETE policy here.
--
-- Security: RLS on, no anon/authenticated grants — service role only. All
-- reads / writes go through /api endpoints that guardProvider() as admin.

CREATE TABLE IF NOT EXISTS provider_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id    uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  end_reason     text CHECK (end_reason IN ('logout', 'idle_timeout', 'inferred_stale', 'admin_revoke')),
  ip             text,
  user_agent     text,
  mfa_used       boolean NOT NULL DEFAULT false,
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE provider_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON provider_sessions FROM anon, authenticated;

-- Fastest queries: "sessions for provider X, newest first" and "who is online now"
CREATE INDEX IF NOT EXISTS provider_sessions_provider_started_idx
  ON provider_sessions (provider_id, started_at DESC);

CREATE INDEX IF NOT EXISTS provider_sessions_active_idx
  ON provider_sessions (started_at DESC)
  WHERE ended_at IS NULL;

-- Retention query support: "close orphans older than N hours"
CREATE INDEX IF NOT EXISTS provider_sessions_orphan_idx
  ON provider_sessions (last_seen_at)
  WHERE ended_at IS NULL;
