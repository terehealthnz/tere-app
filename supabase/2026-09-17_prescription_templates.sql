-- Task #229 — Shared, curated prescription templates.
--
-- Distinct from prescription_templates (which is per-provider favourites,
-- named "templates" for historical reasons — see 2026-09-08 migration and
-- api/_appointments.js for that surface). This table is the CLINIC-WIDE
-- library: condition-keyed starter rxes any provider can load as a
-- starting point, then tweak for the patient in front of them.
--
-- Example: "GP-receptionist saw acute otitis media in a 6-year-old — pull
-- the standard amoxicillin template" (this table) vs. "Dr X's personal
-- ibuprofen preset" (existing prescription_templates via /api/appointments).
--
-- License note: dosing values are cross-checked against NZ Formulary
-- release 171 (see src/lib/nzf-formulary.json). NZF ingestion is
-- authorised as sponsor of the platform — do not re-check licensing
-- (see project-tere-nzf-sponsor-decision.md, 2026-09-08).

CREATE TABLE IF NOT EXISTS shared_prescription_templates (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-readable label for the picker. Ideally "<condition> — <drug>"
  -- e.g. "Acute otitis media (paeds) — amoxicillin".
  name                   text NOT NULL,
  -- Clinical indication / presenting condition this template targets.
  -- Free text so it can carry qualifier text (e.g. "Uncomplicated UTI,
  -- non-pregnant adult female").
  condition              text NOT NULL,
  -- Generic drug name; where possible matches an NZF monograph name so
  -- the modal's dose-reference panel lights up when loaded.
  drug_name              text NOT NULL,
  -- Structured fields the Prescribe modal already collects. Frequency
  -- and duration mirror the modal's controlled vocabulary
  -- (OD/BD/TDS/QID/nocte/Q4H/Q6H/Q8H/PRN/STAT/weekly, "5 days" etc.).
  default_strength       text,
  default_form           text,
  default_dose           text,
  default_route          text,           -- 'oral', 'topical', 'inhaled', 'nasal', ...
  default_frequency      text,
  default_duration       text,           -- "5 days", "single dose", "ongoing", ...
  default_quantity       text,
  default_repeats        integer NOT NULL DEFAULT 0,
  -- Directions / counsel text shown to the pharmacist + patient.
  default_directions     text,
  -- Optional safety-net wording (advice on when to return / red flags)
  -- separate from directions. Provider can copy into the safety-net
  -- field of the note when applying.
  safety_net_text        text,
  -- Paediatric marker + guidance. is_paediatric flips the modal into
  -- paediatric mode when the template is applied. weight_based_dose
  -- carries free-form guidance ({ "mg_per_kg": 25, "max_mg": 500,
  -- "notes": "..." } or similar) — the modal renders it as guidance
  -- text; no auto-calculation this pass (that's a follow-up).
  is_paediatric          boolean NOT NULL DEFAULT false,
  weight_based_dose      jsonb,
  -- Controlled-drug flag. Telehealth prescribing of controlled drugs
  -- is prohibited under NZ law — the modal already warns; templates
  -- that carry this flag are excluded from the provider picker but
  -- retained in admin for the record (some are useful in-person only).
  controlled_drug        boolean NOT NULL DEFAULT false,
  -- Soft-delete + versioning. Admin can retire a template without
  -- losing the audit-log trail of prior use.
  is_active              boolean NOT NULL DEFAULT true,
  -- Optional provenance note (e.g. "BPAC 2024 CAP guideline") for the
  -- clinical governance trail.
  source                 text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES providers(id) ON DELETE SET NULL,
  updated_by             uuid REFERENCES providers(id) ON DELETE SET NULL
);

-- Case-insensitive uniqueness on name — prevents accidental duplicates
-- in the picker if two admins add "Acute otitis media" independently.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shared_rx_templates_name_lower
  ON shared_prescription_templates (lower(name));

CREATE INDEX IF NOT EXISTS idx_shared_rx_templates_active_condition
  ON shared_prescription_templates (is_active, lower(condition))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_shared_rx_templates_drug
  ON shared_prescription_templates (lower(drug_name))
  WHERE is_active = true;

COMMENT ON TABLE shared_prescription_templates IS
  'Clinic-wide curated prescription templates (task #229). Provider picker
   in PrescribeModal loads active rows as rx starting points. Admin CRUD
   via /api/prescription-templates. Distinct from prescription_templates
   which is per-provider favourites.';

-- RLS: service-role only. All client access goes through
-- /api/prescription-templates which enforces admin auth for writes.
ALTER TABLE shared_prescription_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access shared_rx_templates"
  ON shared_prescription_templates;
CREATE POLICY "Service role full access shared_rx_templates"
  ON shared_prescription_templates FOR ALL USING (true);

REVOKE ALL ON shared_prescription_templates FROM anon, authenticated;

-- Auto-touch updated_at on every UPDATE. Cheap trigger, no dependency
-- on plpgsql extensions beyond the default.
CREATE OR REPLACE FUNCTION touch_shared_rx_templates_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shared_rx_templates_touch
  ON shared_prescription_templates;
CREATE TRIGGER trg_shared_rx_templates_touch
  BEFORE UPDATE ON shared_prescription_templates
  FOR EACH ROW EXECUTE FUNCTION touch_shared_rx_templates_updated_at();
