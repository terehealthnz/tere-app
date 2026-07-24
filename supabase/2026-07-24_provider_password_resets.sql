-- Self-service password reset for providers.
--
-- Flow:
--   1. Provider clicks "Forgot password?" on Login → enters email.
--   2. /api/provider-reset-request generates a 256-bit random token, stores
--      SHA-256(token) in this table, emails the plaintext token as a link.
--   3. Provider clicks link, sets a new password.
--   4. /api/provider-reset-complete verifies token_hash + not expired + not
--      used, updates providers.pin_hash, marks token used_at = now().
--
-- Security:
--   • Tokens are 256-bit crypto.randomBytes — no salting needed on hash
--     (SHA-256 preimage on high-entropy input is infeasible).
--   • Single-use (used_at set on redemption).
--   • 30-minute expiry.
--   • Table is admin-only; no RLS grants to anon or authenticated roles.
--     All access goes through the server endpoint with the service role.

CREATE TABLE IF NOT EXISTS provider_password_resets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_password_resets_token_hash
  ON provider_password_resets(token_hash);

CREATE INDEX IF NOT EXISTS idx_provider_password_resets_provider_id
  ON provider_password_resets(provider_id, created_at DESC);

ALTER TABLE provider_password_resets ENABLE ROW LEVEL SECURITY;
-- No policies — only the service role (server endpoints) may read/write.
