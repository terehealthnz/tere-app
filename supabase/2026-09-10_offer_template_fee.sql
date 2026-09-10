-- 2026-09-10_offer_template_fee.sql
--
-- Parameterize per-template contractor fee so the same JSON contract
-- (v8.1 doctor, v8.1-np, etc.) can be sent at different rates without
-- editing the JSON. The contract text uses {{fee_per_consult}}; the
-- send_contract flow snapshots this value from the template.
--
--   offer_templates.fee_per_consult : text (e.g. "NZ$25", "NZ$20").
--     Kept as text (not numeric) so we can carry the currency prefix
--     and any qualifier ("NZ$18 rural") without needing extra columns.

ALTER TABLE offer_templates
  ADD COLUMN IF NOT EXISTS fee_per_consult TEXT;

-- Back-fill existing rows.
UPDATE offer_templates SET fee_per_consult = 'NZ$25' WHERE contract_version = 'v8.1'    AND fee_per_consult IS NULL;
UPDATE offer_templates SET fee_per_consult = 'NZ$20' WHERE contract_version = 'v8.1-np' AND fee_per_consult IS NULL;
