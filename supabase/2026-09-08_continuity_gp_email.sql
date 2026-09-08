-- Continuity of care — GP letter loop closeout.
-- Adds gp_email so finalise can auto-fire /api/send-to-gp when provider picks
-- 'GP letter SENT this consult'. Without an email the disposition falls through
-- to the pending worklist in Admin for manual send later.
--
-- Also adds a `notes_final` reference (already exists but doubly used here) —
-- no new schema needed for that path.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS continuity_gp_email text;

-- Index the pending-letters worklist query: consults where a GP letter was
-- flagged but never actually sent. Small hot set; targeted partial index.
CREATE INDEX IF NOT EXISTS idx_consultations_pending_gp_letter
  ON consultations (completed_at DESC)
  WHERE continuity_disposition IN ('gp_letter_sent','gp_letter_to_send')
    AND gp_letter_sent_at IS NULL;
