-- Add safety-netting peer-review to CGM meeting types (task #433).
-- Turns the min-40-chars safety_netting_text field from a checkbox into a
-- real peer-reviewed control. Providers pick 5 recent samples to review
-- per CGM cycle; the ids are logged so the sample is auditable.

ALTER TABLE cgm_meetings DROP CONSTRAINT IF EXISTS cgm_meetings_meeting_type_check;
ALTER TABLE cgm_meetings
  ADD CONSTRAINT cgm_meetings_meeting_type_check
  CHECK (meeting_type IN (
    'clinical_governance',
    'peer_review',
    'morbidity_mortality',
    'incident_review',
    'audit_review',
    'safety_netting_review',
    'other'
  ));

ALTER TABLE cgm_meetings
  ADD COLUMN IF NOT EXISTS safety_netting_samples_reviewed_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN cgm_meetings.safety_netting_samples_reviewed_ids IS
  'Task #433 — consultation IDs whose safety_netting_text was peer-reviewed
   in this CGM cycle. Answers the regulator question: "was the return
   advice appropriate for this presentation" — which a character-count
   can''t verify.';
