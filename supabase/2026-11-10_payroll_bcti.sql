-- Payroll v4 — BCTI (Buyer-Created Tax Invoice) consent + bank-transfer double-check
--
-- Context: Patrick 2026-11-10 wants fortnightly payroll to produce a BCTI-marked
-- PDF per GST-registered provider, emailed by admin only after they've
-- physically done the bank transfer and double-checked the amount.
--
-- IRD requires the supplier (the contractor) to agree in writing that the
-- buyer (Tere) will issue BCTIs on their behalf. Under the 2023 modernised
-- GST rules (GST Act s24(2)) the agreement can be electronic + revocable.
-- We bake the consent into the "I'm GST registered" tick in MyProfile.
--
-- Fields added:
--   providers.gst_bcti_consent_at       — timestamp of the agreement
--   providers.gst_bcti_consent_version  — which consent copy they agreed to
--   providers.gst_bcti_consent_ip       — audit trail
--   payroll_periods.actual_paid_amount  — what admin typed after bank transfer
--   payroll_periods.confirmed_paid_at   — set when actual matches calculated
--   payroll_periods.confirmed_paid_by   — admin who confirmed
--   payroll_periods.bcti_number         — sequential BCTI number on the PDF
--   payroll_periods.bcti_sent_to        — email address the BCTI went to
--
-- bcti_number_seq : monotonically increasing sequence for BCTI numbering
--                   (format: BCTI-YYYY-NNNNN, derived at generate time).

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS gst_bcti_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS gst_bcti_consent_version text,
  ADD COLUMN IF NOT EXISTS gst_bcti_consent_ip      text;

COMMENT ON COLUMN providers.gst_bcti_consent_at IS
  'When the contractor consented to Tere Health issuing Buyer-Created Tax Invoices for their supply of services. Stamped by _providers.js when gst_registered flips to true with consent. Payroll refuses to issue a BCTI without this.';
COMMENT ON COLUMN providers.gst_bcti_consent_version IS
  'Version string of the BCTI consent copy the contractor agreed to (e.g. "v1-2026-11-10"). Lets us re-prompt existing providers if we revise the legal text.';

ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS actual_paid_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS confirmed_paid_at  timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_paid_by  uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bcti_number        text,
  ADD COLUMN IF NOT EXISTS bcti_sent_to       text;

COMMENT ON COLUMN payroll_periods.actual_paid_amount IS
  'The amount admin typed after doing the bank transfer. Payroll refuses to send the BCTI email unless abs(actual - (total_amount + gst_amount)) <= 0.01 — guards against fat-finger transfers.';
COMMENT ON COLUMN payroll_periods.bcti_number IS
  'Sequential BCTI number assigned when admin confirms payment. Format: BCTI-YYYY-NNNNN (e.g. BCTI-2026-00042). Must be unique; audit-grade.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_periods_bcti_number
  ON payroll_periods(bcti_number) WHERE bcti_number IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS bcti_number_seq START 1 INCREMENT 1 NO CYCLE;
COMMENT ON SEQUENCE bcti_number_seq IS
  'Monotonic sequence for BCTI numbering. Formatted BCTI-YYYY-NNNNN at the application layer. Never reset — audit continuity.';
