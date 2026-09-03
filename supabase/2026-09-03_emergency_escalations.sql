-- Emergency escalations tracking (task #420).
-- Every time a triage red-flag or divert fires, log it with the patient's
-- CURRENT physical location (not registered address — they may be at work,
-- in transit, at a friend's) so that a 111 escalation can be directed
-- accurately AND we can later prove the control operated + reconstruct
-- outcomes.
--
-- Paired with a periodic cron that flags escalations with no outcome
-- recorded after 24h — admin follows up with the patient by phone/SMS.

CREATE TABLE IF NOT EXISTS emergency_escalations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link + who.
  consultation_id          uuid REFERENCES consultations(id) ON DELETE SET NULL,
  patient_id               uuid REFERENCES patients(id)      ON DELETE SET NULL,
  patient_nhi              text,
  patient_name             text,
  patient_phone            text,

  -- When + what fired.
  escalated_at             timestamptz NOT NULL DEFAULT now(),
  escalation_type          text NOT NULL CHECK (escalation_type IN (
                             'red_flag_111',
                             'divert_ed',
                             'divert_urgent_care',
                             'divert_gp_today',
                             'provider_initiated_111'
                           )),
  matched_flags            text[] NOT NULL DEFAULT '{}',

  -- Patient's CURRENT physical location for 111 dispatch. Free-text always
  -- required; lat/lng if browser geolocation permitted. May be empty if the
  -- patient declined location — recorded so we know why.
  patient_location_text    text,
  patient_location_lat     numeric,
  patient_location_lng     numeric,
  patient_location_accuracy_m numeric,
  location_captured_at     timestamptz,
  location_declined_reason text,

  -- Outcome tracking. Admin records after follow-up call.
  outcome                  text CHECK (outcome IS NULL OR outcome IN (
                             'attended_ed',
                             'attended_urgent_care',
                             'called_111_ambulance',
                             'seen_by_gp',
                             'symptoms_resolved',
                             'refused_care',
                             'unable_to_contact',
                             'other'
                           )),
  outcome_notes            text,
  outcome_recorded_at      timestamptz,
  outcome_recorded_by      uuid REFERENCES providers(id) ON DELETE SET NULL,
  outcome_recorded_by_name text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emergency_escalations_open_idx
  ON emergency_escalations (escalated_at)
  WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS emergency_escalations_type_idx
  ON emergency_escalations (escalation_type, escalated_at);
CREATE INDEX IF NOT EXISTS emergency_escalations_patient_idx
  ON emergency_escalations (patient_id);

ALTER TABLE emergency_escalations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON emergency_escalations FROM anon;
REVOKE ALL ON emergency_escalations FROM authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON emergency_escalations TO service_role;
CREATE POLICY emergency_escalations_service_role_all ON emergency_escalations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION emergency_escalations_touch_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS emergency_escalations_touch_updated_at_trg ON emergency_escalations;
CREATE TRIGGER emergency_escalations_touch_updated_at_trg
  BEFORE UPDATE ON emergency_escalations
  FOR EACH ROW EXECUTE FUNCTION emergency_escalations_touch_updated_at();

COMMENT ON TABLE emergency_escalations IS
  'Task #420 — every 111/ED/urgent-care divert logged with the patient current
   location + outcome. Regulator asks: prove your red-flag system works.
   This is the evidence.';
