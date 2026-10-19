-- Trusted-device MFA bypass. Lets a provider tick "Trust this device for
-- 30 days" after a successful MFA login, which issues an HttpOnly cookie
-- (tere_trust) carrying a random 32-byte token. The SHA-256 hash of the
-- token is stored here; subsequent logins from a browser presenting that
-- cookie skip the TOTP step until the row expires or is revoked.
--
-- Trust is per (provider_id, device). Device identity is the token itself
-- rather than a browser fingerprint — fingerprinting is unreliable and we
-- shouldn't store it anyway. Each trust row = one browser profile that
-- has previously completed MFA.
--
-- Revocation paths:
--   - User explicit logout "sign out of all devices" → mass revoke
--   - Admin page per-device revoke
--   - MFA secret rotated → cron sweep revokes all for that provider
--   - Expired (30d default) → cron sweep marks ended
--
-- JIT elevation (ACC bundle, break-glass, prescribing-after-hours) is
-- NOT bypassed by device trust — those surfaces have their own fresh-MFA
-- gate per task #377/378.

create table if not exists trusted_devices (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references providers(id) on delete cascade,
  -- SHA-256 of the raw token stored in the cookie. Bytea to match the
  -- provider_sessions.session_token_hash shape so admin ops that join
  -- the two can use the same encoding.
  token_hash          bytea not null,
  user_agent          text,
  ip_at_issue         text,
  issued_at           timestamptz not null default now(),
  last_used_at        timestamptz not null default now(),
  expires_at          timestamptz not null,
  revoked_at          timestamptz,
  revoke_reason       text
);

create unique index if not exists trusted_devices_token_hash_uidx
  on trusted_devices(token_hash);

create index if not exists trusted_devices_provider_active_idx
  on trusted_devices(provider_id, expires_at)
  where revoked_at is null;

comment on table trusted_devices is
  'Per-browser MFA bypass tokens. Cookie-presented token hash is matched here; '
  'unrevoked + unexpired rows let the login flow skip the TOTP prompt.';
