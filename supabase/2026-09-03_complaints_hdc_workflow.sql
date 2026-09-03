-- HDC Right 10 complaint workflow: 20-working-day response tracking
-- + HDC escalation fields (task #361).
--
-- Under the HDC Code of Rights, providers must acknowledge complaints
-- within 5 working days and respond within 20 working days (or explain
-- delay in writing). This migration adds the fields needed to track that
-- timeline + integration points with HDC (their reference, our submission).

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS acknowledged_at       timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by       uuid,      -- providers.id
  ADD COLUMN IF NOT EXISTS response_due_at       timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to           uuid,      -- providers.id
  ADD COLUMN IF NOT EXISTS assigned_to_name      text,      -- snapshot
  ADD COLUMN IF NOT EXISTS resolution_type       text CHECK (resolution_type IN (
    'resolved_no_further_action', 'apology_issued', 'process_change',
    'refund_issued', 'referred_to_hdc', 'referred_to_privacy_commissioner',
    'referred_to_mcnz', 'no_case_to_answer', 'other'
  )),
  ADD COLUMN IF NOT EXISTS hdc_reference         text,      -- HDC's tracking number when they open a case
  ADD COLUMN IF NOT EXISTS hdc_notified_at       timestamptz,
  ADD COLUMN IF NOT EXISTS hdc_response_submitted_at timestamptz;

-- Backfill response_due_at for any existing open complaints (20 working
-- days ≈ 28 calendar days from received_at/created_at). Ceil to noon NZT
-- so admin has a whole day, not 23:59.
UPDATE complaints
   SET response_due_at = (created_at + interval '28 days')::date + interval '12 hours'
 WHERE response_due_at IS NULL
   AND status IN ('open', 'investigating');

-- Auto-set response_due_at on INSERT for new complaints.
CREATE OR REPLACE FUNCTION set_complaint_response_due()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.response_due_at IS NULL THEN
    NEW.response_due_at := (COALESCE(NEW.created_at, now()) + interval '28 days')::date + interval '12 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaints_set_response_due ON complaints;
CREATE TRIGGER complaints_set_response_due
  BEFORE INSERT ON complaints
  FOR EACH ROW EXECUTE FUNCTION set_complaint_response_due();

-- Widen the status CHECK to add the new lifecycle values.
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE complaints ADD CONSTRAINT complaints_status_check
  CHECK (status IN ('open', 'acknowledged', 'investigating', 'resolved', 'escalated_to_hdc', 'closed'));

CREATE INDEX IF NOT EXISTS complaints_response_due
  ON complaints(response_due_at)
  WHERE status IN ('open', 'acknowledged', 'investigating');

CREATE INDEX IF NOT EXISTS complaints_hdc_ref
  ON complaints(hdc_reference)
  WHERE hdc_reference IS NOT NULL;

COMMENT ON COLUMN complaints.response_due_at IS
  'Deadline for the substantive HDC-style response (Right 10: 20 working days ≈ 28 calendar days from receipt). Auto-set by trigger on INSERT.';
COMMENT ON COLUMN complaints.hdc_reference IS
  'HDC-assigned case reference if the complainant escalates to HDC and we receive a s34 notification.';
