-- Child / dependent consent + safeguarding pathway (task #434).
-- Real HDC + Oranga Tamariki exposure with no warning + high stakes for
-- a service seeing families remotely. Adds three concerns to consultations:
--
--   1. Who is consenting on behalf of a <18yo patient (name + relationship +
--      contact + guardianship verification timestamp)
--   2. Provider-flag for safeguarding concerns raised or observed during a
--      consult (any age patient — abuse, neglect, unsafe situation)
--   3. Runbook + tracker for Oranga Tamariki mandatory reporting (see
--      docs/regulatory/child-safeguarding-oranga-tamariki-runbook.md)

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS consenting_adult_name         text,
  ADD COLUMN IF NOT EXISTS consenting_adult_relationship text,   -- CHECK below
  ADD COLUMN IF NOT EXISTS consenting_adult_phone        text,
  ADD COLUMN IF NOT EXISTS guardianship_verified_at      timestamptz,
  ADD COLUMN IF NOT EXISTS guardianship_verified_by      uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS safeguarding_concern_flagged  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS safeguarding_concern_at       timestamptz,
  ADD COLUMN IF NOT EXISTS safeguarding_concern_notes    text,
  ADD COLUMN IF NOT EXISTS safeguarding_concern_flagged_by uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS safeguarding_concern_type     text;   -- CHECK below

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_consenting_adult_relationship_check') THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_consenting_adult_relationship_check
      CHECK (consenting_adult_relationship IS NULL OR consenting_adult_relationship IN (
        'parent', 'legal_guardian', 'grandparent_carer',
        'foster_carer_ot', 'whanau_carer', 'oranga_tamariki_worker',
        'other_authorised'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_safeguarding_concern_type_check') THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_safeguarding_concern_type_check
      CHECK (safeguarding_concern_type IS NULL OR safeguarding_concern_type IN (
        'suspected_physical_abuse',
        'suspected_sexual_abuse',
        'suspected_neglect',
        'suspected_emotional_abuse',
        'family_violence_disclosed',
        'unsafe_home_environment',
        'suicide_self_harm_dependent',
        'other'
      ));
  END IF;
END $$;

-- Every safeguarding-concern flag becomes a queryable row for admin +
-- eventually a provider_notifications entry (wired in the endpoint).
CREATE INDEX IF NOT EXISTS consultations_safeguarding_flagged_idx
  ON consultations (safeguarding_concern_at DESC)
  WHERE safeguarding_concern_flagged = true;

COMMENT ON COLUMN consultations.consenting_adult_relationship IS
  'Task #434 — required for <18yo consults. Documents who is consenting on
   behalf of the child under HDC Right 7 + capacity-to-consent framework.';
COMMENT ON COLUMN consultations.safeguarding_concern_flagged IS
  'Task #434 — provider-flag when abuse/neglect/unsafe situation suspected
   or disclosed during any consult. Routes to admin + triggers Oranga
   Tamariki mandatory reporting runbook (docs/regulatory/child-safeguarding-oranga-tamariki-runbook.md).';
