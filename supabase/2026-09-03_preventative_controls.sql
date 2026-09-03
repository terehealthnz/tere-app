-- Preventative security controls (tasks #374–#378).
--
-- 1. provider_elevation_tokens — short-lived (5 min) tokens minted after
--    fresh MFA re-verify. Required to access high-sensitivity endpoints
--    (ACC bundle export, patient record export, controlled drugs register)
--    even inside an active session. Also required for off-hours PHI access.
--
-- 2. providers columns — per-provider daily PHI-access caps.

CREATE TABLE IF NOT EXISTS provider_elevation_tokens (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id     uuid NOT NULL,
  token_hash      text NOT NULL UNIQUE,           -- SHA-256 hex
  minted_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  used_count      integer NOT NULL DEFAULT 0,
  purpose         text,                            -- 'acc_bundle_export' | 'patient_record_export' | 'cd_register' | 'off_hours' | 'generic'
  ip              text,
  user_agent      text
);
CREATE INDEX IF NOT EXISTS provider_elevation_tokens_hash ON provider_elevation_tokens(token_hash);
CREATE INDEX IF NOT EXISTS provider_elevation_tokens_provider_expires ON provider_elevation_tokens(provider_id, expires_at DESC);

ALTER TABLE provider_elevation_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON provider_elevation_tokens;
CREATE POLICY "service_role_all" ON provider_elevation_tokens FOR ALL USING (true);

COMMENT ON TABLE provider_elevation_tokens IS
  'Short-lived JIT elevation tokens (default 5 min). Required for the highest-sensitivity endpoints even inside an active provider session. Hashed at rest (SHA-256), never store the raw value.';

-- Per-provider daily PHI-access caps. Defaults are generous for existing
-- providers; conservative for new hires (set at onboarding). Admin override
-- lifts the cap temporarily with justification.
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS daily_chart_access_limit   integer DEFAULT 200,
  ADD COLUMN IF NOT EXISTS daily_export_limit         integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS access_budget_override_until  timestamptz,
  ADD COLUMN IF NOT EXISTS access_budget_override_reason text;

COMMENT ON COLUMN providers.daily_chart_access_limit IS
  'Soft-then-hard cap on consult_opened events per NZ calendar day. Warn at 80%, block at 100% unless override active.';
COMMENT ON COLUMN providers.daily_export_limit IS
  'Cap on export events (acc_audit_bundle_export, patient_record_export, acc_cert.*) per NZ calendar day.';
COMMENT ON COLUMN providers.access_budget_override_until IS
  'While in the future, budget caps are ignored. Set by an admin with justification. Automatically clears itself when past.';
