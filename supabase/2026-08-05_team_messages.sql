-- Internal team messaging — Slack-lite for provider ↔ admin discussion.
--
-- v1 scope: single shared channel visible to every active provider or
-- admin. Text body with @mentions and optional patient-chart attachment.
-- Unread count per user = messages posted after their last_read_at.
-- Threading, DMs, multiple channels, and file attachments are deferred.

CREATE TABLE IF NOT EXISTS team_messages (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id    uuid NOT NULL REFERENCES providers(id) ON DELETE SET NULL,
  author_name  text NOT NULL,
  author_role  text,                     -- snapshot: admin | provider | supervisor | billing_admin
  body         text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  mentions     uuid[] NOT NULL DEFAULT '{}',
  patient_ref  uuid,                     -- optional patient chart link (patients.id, not FK to allow patient deletion)
  patient_name text,                     -- snapshot at send time
  created_at   timestamptz NOT NULL DEFAULT now(),
  edited_at    timestamptz,
  deleted_at   timestamptz               -- soft delete; the row stays in the channel history greyed-out
);

CREATE INDEX IF NOT EXISTS team_messages_recent_idx
  ON team_messages (created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS team_messages_mentions_idx
  ON team_messages USING GIN (mentions);

-- Per-provider read state (single channel, so PK = provider_id).
CREATE TABLE IF NOT EXISTS team_reads (
  provider_id  uuid PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_reads    ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access team_messages" ON team_messages;
CREATE POLICY        "Service role full access team_messages" ON team_messages FOR ALL USING (true);
DROP POLICY IF EXISTS "Service role full access team_reads"    ON team_reads;
CREATE POLICY        "Service role full access team_reads"    ON team_reads    FOR ALL USING (true);

COMMENT ON TABLE team_messages IS
  'Internal provider/admin chat. Single shared channel in v1. Not part of patient health record; not surfaced to patients.';
COMMENT ON COLUMN team_messages.mentions IS
  'Array of provider IDs @-mentioned in the body. Populated server-side by parsing the body against active providers at send time.';
COMMENT ON COLUMN team_messages.patient_ref IS
  'Optional patients.id reference — when present, the message renders a clickable card linking to /clinician/patient/<id>. Not a FK because we may retain internal chat referencing patients that were later merged/deleted.';
