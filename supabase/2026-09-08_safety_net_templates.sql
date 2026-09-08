-- Provider-saved safety-netting templates. Same pattern as prescription_templates.
-- Provider writes custom safety-net wording during a consult, hits "⭐ Save my
-- current wording", and it shows up in the dropdown alongside the built-in
-- templates (Viral URI, Cellulitis, etc.) for every future consult.
--
-- The built-in templates stay in code (src/lib/safetyNettingTemplates.js) —
-- this table is only for provider-personalised additions.

CREATE TABLE IF NOT EXISTS safety_net_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  text        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_net_templates_provider
  ON safety_net_templates(provider_id);

-- Upsert key: one name per provider. Re-saving updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS uq_safety_net_templates_provider_name
  ON safety_net_templates(provider_id, name);

-- RLS: service-role only. All access via /api/appointments with server-side
-- provider_id auth (same pattern as prescription_templates).
ALTER TABLE safety_net_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access safety_net_templates" ON safety_net_templates;
CREATE POLICY "Service role full access safety_net_templates" ON safety_net_templates FOR ALL USING (true);
REVOKE ALL ON safety_net_templates FROM anon, authenticated;
