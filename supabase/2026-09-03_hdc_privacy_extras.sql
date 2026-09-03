-- HDC Right 8 (support person present) + privacy correction requests
-- + patient portal auth stub (tasks #362, #364).
--
-- Right 8: consumer has the right to have a support person of their choice
-- present. We didn't previously record whether one was present.
--
-- Privacy Rule 7: patients have the right to request correction of their
-- health information. Captured as a lightweight request-tracking table so
-- admin can review + action + audit-log.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS support_person_present  boolean,
  ADD COLUMN IF NOT EXISTS support_person_name     text;

COMMENT ON COLUMN consultations.support_person_present IS
  'HDC Code Right 8: was a support person present during the consult (patient choice). Boolean tick; name captured separately.';

-- Patient correction requests (Rule 7 / IPP7).
CREATE TABLE IF NOT EXISTS patient_correction_requests (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_nhi           text,
  patient_email         text,
  patient_name          text,
  submitted_via         text CHECK (submitted_via IN ('patient_portal', 'patient_support_form', 'email', 'phone', 'admin_entry')),
  target_field          text,        -- free-text: "medications section", "allergies", etc.
  current_value         text,        -- what the patient says is currently wrong
  requested_value       text,        -- what they want it changed to
  reason                text,
  status                text NOT NULL DEFAULT 'received' CHECK (status IN (
    'received', 'reviewing', 'accepted_and_corrected', 'accepted_with_annotation', 'declined', 'closed'
  )),
  resolution_notes      text,
  received_at           timestamptz DEFAULT now(),
  reviewed_by           uuid,        -- providers.id who actioned
  reviewed_at           timestamptz,
  actioned_at           timestamptz,
  ip                    text
);
CREATE INDEX IF NOT EXISTS patient_correction_requests_nhi ON patient_correction_requests(patient_nhi);
CREATE INDEX IF NOT EXISTS patient_correction_requests_status ON patient_correction_requests(status);
CREATE INDEX IF NOT EXISTS patient_correction_requests_received ON patient_correction_requests(received_at DESC);

ALTER TABLE patient_correction_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON patient_correction_requests;
CREATE POLICY "service_role_all" ON patient_correction_requests FOR ALL USING (true);

COMMENT ON TABLE patient_correction_requests IS
  'Patient-initiated corrections to their health record (Privacy Act 2020 IPP7 / HIPC Rule 7). Even declined requests must be logged and the annotation kept alongside the disputed record. Feeds a support-ticket-style admin queue.';
