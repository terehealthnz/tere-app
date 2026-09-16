-- GP directory — seeded practice + provider lookup for continuity of care.
--
-- Continuity picker in ProviderNotes has been 3 free-text inputs
-- (name / practice / email) with autofill from prior consult. Real-world
-- rural cohort types the same handful of local practices repeatedly and
-- occasionally mistypes the email address, breaking the auto-send.
--
-- This adds a small normalized directory: practices and their providers,
-- seeded from PHO-published rosters (NMDHB Marlborough list dated
-- 2026-01-16 is the first). Autocomplete endpoint /api/gp-directory feeds
-- the picker, filling name+practice+email from a single selection.
--
-- Deliberately not tying into the HPI FHIR API yet — HPI is provider-only
-- (Patient.r etc are for NHI, not HPI) and the local PHO roster is more
-- current than HPI's registration snapshot in practice. Future work can
-- reconcile hpi_cpn onto gp_providers via a lookup script.

CREATE TABLE IF NOT EXISTS gp_practices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  address     text,
  phone       text,
  email       text,
  region      text NOT NULL,          -- 'marlborough', 'canterbury', etc.
  source      text,                   -- provenance, e.g. 'nmdhb_2026_01_16'
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, region)
);

CREATE TABLE IF NOT EXISTS gp_providers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES gp_practices(id) ON DELETE CASCADE,
  title       text DEFAULT 'Dr',
  given_name  text NOT NULL,
  family_name text NOT NULL,
  hpi_cpn     text,                   -- future: fill from HPI
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, given_name, family_name)
);

-- Case-insensitive search indexes for the picker autocomplete
CREATE INDEX IF NOT EXISTS idx_gp_providers_family_lower ON gp_providers (lower(family_name));
CREATE INDEX IF NOT EXISTS idx_gp_providers_given_lower  ON gp_providers (lower(given_name));
CREATE INDEX IF NOT EXISTS idx_gp_practices_region       ON gp_practices (region) WHERE active = true;

COMMENT ON TABLE gp_practices IS
  'PHO-published GP practices, seeded per region. Provenance in .source.
   Feeds the continuity-of-care picker in ProviderNotes.';
COMMENT ON TABLE gp_providers IS
  'GPs at each practice. UNIQUE by (practice_id, given, family) — a GP
   can appear at multiple practices (locum arrangements) as separate rows.';

-- Anon read is fine — this is public PHO information. No PHI in either table.
GRANT SELECT ON gp_practices  TO anon;
GRANT SELECT ON gp_providers  TO anon;
