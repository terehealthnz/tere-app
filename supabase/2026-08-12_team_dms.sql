-- Tere Chat v2 — direct messages between two providers.
--
-- Data model:
--   team_dm_threads     — one row per 1:1 conversation. Participants stored
--                         in canonical sorted order so a pair only ever has
--                         a single thread row regardless of who created it.
--   team_messages       — gains an optional dm_thread_id column. NULL = the
--                         existing shared '# General' channel; UUID = DM.
--   team_dm_reads       — per-provider last_read_at per DM thread, mirrors
--                         the existing team_reads table for the channel.

CREATE TABLE IF NOT EXISTS team_dm_threads (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_a  uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  participant_b  uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Force canonical order so any (X,Y) pair has exactly one thread.
  CONSTRAINT team_dm_threads_sorted    CHECK (participant_a < participant_b),
  CONSTRAINT team_dm_threads_not_self  CHECK (participant_a <> participant_b),
  UNIQUE (participant_a, participant_b)
);

ALTER TABLE team_messages
  ADD COLUMN IF NOT EXISTS dm_thread_id uuid REFERENCES team_dm_threads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS team_messages_dm_recent_idx
  ON team_messages (dm_thread_id, created_at DESC)
  WHERE dm_thread_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS team_dm_reads (
  provider_id    uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  dm_thread_id   uuid NOT NULL REFERENCES team_dm_threads(id) ON DELETE CASCADE,
  last_read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, dm_thread_id)
);

ALTER TABLE team_dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_dm_reads   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access team_dm_threads" ON team_dm_threads;
CREATE POLICY        "Service role full access team_dm_threads" ON team_dm_threads FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "Service role full access team_dm_reads"   ON team_dm_reads;
CREATE POLICY        "Service role full access team_dm_reads"   ON team_dm_reads   FOR ALL TO service_role USING (true);

COMMENT ON TABLE team_dm_threads IS
  '1:1 private DM threads between two providers. Sorted-pair uniqueness — no dupes if two people both hit "Start DM" simultaneously.';
