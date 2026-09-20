-- Provider-saved SOAP note templates. Same pattern as safety_net_templates +
-- prescription_templates. Provider writes a note, hits "⭐ Save as template",
-- and it shows up in the "Load template" picker on future consults.
--
-- Cross-mode by design: no is_practice column. A template saved while the
-- provider is in sandbox appears in live and vice versa. Templates are
-- authoring conveniences, not clinical data.
--
-- body JSONB holds the slice of NotesCompletion state the template captures —
-- typically s1 (presenting history), medHistory, mdm, planItems, safety_net,
-- return_precautions. Client decides which fields to save/load.

CREATE TABLE IF NOT EXISTS consult_note_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  body        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'consult' = general SOAP note template
  -- 'discharge' = discharge-summary template
  -- Discharge templates are surfaced in the discharge-summary picker so ACC
  -- and non-ACC consults share the same library.
  kind        text NOT NULL DEFAULT 'consult' CHECK (kind IN ('consult', 'discharge')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consult_note_templates_provider
  ON consult_note_templates(provider_id, kind);

-- One (provider, kind, name) triple max. Re-saving with the same name
-- updates in place (client uses upsert).
CREATE UNIQUE INDEX IF NOT EXISTS uq_consult_note_templates_provider_kind_name
  ON consult_note_templates(provider_id, kind, name);

ALTER TABLE consult_note_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access consult_note_templates" ON consult_note_templates;
CREATE POLICY "Service role full access consult_note_templates" ON consult_note_templates FOR ALL USING (true);
REVOKE ALL ON consult_note_templates FROM anon, authenticated;
