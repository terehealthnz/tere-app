-- 2026-09-10_authorised_signer.sql
--
-- Governance: only designated authorised signers can countersign Tere
-- Health contractor agreements. A director should never countersign
-- their own contract (self-dealing / conflict of interest). This
-- migration adds the flag + the explicit non-clinical signing title,
-- and records which authorised signer was assigned to each offer so
-- the countersign endpoint can enforce it.
--
--   providers.is_authorised_signer : ticked ON for anyone who is
--                                    authorised to bind Tere Health
--                                    to contractor agreements
--                                    (e.g. Justin, the CBO).
--   providers.signer_title         : the legal signing title (e.g.
--                                    "Chief Business Officer"), which
--                                    may differ from `specialty`.
--   job_offers.signer_provider_id  : the specific authorised signer
--                                    picked at send-time for this
--                                    offer. Only that provider can
--                                    countersign it.
--
-- No back-fill: existing rows are safe with the false default; any
-- already-sent offer that lacks signer_provider_id will be caught by
-- the fresh authorisation check on the countersign endpoint.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS is_authorised_signer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signer_title         TEXT;

ALTER TABLE job_offers
  ADD COLUMN IF NOT EXISTS signer_provider_id UUID REFERENCES providers(id);

-- Quick lookup when we need to enumerate authorised signers at
-- send-contract time.
CREATE INDEX IF NOT EXISTS providers_authorised_signer_idx
  ON providers (is_authorised_signer)
  WHERE is_authorised_signer = true;
