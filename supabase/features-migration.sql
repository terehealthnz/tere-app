-- Tere Health — Feature migration (recalls, appointments, templates, audit log)
-- Run in Supabase SQL editor

-- ── 1. Recall / follow-up on consultations ────────────────────────────────────
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS recall_date        DATE;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS recall_note        TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS recall_completed   BOOLEAN DEFAULT false;

-- ── 2. Payment amount storage ─────────────────────────────────────────────────
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_amount_nzd NUMERIC(10,2);

-- ── 3. GP discharge letter tracking ──────────────────────────────────────────
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS discharge_letter   TEXT;

-- ── 4. Appointments ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_first_name  TEXT NOT NULL,
  patient_last_name   TEXT NOT NULL,
  patient_email       TEXT,
  patient_phone       TEXT,
  patient_dob         DATE,
  patient_nhi         TEXT,
  provider_id         UUID REFERENCES providers(id) ON DELETE SET NULL,
  slot_start          TIMESTAMPTZ NOT NULL,
  slot_end            TIMESTAMPTZ NOT NULL,
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  consultation_id     UUID REFERENCES consultations(id) ON DELETE SET NULL,
  notes               TEXT,
  sms_sent            BOOLEAN DEFAULT false,
  reminder_sent       BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appts_slot_start  ON appointments(slot_start);
CREATE INDEX IF NOT EXISTS idx_appts_provider    ON appointments(provider_id);
CREATE INDEX IF NOT EXISTS idx_appts_status      ON appointments(status);
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access appts" ON appointments FOR ALL USING (true);

-- ── 5. Prescription templates ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescription_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  drug        TEXT NOT NULL,
  dose        TEXT,
  directions  TEXT,
  quantity    TEXT,
  repeats     INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rx_templates_provider ON prescription_templates(provider_id);
ALTER TABLE prescription_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access rx_templates" ON prescription_templates FOR ALL USING (true);

-- ── 6. Audit log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type       TEXT NOT NULL,
  provider_id      UUID,
  provider_name    TEXT,
  consultation_id  UUID,
  patient_ref      TEXT,
  metadata         JSONB,
  ip               TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event    ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_provider ON audit_logs(provider_id);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access audit" ON audit_logs FOR ALL USING (true);
