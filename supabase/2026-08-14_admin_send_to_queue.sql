-- Admin "Send back to provider queue" workflow (2026-08-14)
--
-- Adds the audit + accounting columns needed to distinguish:
--   * a REOPEN of a recent completed consult (same encounter, no new charge),
--   * an admin-initiated FRESH consult with fee waived (Tere absorbs the
--     patient fee; provider still gets paid per-consult),
--   * an admin-initiated FRESH consult that is billable (patient pays).
--
-- Payroll queries (api/_payroll.js) already count every completed consult
-- regardless of fee_waived — this migration does not change provider payroll.
-- What it enables is (a) admin-side revenue/waiver reporting, (b) the audit
-- trail for who authorised each waiver + why, and (c) traceability when a
-- reopened consult ties back to the original encounter.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS fee_waived               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiver_reason            text,
  ADD COLUMN IF NOT EXISTS waived_by_provider_id    uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS waived_at                timestamptz,
  ADD COLUMN IF NOT EXISTS admin_initiated          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_initiated_by       uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_initiated_reason   text,
  ADD COLUMN IF NOT EXISTS reopened_from_consult_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_at              timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by              uuid REFERENCES providers(id) ON DELETE SET NULL;

-- Small helper indexes so the waiver + admin-initiated reports don't
-- table-scan.
CREATE INDEX IF NOT EXISTS idx_consultations_fee_waived        ON consultations(fee_waived)      WHERE fee_waived = true;
CREATE INDEX IF NOT EXISTS idx_consultations_admin_initiated   ON consultations(admin_initiated) WHERE admin_initiated = true;
CREATE INDEX IF NOT EXISTS idx_consultations_reopened_from     ON consultations(reopened_from_consult_id) WHERE reopened_from_consult_id IS NOT NULL;

COMMENT ON COLUMN consultations.fee_waived IS
  'True when Tere absorbed the patient fee for this consult. Provider payroll is unchanged. See docs/quality-management-system.md §4.3 for the accounting rationale.';
COMMENT ON COLUMN consultations.waiver_reason IS
  'Admin-selected reason for the fee waiver (service_correction, doctor_requested_followup, other + free text).';
COMMENT ON COLUMN consultations.admin_initiated IS
  'True when an admin created this consult via the "Send back to provider queue" workflow (not a patient-initiated intake).';
COMMENT ON COLUMN consultations.reopened_from_consult_id IS
  'When admin reopened an existing completed consult, this points to the original consult row for audit reconstruction. Reopens are capped at 7 days by the server; older encounters must use the fresh-consult (waiver) path instead.';
