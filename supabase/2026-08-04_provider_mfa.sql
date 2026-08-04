-- Provider MFA (TOTP) — RFC 6238 time-based one-time passwords.
--
-- Adds two columns to providers:
--   mfa_secret_encoded — base32-encoded TOTP secret (per RFC 4648), stored
--                        as-is. Not encrypted in the DB because access to
--                        the providers table already requires service_role,
--                        and the app-side threat model treats DB read as
--                        equivalent to full breach.
--   mfa_enabled        — bool. false = MFA off (login uses PIN only).
--                         true  = MFA required (login: PIN then TOTP).
--
-- Enrollment flow:
--   1. Provider hits /api/provider-mfa?action=enroll → server generates a
--      random secret, stores it, returns the otpauth:// URI and human-
--      readable secret so the provider can add it to Google Authenticator /
--      1Password / etc.
--   2. Provider types a code from the authenticator app.
--   3. /api/provider-mfa?action=verify with the code → if it matches,
--      sets mfa_enabled=true. Provider is now MFA-required on next login.
--
-- Disable flow:
--   /api/provider-mfa?action=disable with a valid current code →
--   clears the secret + sets mfa_enabled=false. Provider can re-enrol.
--
-- Recovery: if a provider loses their authenticator app, an admin can
-- clear mfa_enabled via the admin providers UI (server clears mfa_secret
-- too). Every enable/disable/recovery is audit-logged.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS mfa_secret_encoded text,
  ADD COLUMN IF NOT EXISTS mfa_enabled        boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN providers.mfa_secret_encoded IS
  'Base32-encoded TOTP secret (RFC 4648). Managed by /api/provider-mfa. NULL when MFA is disabled.';
COMMENT ON COLUMN providers.mfa_enabled IS
  'True = provider must complete TOTP challenge after PIN on login. False = PIN only.';
