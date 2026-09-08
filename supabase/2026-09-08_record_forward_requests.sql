-- Patient-driven "send my Tere records to my new GP" flow.
-- Fires from the after-visit email link (no-GP patients only). Patient enters
-- their new GP's name/practice/email; request lands in Admin worklist for
-- someone to review + trigger /api/send-to-gp with the compiled record.
--
-- Rural-NZ continuity fix (2026-09-08). Complements the continuity-block
-- 'patient has no GP — told to enrol' disposition. When patient later enrols
-- with a GP, they don't have to come back through triage to establish
-- continuity — one link click, one GP email, done.

CREATE TABLE IF NOT EXISTS record_forward_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
  patient_id     uuid REFERENCES patients(id) ON DELETE SET NULL,
  -- Snapshot of patient identity at request time (patient/consult rows can
  -- be redacted; keep a durable record for HDC audit).
  patient_name   text,
  patient_email  text,
  patient_nhi    text,
  -- New GP destination the patient entered.
  gp_name        text NOT NULL,
  gp_practice    text,
  gp_email       text NOT NULL,
  patient_note   text,
  -- Status lifecycle: pending → sent (admin fulfilled) OR declined.
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'declined')),
  fulfilled_at   timestamptz,
  fulfilled_by   uuid REFERENCES providers(id),
  admin_notes    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_record_forward_pending
  ON record_forward_requests (created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_record_forward_patient
  ON record_forward_requests (patient_id);

-- RLS: service-role only. Patient submission goes via /api/record-forward
-- (server-mediated with consult-id ownership check); admin fulfilment via
-- guardProvider. No direct client access.
ALTER TABLE record_forward_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access record_forward_requests" ON record_forward_requests;
CREATE POLICY "Service role full access record_forward_requests"
  ON record_forward_requests FOR ALL USING (true);
REVOKE ALL ON record_forward_requests FROM anon, authenticated;
