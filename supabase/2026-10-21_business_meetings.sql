-- Business meetings — Tere-branded video room for external partner calls
-- (PHOs, employers, insurers, workforce agencies). Separate from
-- job_interviews so business contacts don't pollute the Careers pipeline.
--
-- Guest flow: admin creates meeting → system emails .ics + join link →
-- guest clicks link → lands on waiting-room page polling for admission →
-- admin clicks Admit → guest joins the LiveKit room.
--
-- Host flow: admin clicks "Join as host" in Meetings tab → mint one-shot
-- LiveKit token → open MeetingHostRoom.
--
-- Admission model: single enum column on the row. v1 is 1 guest per
-- meeting; multi-guest can land as a child table later.

CREATE TABLE IF NOT EXISTS business_meetings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   text NOT NULL,                -- e.g. "Marlborough PHO — pilot kickoff"
  host_provider_id        uuid REFERENCES providers(id) ON DELETE SET NULL,
  guest_name              text NOT NULL,
  guest_email             text,
  guest_organisation      text,                         -- optional, for display only
  scheduled_at            timestamptz,                  -- null = ad-hoc
  duration_minutes        integer NOT NULL DEFAULT 30,
  room_key                text NOT NULL UNIQUE,
  guest_join_token        text NOT NULL UNIQUE,
  admission_status        text NOT NULL DEFAULT 'awaiting_knock'
                          CHECK (admission_status IN ('awaiting_knock','knocking','admitted','denied')),
  guest_knocked_at        timestamptz,
  admitted_at             timestamptz,
  denied_at               timestamptz,
  status                  text NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  started_at              timestamptz,
  ended_at                timestamptz,
  notes                   text DEFAULT '',
  created_by_provider_id  uuid REFERENCES providers(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_meetings_status_idx           ON business_meetings (status);
CREATE INDEX IF NOT EXISTS business_meetings_admission_idx        ON business_meetings (admission_status) WHERE admission_status IN ('knocking','awaiting_knock');
CREATE INDEX IF NOT EXISTS business_meetings_scheduled_at_idx     ON business_meetings (scheduled_at);
CREATE INDEX IF NOT EXISTS business_meetings_host_idx             ON business_meetings (host_provider_id);

-- All access is server-mediated via /api/business-meetings (admin) and
-- /api/meeting-join (public guest). Service role bypasses RLS.
ALTER TABLE business_meetings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON business_meetings FROM anon, authenticated;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.business_meetings_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_meetings_touch ON business_meetings;
CREATE TRIGGER business_meetings_touch
  BEFORE UPDATE ON business_meetings
  FOR EACH ROW EXECUTE FUNCTION public.business_meetings_touch_updated_at();
