-- HDC Rights extensions (tasks #392–#400).
--
-- Small schema additions to close the last 9 HDC Code of Rights gaps.
-- No new tables — extends existing ones.

-- Right 10(4) — HDC Advocacy Service auto-reference on complaint responses.
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS hdc_advocacy_offered  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hdc_advocacy_offered_at timestamptz;

COMMENT ON COLUMN complaints.hdc_advocacy_offered IS
  'True once the complainant has been given HDC Advocacy Service contact (0800 555 050) — HDC Code Right 10(4).';

-- Right 5(4) — interpreter request captured in triage. Column already exists
-- (big-migration.sql line 8, added earlier); just add language + comment.
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS interpreter_language text;

COMMENT ON COLUMN consultations.interpreter_requested IS
  'Patient requested an interpreter during triage — HDC Code Right 5(4).';

-- Right 7(2) — capacity-to-consent screening in triage.
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS capacity_confirmed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS capacity_confirmed_by_self  boolean;

COMMENT ON COLUMN consultations.capacity_confirmed_at IS
  'When the patient ticked the capacity + informed-decision screen in triage. HDC Right 7(2).';

-- Right 4(2) — cultural safety training attestation (mirror of phi_training).
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS last_cultural_safety_training_at      timestamptz,
  ADD COLUMN IF NOT EXISTS cultural_safety_training_valid_until  timestamptz;

COMMENT ON COLUMN providers.last_cultural_safety_training_at IS
  'When this provider last completed cultural safety training (Māori Health Plan + HDC Right 4(2) cultural competence). Annual cycle.';

-- Right 5(2) — accessibility prefs are client-side (localStorage). No DB.
-- If we later want per-account prefs we can add patients.accessibility_prefs jsonb.

-- Right 9 — research consent revocation reuses existing research_consent
-- boolean on consultations; portal endpoint just flips it. No schema change.
