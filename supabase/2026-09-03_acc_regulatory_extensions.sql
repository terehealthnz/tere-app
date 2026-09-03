-- ACC regulatory extensions — data structures ACC auditors ask for that
-- weren't captured discretely before. Covers tasks #344–#348:
--   • rehab plan (goals, review cycle) as jsonb on the consult
--   • discharge summary as jsonb on the consult
--   • return-to-work status as jsonb on the consult
--   • outcome measures over time (pain / function / RTW) as separate table
--   • case-manager comms per claim as separate table
--   • consult peer-review as separate table
--
-- All migrations idempotent — safe to re-run.

-- ── Consultation-level jsonb artefacts ────────────────────────────────────
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS rehab_plan         jsonb,
  ADD COLUMN IF NOT EXISTS discharge_summary  jsonb,
  ADD COLUMN IF NOT EXISTS rtw_status         jsonb;

COMMENT ON COLUMN consultations.rehab_plan IS
  '{ goals: [text], plan: text, review_cycle_weeks: int, next_review_at: timestamptz, updated_at, updated_by_provider_id } — ACC ARTP-style plan captured discretely (not buried in SOAP). Required for rehab-provider audit.';
COMMENT ON COLUMN consultations.discharge_summary IS
  '{ status: resolved|referred|lost_to_followup, summary_text, discharge_date, referred_to, discharged_by_provider_id } — closes out the ACC treatment episode.';
COMMENT ON COLUMN consultations.rtw_status IS
  '{ status: full|partial|off_work|returned, hours_per_week, restrictions: text, target_date, recorded_by_provider_id, recorded_at } — for work-related ACC claims.';

-- ── Outcome measures (time-series per consult) ────────────────────────────
CREATE TABLE IF NOT EXISTS consultation_outcome_measures (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id   uuid REFERENCES consultations(id) ON DELETE CASCADE,
  patient_nhi       text,
  claim_number      text,   -- denormalised so we can group by claim without a triple-join
  measure_type      text NOT NULL CHECK (measure_type IN (
    'pain_score_0_10', 'function_score_0_100', 'rtw_percent',
    'range_of_motion_degrees', 'grip_strength_kg', 'other_numeric', 'other_text'
  )),
  value_numeric     numeric,
  value_text        text,
  recorded_at       timestamptz DEFAULT now(),
  recorded_by       uuid,     -- providers.id
  notes             text
);
CREATE INDEX IF NOT EXISTS consultation_outcome_measures_consult ON consultation_outcome_measures(consultation_id);
CREATE INDEX IF NOT EXISTS consultation_outcome_measures_claim   ON consultation_outcome_measures(claim_number);
CREATE INDEX IF NOT EXISTS consultation_outcome_measures_recorded ON consultation_outcome_measures(recorded_at DESC);

ALTER TABLE consultation_outcome_measures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON consultation_outcome_measures;
CREATE POLICY "service_role_all" ON consultation_outcome_measures FOR ALL USING (true);

-- ── ACC case-manager comms log (per-claim inbox/outbox) ───────────────────
CREATE TABLE IF NOT EXISTS acc_communications (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id          uuid REFERENCES acc_claims(id) ON DELETE CASCADE,
  claim_number      text,     -- denormalised for search when claim row is unknown
  direction         text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel           text CHECK (channel IN ('email', 'phone', 'letter', 'portal', 'webhook', 'other')),
  from_addr         text,
  to_addr           text,
  subject           text,
  body              text,
  occurred_at       timestamptz DEFAULT now(),
  recorded_by       uuid,     -- providers.id who logged (for phone calls / letters)
  attachment_url    text,
  metadata          jsonb
);
CREATE INDEX IF NOT EXISTS acc_communications_claim_id     ON acc_communications(claim_id);
CREATE INDEX IF NOT EXISTS acc_communications_claim_number ON acc_communications(claim_number);
CREATE INDEX IF NOT EXISTS acc_communications_occurred     ON acc_communications(occurred_at DESC);

ALTER TABLE acc_communications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON acc_communications;
CREATE POLICY "service_role_all" ON acc_communications FOR ALL USING (true);

COMMENT ON TABLE acc_communications IS
  'Every ACC case-manager interaction linked to a claim (their decline emails, phone-call summaries, our replies). Fed by the ACC webhook + admin manual entry. Included in the audit-bundle output.';

-- ── Consult peer-review (feeds ACC clinical audit + internal QI) ──────────
CREATE TABLE IF NOT EXISTS consultation_peer_reviews (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id   uuid REFERENCES consultations(id) ON DELETE CASCADE,
  reviewer_id       uuid,     -- providers.id
  reviewer_name     text,     -- snapshot
  agreement         text CHECK (agreement IN ('agree', 'agree_with_comments', 'disagree_minor', 'disagree_major')),
  notes             text,
  sample_reason     text,     -- e.g. 'random_10pct', 'flagged_high_cost', 'complaint_investigation'
  reviewed_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultation_peer_reviews_consult ON consultation_peer_reviews(consultation_id);
CREATE INDEX IF NOT EXISTS consultation_peer_reviews_reviewer ON consultation_peer_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS consultation_peer_reviews_when   ON consultation_peer_reviews(reviewed_at DESC);

ALTER TABLE consultation_peer_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON consultation_peer_reviews;
CREATE POLICY "service_role_all" ON consultation_peer_reviews FOR ALL USING (true);
