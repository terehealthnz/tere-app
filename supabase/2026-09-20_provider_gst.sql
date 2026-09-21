-- GST support for contractor payments (Ian Mallett query 2026-09-20).
--
-- NZ GST rules: a contractor whose annual turnover exceeds $60k must be
-- GST-registered, and their invoices to Tere must include GST at 15%. Tere
-- covers the GST on top of the base per-consult fee (same model as TripleO):
--
--   Base rate:      $25/consult
--   GST @ 15%:      $3.75
--   Tere pays:      $28.75
--   Provider net:   $25   (they remit $3.75 to IRD in their GST return)
--   Tere claim:     $3.75 as input tax credit (Tere is GST-registered)
--
-- Non-GST-registered contractors: no uplift, invoice is $25/consult flat.
--
-- Columns:
--   gst_registered  boolean, defaults false
--   gst_number      text — IRD-format xxx-xxx-xxx (13 chars incl. dashes)
--
-- Validation is applied at the endpoint layer (_providers.js) and UI, not
-- via a CHECK constraint, so old rows without a valid GST number don't
-- break migration.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS gst_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_number     text;

COMMENT ON COLUMN providers.gst_registered IS
  'Contractor is GST-registered with IRD. Triggers 15% GST uplift on per-consult payroll (task Ian Mallett 2026-09-20).';
COMMENT ON COLUMN providers.gst_number IS
  'IRD GST number, format xxx-xxx-xxx. Required when gst_registered=true. Appears on payroll invoice line.';

-- Same fields on job_applications so the onboarding wizard captures GST
-- status at intake time and it copies through to the provider row on
-- approval.
ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS gst_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_number     text;

-- Payroll GST breakdown. Store the GST amount ADDED to base_total at the
-- time payroll was calculated, so the record survives even if the
-- provider's GST status changes later. total_amount stays as base fees
-- (what Tere owes for services); actual payable = total_amount + gst_amount.
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS gst_amount numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN payroll_periods.gst_amount IS
  'GST uplift for GST-registered contractors (15% of total_amount, frozen at calculate time).';
