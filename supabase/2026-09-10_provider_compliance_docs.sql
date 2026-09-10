-- Provider compliance documents: APC + Medical Indemnity + active contract.
--
-- Existing infra:
--   - job_onboarding_intake has apc_expiry_date/apc_storage_key but only
--     for applicants who flowed Careers → Interview → Offer → Onboarding
--     wizard. Existing providers (Patrick, Rachel) never went through
--     that path, so their APC + MI live nowhere.
--   - Medical Indemnity has no infra at all — only referenced in v8.1
--     contract clauses.
--
-- This migration adds APC + MI + active-contract snapshot fields directly
-- on `providers` so every provider (old + new) has one row that carries
-- their compliance state. Compliance-expiry cron (task #413) can then key
-- off these fields to nag 60/30/7 days pre-expiry.

ALTER TABLE providers
  -- APC (Annual Practising Certificate — MCNZ for doctors, NCNZ for nurses)
  ADD COLUMN IF NOT EXISTS apc_number          text,
  ADD COLUMN IF NOT EXISTS apc_expiry_date     date,
  ADD COLUMN IF NOT EXISTS apc_storage_key     text,       -- in `provider-compliance` bucket
  ADD COLUMN IF NOT EXISTS apc_uploaded_at     timestamptz,
  -- Medical Indemnity (MPS, Medico Legal Society NZ, or equivalent)
  ADD COLUMN IF NOT EXISTS mi_insurer          text,
  ADD COLUMN IF NOT EXISTS mi_policy_number    text,
  ADD COLUMN IF NOT EXISTS mi_expiry_date      date,
  ADD COLUMN IF NOT EXISTS mi_storage_key      text,
  ADD COLUMN IF NOT EXISTS mi_uploaded_at      timestamptz,
  -- Active signed contract (job_offers row that carries the executed v8.x)
  ADD COLUMN IF NOT EXISTS active_contract_offer_id uuid REFERENCES job_offers(id) ON DELETE SET NULL;

-- Indexes for the nightly expiry-digest cron to cheaply pluck out
-- soon-to-expire compliance docs.
CREATE INDEX IF NOT EXISTS providers_apc_expiry_idx ON providers(apc_expiry_date) WHERE apc_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS providers_mi_expiry_idx  ON providers(mi_expiry_date)  WHERE mi_expiry_date  IS NOT NULL;

-- Private storage bucket for compliance PDFs. Same pattern as
-- `offer-contracts` — service-key uploads only, signed URLs issued
-- to the provider themselves + admins.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('provider-compliance', 'provider-compliance', false)
  ON CONFLICT (id) DO NOTHING;
