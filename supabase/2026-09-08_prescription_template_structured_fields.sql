-- Prescription templates: persist the structured fields the Prescribe modal
-- now collects (strength / form / frequency / duration). Without these,
-- "Save as my default for ibuprofen" round-trips through the DB losing
-- everything but drug + dose + directions, and the ⭐ auto-fill on next
-- typing populates blank fields.
--
-- The features-migration.sql that first defined this table was never
-- applied in prod, so create-if-missing here to be self-healing.

CREATE TABLE IF NOT EXISTS prescription_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  drug        text NOT NULL,
  dose        text,
  directions  text,
  quantity    text,
  repeats     integer DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rx_templates_provider ON prescription_templates(provider_id);

ALTER TABLE prescription_templates ENABLE ROW LEVEL SECURITY;

-- RLS: service-role only. All client access goes through /api/appointments
-- with server-side provider_id auth (server-mediated PHI pattern).
DROP POLICY IF EXISTS "Service role full access rx_templates" ON prescription_templates;
CREATE POLICY "Service role full access rx_templates" ON prescription_templates FOR ALL USING (true);
REVOKE ALL ON prescription_templates FROM anon, authenticated;

ALTER TABLE prescription_templates
  ADD COLUMN IF NOT EXISTS strength   text,
  ADD COLUMN IF NOT EXISTS form       text,
  ADD COLUMN IF NOT EXISTS frequency  text,
  ADD COLUMN IF NOT EXISTS duration   text;

-- Upsert dedupe key for ⭐ "Save as my default for X" — one row per
-- (provider, template name), re-tapping the button updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rx_templates_provider_name
  ON prescription_templates(provider_id, name);
