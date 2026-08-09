-- 2026-08-09 — Persistent provider login attempt tracking.
--
-- Previously api/_provider-auth.js kept the lockout state in an
-- in-memory Map. On Vercel serverless, module state is per-instance
-- and evaporates on cold start, meaning an attacker could effectively
-- bypass the lockout by triggering cold starts (or just waiting a
-- few minutes of idleness). Practical brute-force was already bounded
-- by bcrypt cost (~100ms per compare) but persistence gives a real
-- lockout window that survives across all serverless instances.
--
-- Schema is tiny: one row per provider ever attempted, tracks the
-- consecutive failed count and the lock expiry. Successful login
-- deletes the row.
--
-- RLS: enabled with zero policies. service_role bypasses RLS so the
-- auth endpoint (which uses service_role) can read/write freely.
-- No anon or authenticated access.

CREATE TABLE IF NOT EXISTS provider_login_attempts (
  provider_id  UUID PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  failed_count INT  NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE provider_login_attempts ENABLE ROW LEVEL SECURITY;

-- Belt-and-braces: revoke default grants so anon/authenticated can't
-- reach this table even if a policy is misconfigured later.
REVOKE ALL ON provider_login_attempts FROM anon, authenticated;

-- Helpful index for the periodic cleanup query (optional cron):
--   DELETE FROM provider_login_attempts
--   WHERE locked_until IS NOT NULL AND locked_until < now() - interval '30 days';
CREATE INDEX IF NOT EXISTS provider_login_attempts_locked_until_idx
  ON provider_login_attempts (locked_until)
  WHERE locked_until IS NOT NULL;
