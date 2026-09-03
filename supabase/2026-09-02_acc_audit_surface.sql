-- ACC audit surface: reconcile drifted columns + add explicit consent tracking
-- + index for the admin ACC Claims tab's date-range filter.
--
-- Background: api/_convert-to-acc.js writes acc_body_part, acc_read_code,
-- acc_converted_at, acc_converted_by, acc_converted_by_provider on
-- consultations, but pms-migration.sql (the canonical schema) never
-- defined them — prod picked them up through Supabase's tolerant PATCH.
-- New environments (staging, dev clones) would silently 400 on these
-- columns until this migration ran. Add IF NOT EXISTS so it's a no-op in
-- prod and a real fix everywhere else.
--
-- New: acc_consent_obtained_at + acc_consent_by_provider_id capture the
-- "three-part ACC45 consent" as a discrete, verifiable database fact
-- instead of a note-prose mention. ACC auditors can check consent
-- independently of the clinical narrative.
--
-- Idempotent. Safe to re-run.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS acc_body_part               text,
  ADD COLUMN IF NOT EXISTS acc_read_code               text,
  ADD COLUMN IF NOT EXISTS acc_converted_at            timestamptz,
  ADD COLUMN IF NOT EXISTS acc_converted_by            uuid,
  ADD COLUMN IF NOT EXISTS acc_converted_by_provider   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS acc_consent_obtained_at     timestamptz,
  ADD COLUMN IF NOT EXISTS acc_consent_by_provider_id  uuid;

COMMENT ON COLUMN consultations.acc_consent_obtained_at IS
  'Timestamp the provider attested (via ConvertToAccModal checkbox) that patient consent to bill ACC was obtained. Distinct from the free-text consent mention in clinical notes so ACC auditors can verify without reading the narrative.';
COMMENT ON COLUMN consultations.acc_consent_by_provider_id IS
  'Provider who attested to consent capture. FK-like reference to providers.id; kept as raw uuid so audit outlives provider row deletion.';

-- Date-range filtering on the admin ACC Claims tab (list view sorted by
-- created_at) benefits from an index — table will grow steadily and
-- auditors typically request Q1/Q2/etc slices.
CREATE INDEX IF NOT EXISTS acc_claims_created_at ON acc_claims(created_at DESC);
