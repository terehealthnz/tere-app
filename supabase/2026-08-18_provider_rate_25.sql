-- Bump default provider consultation rate $20 → $25.
-- Aligns provider payout with the ACC co-payment charged to patients
-- ($25 per Payment.jsx explainer + Landing.jsx pricing table). Also
-- brings the two "how much do we pay each consult" strings in the code
-- (api/_payroll.js FALLBACK_RATE + api/_pdf-builders.js) into sync
-- with the DB column default.
--
-- Backfill: any provider row currently at exactly 20.00 gets moved to
-- 25.00. Rows with a bespoke rate (e.g. someone we hired on a custom
-- deal) are left untouched.

ALTER TABLE providers
  ALTER COLUMN base_rate SET DEFAULT 25.00;

UPDATE providers
   SET base_rate = 25.00
 WHERE base_rate = 20.00;
