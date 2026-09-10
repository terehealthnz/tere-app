-- Versioned in-code contracts (v8.1 onwards).
--
-- Instead of storing the contract as a static PDF that can't substitute
-- {{contractor_full_name}} etc., we encode each contract version as a
-- JSON tree in the codebase (src/contracts/vX_Y.json) + a JSX renderer.
-- The renderer substitutes contractor identifiers at read-time and can
-- also generate a downloadable PDF from the same source.
--
-- Coexistence with the earlier attached-PDF flow:
--   - offer_templates.contract_version  → set for versioned JSX contracts
--   - offer_templates.contract_pdf_key  → set for one-off attached PDFs
--                                          (e.g. software licence agreements
--                                          to external companies)
--   - offer_templates.contract_terms    → legacy text-only body
-- Precedence in the render + wrapper: version > pdf_key > terms.

ALTER TABLE offer_templates
  ADD COLUMN IF NOT EXISTS contract_version text;

ALTER TABLE job_offers
  ADD COLUMN IF NOT EXISTS contract_version   text,
  -- Snapshot of contractor identifiers at offer-send time. Lets us
  -- regenerate the signed archive PDF later from just the offer row +
  -- the versioned JSON contract, without re-reading a mutable providers
  -- row. Fields we currently substitute:
  --   full_name, address, mcnz, cpn, acc_id, hpi_number, email
  ADD COLUMN IF NOT EXISTS contractor_snapshot jsonb;
