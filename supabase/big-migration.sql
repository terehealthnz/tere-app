-- Tere Health — Big feature migration
-- Run in Supabase SQL editor

-- ── 1. Add new columns to consultations ──────────────────────────────────────
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS booked_by_name        TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS booked_by_phone       TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS patient_relationship  TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS interpreter_requested BOOLEAN DEFAULT false;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS hdc_rights_accepted   BOOLEAN DEFAULT false;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS hdc_accepted_at       TIMESTAMPTZ;

-- ── 2. Appointments — add missing columns ────────────────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_date DATE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS slot_time TIME;

-- ── 3. Consents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE,
  consent_type    TEXT NOT NULL,
  granted         BOOLEAN NOT NULL,
  patient_name    TEXT,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consents_consultation ON consents(consultation_id);
CREATE INDEX IF NOT EXISTS idx_consents_type         ON consents(consent_type);
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access consents" ON consents FOR ALL USING (true);

-- ── 4. Incidents ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_type       TEXT NOT NULL,
  severity            TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  incident_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  patient_nhi         TEXT,
  description         TEXT NOT NULL,
  immediate_actions   TEXT,
  contributing_factors TEXT,
  provider_id         UUID,
  provider_name       TEXT,
  consultation_id     UUID,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  reportable_to_hdc   BOOLEAN DEFAULT false,
  resolution_notes    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_status   ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_date     ON incidents(incident_date DESC);
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access incidents" ON incidents FOR ALL USING (true);

-- ── 5. Complaints ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source                TEXT NOT NULL,
  patient_name          TEXT,
  patient_email         TEXT,
  patient_phone         TEXT,
  complaint_description TEXT NOT NULL,
  provider_id           UUID,
  provider_name         TEXT,
  consultation_id       UUID,
  consultation_date     DATE,
  severity              TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','escalated_to_hdc')),
  response_sent         BOOLEAN DEFAULT false,
  response_sent_at      TIMESTAMPTZ,
  resolution_notes      TEXT,
  lessons_learned       TEXT,
  hdc_notification      BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access complaints" ON complaints FOR ALL USING (true);

-- ── 6. Breach log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS breach_log (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_affected         TEXT NOT NULL,
  patients_affected     INTEGER,
  how_discovered        TEXT,
  immediate_actions     TEXT,
  breach_datetime       TIMESTAMPTZ NOT NULL,
  reported_by           TEXT,
  opc_notified          BOOLEAN DEFAULT false,
  opc_notified_at       TIMESTAMPTZ,
  patients_notified     BOOLEAN DEFAULT false,
  patients_notified_at  TIMESTAMPTZ,
  status                TEXT DEFAULT 'open' CHECK (status IN ('open','contained','closed')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE breach_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access breach_log" ON breach_log FOR ALL USING (true);

-- ── 7. Handover notes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS handover_notes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id   UUID,
  provider_name TEXT,
  note_text     TEXT NOT NULL,
  shift_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  acknowledged_by JSONB DEFAULT '[]',
  archived      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_handover_date     ON handover_notes(shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_handover_archived ON handover_notes(archived);
ALTER TABLE handover_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access handover" ON handover_notes FOR ALL USING (true);

-- ── 8. Patient flags ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_flags (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_nhi   TEXT NOT NULL,
  patient_name  TEXT,
  flag_type     TEXT NOT NULL,
  notes         TEXT,
  added_by      TEXT,
  added_by_id   UUID,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flags_nhi    ON patient_flags(patient_nhi);
CREATE INDEX IF NOT EXISTS idx_flags_active ON patient_flags(active);
ALTER TABLE patient_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access patient_flags" ON patient_flags FOR ALL USING (true);

-- ── 9. Consultation tokens (patient history links) ────────────────────────────
CREATE TABLE IF NOT EXISTS consultation_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used            BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tokens_token   ON consultation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_tokens_expires ON consultation_tokens(expires_at);
ALTER TABLE consultation_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access tokens" ON consultation_tokens FOR ALL USING (true);

-- ── 10. Analytics events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name  TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_event   ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_date    ON analytics_events(created_at DESC);
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access analytics" ON analytics_events FOR ALL USING (true);

-- ── 11. Drug interactions log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drug_interactions_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultation_id UUID,
  provider_id     UUID,
  drug_checked    TEXT NOT NULL,
  patient_meds    TEXT,
  interactions    JSONB,
  max_severity    TEXT,
  overridden      BOOLEAN DEFAULT false,
  override_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drug_log_consult ON drug_interactions_log(consultation_id);
CREATE INDEX IF NOT EXISTS idx_drug_log_date    ON drug_interactions_log(created_at DESC);
ALTER TABLE drug_interactions_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access drug_log" ON drug_interactions_log FOR ALL USING (true);
