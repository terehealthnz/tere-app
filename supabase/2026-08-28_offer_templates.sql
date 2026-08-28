-- Offer templates — reusable Create Offer body presets.
--
-- Admin manages a small library of role-specific offer letter templates
-- (e.g. "Nurse Practitioner — contractor", "RMO — permanent"). When creating
-- an offer for an applicant, the admin picks a template and the form fields
-- (role_title, compensation, contract_terms) pre-fill from the template.
-- They can still tweak any field before sending — the template is a starting
-- point, not a lock.
--
-- Kept intentionally small: no per-listing binding, no versioning, no
-- variables/placeholders. If templates grow to need Liquid-style vars,
-- swap to a proper templating engine at that point.

CREATE TABLE IF NOT EXISTS offer_templates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,                      -- admin-facing label, e.g. "NP — contractor"
  role_title_default          text NOT NULL,
  compensation_default        text NOT NULL,
  contract_terms              text NOT NULL,
  is_active                   boolean NOT NULL DEFAULT true,
  sort_order                  integer NOT NULL DEFAULT 0,
  created_by_provider_id      uuid REFERENCES providers(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_templates_active_idx
  ON offer_templates (is_active, sort_order)
  WHERE is_active = true;

-- All access via /api/job-applications (service role bypasses RLS).
ALTER TABLE offer_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON offer_templates FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.offer_templates_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS offer_templates_touch ON offer_templates;
CREATE TRIGGER offer_templates_touch
  BEFORE UPDATE ON offer_templates
  FOR EACH ROW EXECUTE FUNCTION public.offer_templates_touch_updated_at();
