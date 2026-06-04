-- ── Patient flags extension migration ────────────────────────────────────────
-- Extends the existing patient_flags table to support:
--   • email-based lookup (not all patients have NHI)
--   • severity levels (info / warning / alert)
--   • consultation link
--   • resolution tracking (who resolved, when)

ALTER TABLE patient_flags
  ALTER COLUMN patient_nhi DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS patient_email  TEXT,
  ADD COLUMN IF NOT EXISTS severity       TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS consultation_id UUID,
  ADD COLUMN IF NOT EXISTS resolved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by   TEXT;

CREATE INDEX IF NOT EXISTS idx_flags_email ON patient_flags(patient_email);

-- Backfill severity for any existing rows
UPDATE patient_flags SET severity = 'info' WHERE severity IS NULL;
