-- Interpreter standard (task #436). Records HOW interpretation was delivered
-- for consults where interpreter_requested=true. Using a family member
-- (especially a child or relative) to interpret an acute consult is a
-- well-known HDC-criticised failure mode; the provider needs to record
-- the source, and the UI banner-flags family_member as risky.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS interpreter_source text,
  ADD COLUMN IF NOT EXISTS interpreter_source_notes text,
  ADD COLUMN IF NOT EXISTS interpreter_source_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS interpreter_source_recorded_by uuid REFERENCES providers(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_interpreter_source_check') THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_interpreter_source_check
      CHECK (interpreter_source IS NULL OR interpreter_source IN (
        'certified_service',       -- Language Line / Ezispeak / other accredited
        'certified_bilingual_clinician', -- e.g. the provider themselves is bilingual + qualified
        'family_member_adult',     -- risky — banner warns
        'family_member_child',     -- HIGH-RISK — banner strongly discourages
        'friend',                  -- risky — banner warns
        'declined',                -- patient declined despite offer
        'not_needed'               -- reassessment during consult found interpreter not needed
      ));
  END IF;
END $$;

COMMENT ON COLUMN consultations.interpreter_source IS
  'Task #436 — HOW interpretation was delivered on a consult where
   interpreter_requested=true. HDC has criticised the use of family
   members (particularly children) to interpret acute consults; UI
   flag on the provider chart banner-warns when this is selected.';
