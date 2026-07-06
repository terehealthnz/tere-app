-- Feature flags — runtime-toggleable switches so risky changes can ship to prod
-- "off" and be turned on for specific providers first, then for everyone.
-- Manage from Admin → Menu → Feature Flags.

CREATE TABLE IF NOT EXISTS feature_flags (
  key                text PRIMARY KEY,
  enabled            boolean NOT NULL DEFAULT false,
  description        text,
  provider_allowlist uuid[],
  updated_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_by         uuid
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Reads: anyone can read flags (values are non-secret; the client needs them
-- before login to gate patient-facing UI too). Writes go through /api/flags
-- with service_role so this SELECT policy is safe.
DROP POLICY IF EXISTS "anon can select feature_flags" ON feature_flags;
CREATE POLICY "anon can select feature_flags" ON feature_flags FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated can select feature_flags" ON feature_flags;
CREATE POLICY "authenticated can select feature_flags" ON feature_flags FOR SELECT TO authenticated USING (true);
