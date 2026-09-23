-- Promote provider_sessions from observability-only to authentication store.
--
-- Blacklock WEB-0923-0655443636: today the provider's UUID (x-provider-id
-- header, matching sessionStorage) is the bearer credential for every
-- authenticated API call. UUID is guessable-in-shape, appears in URLs
-- (training_status, provider-notifications), and can't be revoked short
-- of deactivating the provider account. Replace with an opaque cookie
-- session token stored here as a hash.
--
-- Design:
--   session_token_hash — SHA-256 of the raw 32-byte token the client
--     holds in an HttpOnly cookie. Store the hash so a leaked DB dump
--     doesn't yield replayable tokens.
--   expires_at         — hard expiry. NULL means never (shouldn't happen
--     in practice; enforced at insert time by _provider-session.js).
--   revoked_at         — set on logout / admin revoke / password change.
--     Server treats revoked_at IS NOT NULL as "session is dead" even
--     before the retention cron deletes the row.
--
-- Idempotent — safe to re-run.

ALTER TABLE provider_sessions
  ADD COLUMN IF NOT EXISTS session_token_hash bytea,
  ADD COLUMN IF NOT EXISTS expires_at         timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at         timestamptz;

-- Unique on the hash so we can look up sessions by cookie in one indexed
-- probe. Partial index skips legacy observability rows that have no hash
-- (rows inserted before this migration ran).
CREATE UNIQUE INDEX IF NOT EXISTS provider_sessions_token_hash_uidx
  ON provider_sessions (session_token_hash)
  WHERE session_token_hash IS NOT NULL;

-- Fast filter for cookie auth: "give me the active session for this hash".
-- The unique index above already covers point-lookup; this one supports
-- the cron sweep that closes expired-but-unrevoked sessions.
CREATE INDEX IF NOT EXISTS provider_sessions_expires_idx
  ON provider_sessions (expires_at)
  WHERE ended_at IS NULL AND revoked_at IS NULL;

COMMENT ON COLUMN provider_sessions.session_token_hash IS
  'SHA-256 of the raw 32-byte session token held in the HttpOnly cookie. '
  'Server hashes the incoming cookie and looks up by this column. Never '
  'log or return the raw token to any client other than the browser cookie.';

COMMENT ON COLUMN provider_sessions.expires_at IS
  'Hard expiry timestamp for the session. Server refuses cookies where '
  'now() > expires_at even if the row hasn''t been ended yet.';

COMMENT ON COLUMN provider_sessions.revoked_at IS
  'Set on logout, admin revoke, or password change. Non-null revoked_at '
  'makes the session unusable immediately, independent of expires_at or '
  'the retention cron.';
