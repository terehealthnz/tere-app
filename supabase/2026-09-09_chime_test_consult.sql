-- Ephemeral test consult for Chime SDK live testing.
-- Two-device flow: phone = patient, laptop = provider.
--
-- Creates one patient + one consultation in 'ready' state, unassigned,
-- with a known patient_access_token so we can bypass triage and jump
-- straight to the call page.
--
-- Delete after testing:
--   DELETE FROM consultations WHERE id = '11111111-1111-4111-8111-111111111111';
--   DELETE FROM patients      WHERE id = '22222222-2222-4222-8222-222222222222';

INSERT INTO patients (
  id, first_name, last_name, date_of_birth, phone, email, nhi, is_practice
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'Chime', 'TestPatient', '1990-01-01',
  '+64211111111', 'chime-test@example.test', 'CHIMEZZ',
  false
) ON CONFLICT (id) DO UPDATE SET updated_at = now();

INSERT INTO consultations (
  id,
  patient_id,
  patient_first_name, patient_last_name, patient_dob,
  patient_nhi, patient_phone, patient_email,
  chief_complaint,
  consultation_type,
  status,
  is_practice,
  provider_id,
  patient_access_token,
  patient_access_token_expires_at
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'Chime', 'TestPatient', '1990-01-01',
  'CHIMEZZ', '+64211111111', 'chime-test@example.test',
  'Testing AWS Chime SDK end-to-end audio/video',
  'video',
  'ready',
  false,
  NULL,
  '33333333-3333-4333-8333-333333333333',
  now() + interval '24 hours'
) ON CONFLICT (id) DO UPDATE SET
  status = 'ready',
  provider_id = NULL,
  patient_access_token = '33333333-3333-4333-8333-333333333333',
  patient_access_token_expires_at = now() + interval '24 hours',
  chime_meeting_id = NULL,
  chime_meeting_started_at = NULL,
  updated_at = now();
