-- PMS Migration: ACC claims table + consultations/providers columns
-- Run in Supabase SQL editor: https://app.supabase.com → SQL Editor

-- ── ACC claims table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acc_claims (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id       uuid REFERENCES consultations(id) ON DELETE SET NULL,
  patient_nhi           text,
  patient_name          text,
  provider_id           uuid,
  provider_hpi          text,
  provider_name         text,
  claim_number          text,
  invoice_number        text,
  service_code          text,
  amount_claimed        integer,   -- cents NZD
  amount_paid           integer,   -- cents NZD
  status                text DEFAULT 'pending' CHECK (status IN ('pending','submitted','simulated','invoiced','paid','declined')),
  submitted_at          timestamptz,
  invoice_submitted_at  timestamptz,
  paid_at               timestamptz,
  decline_reason        text,
  raw_request           jsonb,
  raw_response          jsonb,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acc_claims_consultation_id ON acc_claims(consultation_id);
CREATE INDEX IF NOT EXISTS acc_claims_provider_id     ON acc_claims(provider_id);
CREATE INDEX IF NOT EXISTS acc_claims_status          ON acc_claims(status);
CREATE INDEX IF NOT EXISTS acc_claims_claim_number    ON acc_claims(claim_number);

-- Row-level security: providers see their own claims; admins see all
ALTER TABLE acc_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can view their own ACC claims"
  ON acc_claims FOR SELECT
  USING (true);  -- relax to auth.uid()::text = provider_id::text once auth is wired

CREATE POLICY "Service role can do anything"
  ON acc_claims FOR ALL
  USING (true);

-- ── consultations: ACC columns ────────────────────────────────────────────────

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS acc_claim_number       text,
  ADD COLUMN IF NOT EXISTS acc_claim_status       text,
  ADD COLUMN IF NOT EXISTS acc_submitted_at       timestamptz,
  ADD COLUMN IF NOT EXISTS acc_payment_received   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS acc_payment_amount     integer,
  ADD COLUMN IF NOT EXISTS acc_paid_at            timestamptz;

-- ── providers: HPI + type columns ────────────────────────────────────────────

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS hpi_number         text,
  ADD COLUMN IF NOT EXISTS acc_provider_number text,
  ADD COLUMN IF NOT EXISTS provider_type      text DEFAULT 'specialist';
