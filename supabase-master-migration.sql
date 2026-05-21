-- ═══════════════════════════════════════════════════════════════════
-- TERE HEALTH — MASTER MIGRATION (all pending changes in order)
-- Run once in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Providers table (multi-provider support) ─────────────────────

CREATE TABLE IF NOT EXISTS providers (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name           text        NOT NULL,
  last_name            text        NOT NULL,
  credential           text        NOT NULL DEFAULT 'M.D.',
  specialty            text,
  email                text,
  color                text        DEFAULT '#0B6E76',
  is_active            boolean     DEFAULT true,
  is_admin             boolean     DEFAULT false,
  is_provider          boolean     DEFAULT true,
  is_available         boolean     DEFAULT false,
  availability_message text,
  pin                  text        NOT NULL,
  prescriber_number    text,
  cpn                  text,
  created_at           timestamptz DEFAULT now()
);

INSERT INTO providers (first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, pin)
SELECT 'Patrick', 'Herling', 'M.D.', 'Emergency Medicine', '#0B6E76', true, true, true, 'tere2026'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE first_name = 'Patrick' AND last_name = 'Herling');

INSERT INTO providers (first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, pin)
SELECT 'Rachel', 'Thomas', 'M.D.', NULL, '#7C3AED', true, false, true, 'rachel2026'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE first_name = 'Rachel' AND last_name = 'Thomas');

INSERT INTO providers (first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, pin)
SELECT 'Justin', 'Thomas', '', NULL, '#374151', true, true, false, 'justin2026'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE first_name = 'Justin' AND last_name = 'Thomas');

-- ── 2. Consultations — provider columns ────────────────────────────

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS provider_id           uuid REFERENCES providers(id),
  ADD COLUMN IF NOT EXISTS provider_display_name text;

-- ── 3. Consultations — timing and notes columns ─────────────────────

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS started_at                    timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS consultation_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS notes_flagged                 boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes_finalised               boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes_finalised_at            timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_days                integer,
  ADD COLUMN IF NOT EXISTS outcome                       text,
  ADD COLUMN IF NOT EXISTS notes_draft                   jsonb;

-- ── 4. Consultations — consultation type ───────────────────────────

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS consultation_type text DEFAULT 'video';

-- ── 5. Messages table (in-call chat + async message type) ──────────

CREATE TABLE IF NOT EXISTS messages (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id   uuid        REFERENCES consultations(id) ON DELETE CASCADE,
  sender            text        NOT NULL CHECK (sender IN ('patient', 'provider')),
  message           text,
  photo_url         text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_consult_idx ON messages (consultation_id, created_at);

-- ── 6. Prescriptions table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prescriptions (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id     uuid        REFERENCES consultations(id) ON DELETE SET NULL,
  provider_id         uuid        REFERENCES providers(id) ON DELETE SET NULL,
  provider_name       text,
  prescriber_number   text,
  patient_name        text        NOT NULL,
  patient_nhi         text,
  patient_dob         text,
  patient_email       text,
  drug                text        NOT NULL,
  dose                text,
  directions          text,
  quantity            text,
  repeats             integer     DEFAULT 0,
  pharmacy_name       text,
  pharmacy_hpi_id     text,
  pharmacy_email      text,
  pharmacy_phone      text,
  pharmacy_address    text,
  prescription_number text,
  delivery_status     text        DEFAULT 'sent',
  delivery_error      text,
  created_at          timestamptz DEFAULT now()
);

-- ── 7. Radiology referrals table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS radiology_referrals (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id     uuid        REFERENCES consultations(id) ON DELETE SET NULL,
  provider_id         uuid        REFERENCES providers(id) ON DELETE SET NULL,
  provider_name       text,
  provider_cpn        text,
  patient_name        text        NOT NULL,
  patient_nhi         text,
  patient_dob         text,
  patient_email       text,
  investigation       text        NOT NULL,
  body_part           text,
  clinical_indication text,
  urgency             text,
  history             text,
  acc_claim_number    text,
  facility_name       text,
  facility_hpi_id     text,
  facility_email      text,
  facility_phone      text,
  facility_address    text,
  referral_number     text,
  referral_status     text        DEFAULT 'sent',
  result_received_at  timestamptz,
  result_notes        text,
  delivery_status     text        DEFAULT 'sent',
  delivery_error      text,
  created_at          timestamptz DEFAULT now()
);

-- ── 8. Indexes ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS prescriptions_provider_idx       ON prescriptions (provider_id, created_at);
CREATE INDEX IF NOT EXISTS prescriptions_consult_idx        ON prescriptions (consultation_id);
CREATE INDEX IF NOT EXISTS radiology_referrals_provider_idx ON radiology_referrals (provider_id, created_at);
CREATE INDEX IF NOT EXISTS radiology_referrals_status_idx   ON radiology_referrals (referral_status);
