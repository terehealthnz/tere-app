-- Chime SDK meeting persistence on consultations.
--
-- LiveKit rooms were derived by convention (room name = consultation id) —
-- no server-side state needed because LiveKit's identity is just the room
-- name string. Chime differs: CreateMeeting returns a server-generated
-- MeetingId + MediaRegion that both provider and patient join by. We
-- persist those on the consultation so the patient's join endpoint can
-- look up the meeting the provider already created for this consult.
--
-- chime_meeting_id     — Chime-assigned UUID; null when call not started
-- chime_meeting_region — AWS region the meeting was pinned to (ap-southeast-2
--                        for NZ patients, us-east-1 for US patients)
-- chime_meeting_started_at — audit/debug; when provider first hit create

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS chime_meeting_id TEXT,
  ADD COLUMN IF NOT EXISTS chime_meeting_region TEXT,
  ADD COLUMN IF NOT EXISTS chime_meeting_started_at TIMESTAMPTZ;

COMMENT ON COLUMN consultations.chime_meeting_id     IS 'Chime SDK meeting UUID (set on provider create-meeting, cleared on end).';
COMMENT ON COLUMN consultations.chime_meeting_region IS 'AWS region the Chime meeting is pinned to (ap-southeast-2 or us-east-1).';
