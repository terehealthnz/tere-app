-- ARC build — migration #2. Builds on supabase/2026-11-05_aged_care_org_type.sql
-- (984f41b) which added org_type + flat EPOA contact fields + calling-on-behalf.
-- This one closes the clinical-safety and delivery-integrity gaps Patrick
-- flagged after reviewing the first-pass plan:
--
--   1. ACP / resus / transfer status, surfaced at top of chart. Single most-
--      consulted field in aged-care after-hours. Collides with the system-
--      enforced divert list (slide 10 of the ARC deck): an NFR resident with
--      chest pain should be supported in-place per their ACP, not helicoptered
--      against their documented wishes.
--
--   2. EPOA modelled correctly, not as parental consent. Adults are presumed
--      competent; a welfare EPOA (not a property EPOA) only becomes operative
--      after mental-incapacity certification, and the attorney must still
--      consult the donor where possible. Default consult consent to the
--      resident; EPOA override is explicit and requires a reason.
--
--   3. Stable facility_resident_id as the primary key for resident identity
--      across monthly CSV re-uploads. Name + DOB is not stable ("Peggy" vs
--      "Margaret") and silently splits the per-resident tally the deck sells.
--      Soft-delete only — these rows have consultations attached under a 10y
--      health-record retention obligation.
--
--   4. vitals_source as a separate column from the vitals JSON so WAND Class
--      IIa accuracy claims don't get contaminated by HCA-typed BP readings.
--      Separate facility_vitals jsonb column for the manual-entry values.
--
--   5. Disposition enum per consult (managed-in-place / referred-GP / ED
--      transfer / 111). Renewal driver per the deck — "how many ended in
--      transfer anyway" is the number that closes the next contract.
--
--   6. Named clinical + backup delivery contacts on the facility record
--      (not info@), with SES bounce tracking so a silently bounced monthly
--      report fires an admin alert instead of looking like a successful send.
--
--   7. facility_pharmacy_id so ARC Rx default-routes to the facility's
--      contracted blister-pack dispensary (Zoom / Medico Pack / Rowe's /
--      etc.), overridable per-script.
--
-- Idempotent — safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ACP + resus + transfer status on the resident record.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE employer_employees
  ADD COLUMN IF NOT EXISTS resus_status text,
  ADD COLUMN IF NOT EXISTS transfer_to_hospital boolean,
  ADD COLUMN IF NOT EXISTS acp_summary text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employer_employees_resus_status_check'
  ) THEN
    ALTER TABLE employer_employees
      ADD CONSTRAINT employer_employees_resus_status_check
      CHECK (
        resus_status IS NULL
        OR resus_status IN ('for_resus', 'nfr', 'unknown')
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. EPOA, properly structured. The flat epoa_name/phone/email from
--    2026-11-05_aged_care_org_type.sql stay — they're still the contact
--    details for whichever attorney is named. These columns add the
--    legally-required semantics so a clinician can tell whether an EPOA
--    can actually consent to treatment.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE employer_employees
  ADD COLUMN IF NOT EXISTS epoa_type text,
  ADD COLUMN IF NOT EXISTS epoa_activated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS epoa_capacity_cert_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employer_employees_epoa_type_check'
  ) THEN
    ALTER TABLE employer_employees
      ADD CONSTRAINT employer_employees_epoa_type_check
      CHECK (
        epoa_type IS NULL
        OR epoa_type IN ('none', 'property_only', 'personal_care_welfare', 'both')
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Stable facility_resident_id + soft-delete for re-upload safety.
--    Scoped unique per employer_id (two different facilities can both use
--    'R001'). Nullable to avoid breaking existing employer_employees rows
--    that don't belong to ARC facilities; application code enforces NOT
--    NULL for org_type='aged_care' inserts.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE employer_employees
  ADD COLUMN IF NOT EXISTS facility_resident_id text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial unique index: active rows only. Soft-deleted rows may re-use the
-- ID of a later-readmitted resident without conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employer_employees_facility_resident_id
  ON employer_employees (employer_id, facility_resident_id)
  WHERE facility_resident_id IS NOT NULL AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Per-consult consent + vitals provenance + disposition.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS consent_source text DEFAULT 'resident',
  ADD COLUMN IF NOT EXISTS consent_override_reason text,
  ADD COLUMN IF NOT EXISTS vitals_source text,
  ADD COLUMN IF NOT EXISTS facility_vitals jsonb,
  ADD COLUMN IF NOT EXISTS disposition text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_consent_source_check'
  ) THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_consent_source_check
      CHECK (
        consent_source IN ('resident', 'epoa_personal_care', 'next_of_kin_only', 'emergency_implied')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_consent_override_requires_reason'
  ) THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_consent_override_requires_reason
      CHECK (
        consent_source = 'resident'
        OR (consent_override_reason IS NOT NULL AND length(trim(consent_override_reason)) > 0)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_vitals_source_check'
  ) THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_vitals_source_check
      CHECK (
        vitals_source IS NULL
        OR vitals_source IN ('wand_camera', 'facility_entered', 'mixed', 'none')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_disposition_check'
  ) THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_disposition_check
      CHECK (
        disposition IS NULL
        OR disposition IN (
          'managed_in_place',
          'referred_gp',
          'transferred_ed',
          'called_111',
          'arranged_followup',
          'acp_comfort_in_place'
        )
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Named clinical + backup contacts on the facility record, plus
--    SES bounce tracking so a bounced monthly report blocks retries and
--    fires an admin alert. billing_email from migration #1 stays — it's
--    the accounts-payable address for the invoice itself.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS clinical_contact_name text,
  ADD COLUMN IF NOT EXISTS clinical_contact_email text,
  ADD COLUMN IF NOT EXISTS backup_contact_name text,
  ADD COLUMN IF NOT EXISTS backup_contact_email text,
  ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS delivery_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status_detail text,
  ADD COLUMN IF NOT EXISTS facility_pharmacy_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employers_delivery_status_check'
  ) THEN
    ALTER TABLE employers
      ADD CONSTRAINT employers_delivery_status_check
      CHECK (delivery_status IN ('ok', 'bounced', 'complaint'));
  END IF;
END $$;

-- FK to pharmacies — pharmacies table should already exist from
-- 2026-07-05_pharmacy_contacts.sql. Guarded in case the referenced
-- table name differs; app-level validation is the authoritative gate.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pharmacies')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'employers_facility_pharmacy_id_fkey'
     )
  THEN
    ALTER TABLE employers
      ADD CONSTRAINT employers_facility_pharmacy_id_fkey
      FOREIGN KEY (facility_pharmacy_id) REFERENCES pharmacies(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Comments documenting the schema intent so a future dev reading
-- information_schema sees the "why" without hunting through git blame.
-- ─────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN employer_employees.resus_status IS
  'ACP resus status for ARC residents. NFR means a clinician must NOT auto-divert chest pain / arrest-risk symptoms to 111 against the resident''s documented ACP. See ARC deck slide 10 clinical-safety carve-out.';
COMMENT ON COLUMN employer_employees.transfer_to_hospital IS
  'ACP hospital-transfer status. FALSE = comfort cares in place per advance directive; clinician supports facility to manage in-place rather than default divert to ED.';
COMMENT ON COLUMN employer_employees.facility_resident_id IS
  'Stable per-facility primary key for monthly CSV re-upload merges. Never hard-delete; soft-delete via deleted_at because consultations FK and 10y retention obligations apply.';
COMMENT ON COLUMN employer_employees.epoa_type IS
  'NZ law distinguishes property EPOA (cannot consent to treatment) from personal-care-and-welfare EPOA (can, but only once donor is certified mentally incapable and after consulting donor). personal_care_welfare + epoa_activated=true is the only combination that lets an attorney consent on behalf.';
COMMENT ON COLUMN consultations.consent_source IS
  'Who consented to this consult. Default resident. epoa_personal_care is an explicit override that requires consent_override_reason AND verification that the resident''s epoa_type=personal_care_welfare AND epoa_activated=true. HDC Right 7 territory.';
COMMENT ON COLUMN consultations.vitals_source IS
  'Provenance of the vitals reading. wand_camera is the only source covered by MedSafe WAND Class IIa certification. facility_entered (HCA / RN typed from in-house equipment) is clinically useful but NOT part of the accuracy dataset backing regulatory claims.';
COMMENT ON COLUMN consultations.facility_vitals IS
  'Vitals typed in by facility staff from in-house equipment (manual BP cuff, SpO2 probe, etc.). Structured jsonb {sbp, dbp, hr, rr, spo2, temp, bgl, measured_by}. Kept separate from vitals JSON which is WAND-captured.';
COMMENT ON COLUMN consultations.disposition IS
  'Consult outcome. Renewal metric per ARC deck. acp_comfort_in_place is the carve-out for NFR residents whose ACP says manage-in-place even for symptoms that would otherwise auto-divert to 111/ED.';
COMMENT ON COLUMN employers.clinical_contact_email IS
  'Named clinical lead at the facility. Monthly report delivery target (primary). Validated at save time to reject generic info@/admin@/accounts@ addresses.';
COMMENT ON COLUMN employers.delivery_status IS
  'SES-reported deliverability for clinical + backup contacts. bounced blocks the next monthly cron fire for this facility until admin clears it (otherwise we silently keep thinking reports are landing).';

COMMIT;
