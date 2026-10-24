-- GP scheduled booking Phase 1. Idempotent. One statement per logical line
-- so Supabase SQL editor doesn't mis-parse multi-line continuations.

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consult_type text NOT NULL DEFAULT 'acute' CHECK (consult_type IN ('acute','scheduled_gp'));

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS funding_source text NOT NULL DEFAULT 'patient_paid';

DO $$ BEGIN
  ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_funding_source_check;
  ALTER TABLE consultations ADD CONSTRAINT consultations_funding_source_check CHECK (funding_source IN ('patient_paid','employer_paid','pho_capitated'));
END $$;

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS funder_id uuid;

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS appointment_id uuid;

-- Per-queue roster flags. Everyone currently in the system is acute, so
-- can_work_acute defaults to true. can_work_gp is opt-in per provider.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS can_work_acute boolean NOT NULL DEFAULT true;

ALTER TABLE providers ADD COLUMN IF NOT EXISTS can_work_gp boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS funders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, funding_source text NOT NULL CHECK (funding_source IN ('patient_paid','employer_paid','pho_capitated')), enrolment_check_endpoint text, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE funders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funders_deny_public ON funders;
CREATE POLICY funders_deny_public ON funders FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON funders FROM anon, authenticated;
GRANT ALL ON funders TO service_role;

DO $$ BEGIN
  ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_funder_fk;
  ALTER TABLE consultations ADD CONSTRAINT consultations_funder_fk FOREIGN KEY (funder_id) REFERENCES funders(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS appointments_gp (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE, slot_start timestamptz NOT NULL, slot_end timestamptz NOT NULL, booking_status text NOT NULL DEFAULT 'available' CHECK (booking_status IN ('available','held','confirmed','cancelled','completed','no_show')), consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL, booking_token_hash text, booking_code_hash text, patient_email text, created_via text NOT NULL DEFAULT 'admin_manual', cancelled_at timestamptz, cancelled_reason text, created_at timestamptz NOT NULL DEFAULT now());

CREATE UNIQUE INDEX IF NOT EXISTS appointments_gp_unique_live ON appointments_gp (provider_id, slot_start) WHERE booking_status NOT IN ('cancelled','no_show');

CREATE INDEX IF NOT EXISTS appointments_gp_available ON appointments_gp (slot_start) WHERE booking_status = 'available';

CREATE INDEX IF NOT EXISTS appointments_gp_by_provider ON appointments_gp (provider_id, slot_start);

DO $$ BEGIN
  ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_appointment_fk;
  ALTER TABLE consultations ADD CONSTRAINT consultations_appointment_fk FOREIGN KEY (appointment_id) REFERENCES appointments_gp(id) ON DELETE SET NULL;
END $$;

CREATE INDEX IF NOT EXISTS consultations_scheduled_queue ON consultations (status, created_at) WHERE consult_type = 'scheduled_gp' AND status NOT IN ('complete','completed','cancelled','archived','closed');

INSERT INTO feature_flags (key, enabled, description) VALUES ('gp_scheduled_booking_enabled', false, 'Controls /book page + /api/gp-* endpoints. Off until first GP is credentialled and funder MoU signed.') ON CONFLICT (key) DO NOTHING;
