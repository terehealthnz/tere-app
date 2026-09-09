-- Ephemeral test meetings for the provider "test my setup" flow.
-- No consult row involved (see api/_chime-meeting.js action=create-test),
-- so the main cron sweep can't find these — this table gives it a target.
--
-- Rows live at most a few minutes; anything >15min old is swept by
-- _cron-chime-cleanup.js. RLS is strict: only service-role writes/reads.
-- Providers never SELECT this table from the browser.

CREATE TABLE IF NOT EXISTS test_chime_meetings (
  meeting_id  TEXT PRIMARY KEY,
  region      TEXT NOT NULL,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  ttl_minutes INT  NOT NULL DEFAULT 5,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_chime_meetings_created_at_idx
  ON test_chime_meetings (created_at);

ALTER TABLE test_chime_meetings ENABLE ROW LEVEL SECURITY;

-- No policies granted — service_role bypasses RLS. Anon and authenticated
-- roles have no policy = no access. Deliberate: this table has no client
-- read path.

COMMENT ON TABLE test_chime_meetings IS
  'Solo Chime SDK meetings created by /provider/test-call for device verification. Swept after 15min by _cron-chime-cleanup.js.';
