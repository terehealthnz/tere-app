-- Governance + regulatory extensions (tasks #410, #411, #412).
--
-- 1. conflict_of_interest_declarations — quarterly-refreshed register of
--    every provider's external roles, ownership stakes, and other conflicts.
-- 2. incidents.sac_severity + hqsc_notified_at — HQSC SAC coding on
--    internal incidents so we know which need HQSC notification.
-- 3. providers Nursing Council fields — mirror MCNZ pattern for NP hire.

-- ── Conflict of Interest register ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conflict_of_interest_declarations (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id        uuid NOT NULL,
  provider_name      text,
  declaration_type   text NOT NULL CHECK (declaration_type IN (
    'external_role', 'ownership_stake', 'directorship', 'family_member_in_industry',
    'consulting_income', 'research_funding', 'gifts_received', 'other'
  )),
  description        text NOT NULL,
  disclosed_at       timestamptz NOT NULL DEFAULT now(),
  active             boolean NOT NULL DEFAULT true,
  reviewed_at        timestamptz,
  reviewed_by        uuid,
  metadata           jsonb
);
CREATE INDEX IF NOT EXISTS coi_declarations_provider ON conflict_of_interest_declarations(provider_id);
CREATE INDEX IF NOT EXISTS coi_declarations_active ON conflict_of_interest_declarations(active) WHERE active = true;

ALTER TABLE conflict_of_interest_declarations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON conflict_of_interest_declarations;
CREATE POLICY "service_role_all" ON conflict_of_interest_declarations FOR ALL USING (true);

COMMENT ON TABLE conflict_of_interest_declarations IS
  'Provider-declared conflicts of interest — external roles, ownership stakes, directorships. Reviewed quarterly by admin. ISO 27001 + HDC governance expectation.';

-- ── HQSC SAC severity on incidents ─────────────────────────────────────────
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS sac_severity        text CHECK (sac_severity IN ('SAC1', 'SAC2', 'SAC3', 'SAC4')),
  ADD COLUMN IF NOT EXISTS hqsc_notified_at    timestamptz,
  ADD COLUMN IF NOT EXISTS hqsc_reference      text;

COMMENT ON COLUMN incidents.sac_severity IS
  'HQSC Severity Assessment Code (SAC1 highest = death/major perm harm, SAC4 lowest = no harm). SAC1/SAC2 must be reported to HQSC within 15 working days per Adverse Events Learning Programme.';

-- ── Nursing Council of NZ fields on providers ──────────────────────────────
-- Mirrors MCNZ pattern (mcnz_registration_number, apc_expiry_date on
-- job_onboarding_intake). NP hire pipeline needs these.
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS nursing_council_number  text,
  ADD COLUMN IF NOT EXISTS ncnz_apc_expiry         date,
  ADD COLUMN IF NOT EXISTS ncnz_scope              text;

COMMENT ON COLUMN providers.nursing_council_number IS
  'Nursing Council of New Zealand registration number for NPs and RNs. Same enforcement pattern as MCNZ.';
