-- Clinical Governance Meeting minutes + cadence tracker (task #427).
-- Turns Clinical Governance Framework from "documented cadence" into
-- "evidence of operation" — what a regulator asks for when they read
-- "quarterly CGM" and want to see minutes.

CREATE TABLE IF NOT EXISTS cgm_meetings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_type           text NOT NULL CHECK (meeting_type IN (
                           'clinical_governance',
                           'peer_review',
                           'morbidity_mortality',
                           'incident_review',
                           'audit_review',
                           'other'
                         )),
  meeting_at             timestamptz NOT NULL,
  duration_minutes       int,
  chair_provider_id      uuid REFERENCES providers(id) ON DELETE SET NULL,
  chair_name             text,
  attendees              text[] NOT NULL DEFAULT '{}',
  agenda                 text,
  minutes                text NOT NULL,           -- min 200 chars
  actions_noted          text[] NOT NULL DEFAULT '{}',
  related_incident_ids   uuid[] NOT NULL DEFAULT '{}',
  next_meeting_due_at    timestamptz,
  created_by_provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cgm_meetings_type_at_idx ON cgm_meetings (meeting_type, meeting_at DESC);
CREATE INDEX IF NOT EXISTS cgm_meetings_due_idx    ON cgm_meetings (next_meeting_due_at) WHERE next_meeting_due_at IS NOT NULL;

ALTER TABLE cgm_meetings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cgm_meetings FROM anon;
REVOKE ALL ON cgm_meetings FROM authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON cgm_meetings TO service_role;
CREATE POLICY cgm_meetings_service_role_all ON cgm_meetings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION cgm_meetings_touch_updated_at()
RETURNS trigger AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS cgm_meetings_touch_updated_at_trg ON cgm_meetings;
CREATE TRIGGER cgm_meetings_touch_updated_at_trg BEFORE UPDATE ON cgm_meetings
  FOR EACH ROW EXECUTE FUNCTION cgm_meetings_touch_updated_at();
