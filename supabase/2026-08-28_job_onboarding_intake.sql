-- Job onboarding intake — post-offer self-service form for a new hire.
--
-- After the offer is countersigned, admin clicks "Send onboarding setup" in
-- the applicant panel. Server creates a job_onboarding_intake row and emails
-- the applicant a token'd link to /onboarding/setup/<token>. Applicant fills
-- a 4-step wizard, each section saves independently. When all 4 are done,
-- admin gets notified and can create the provider row from the intake data.
--
-- Section 2 (tax + bank) is encrypted at rest — the raw values never touch
-- disk in plaintext. Encryption/decryption happens in the Node layer using
-- AES-256-GCM with a key from process.env.ONBOARDING_ENCRYPTION_KEY (32 raw
-- bytes, base64-encoded).
--
-- Section 3 fields (MCNZ, HPI, prescriber #) are plain text — they're the
-- same fields already stored plaintext on providers, and admin needs to eyeball
-- them at approval time.
--
-- Files (APC PDF, signature PNG) are uploaded as base64 in the JSON body and
-- stored in the private `onboarding` bucket, keyed by <intake_id>-apc.pdf
-- and <intake_id>-sig.png.

CREATE TABLE IF NOT EXISTS job_onboarding_intake (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id                  uuid NOT NULL UNIQUE REFERENCES job_applications(id) ON DELETE CASCADE,
  created_by_provider_id          uuid REFERENCES providers(id) ON DELETE SET NULL,
  setup_token                     text NOT NULL UNIQUE,

  -- Section 1: personal + emergency contact
  preferred_name                  text,
  date_of_birth                   date,
  home_address                    text,
  mobile                          text,
  emergency_contact_name          text,
  emergency_contact_relationship  text,
  emergency_contact_phone         text,
  section_1_completed_at          timestamptz,

  -- Section 2: payroll + tax (ENCRYPTED at rest — bytea holding
  -- iv||tag||ciphertext for AES-256-GCM)
  ird_number_enc                  bytea,
  bank_account_enc                bytea,
  kiwisaver_rate                  text,                                  -- '3%' | '4%' | '6%' | '8%' | '10%' | 'opt_out'
  section_2_completed_at          timestamptz,

  -- Section 3: clinical credentials
  mcnz_registration_number        text,
  apc_expiry_date                 date,
  apc_storage_key                 text,                                  -- <intake_id>-apc.pdf in the `onboarding` bucket
  hpi_cpn                         text,
  prescriber_number               text,
  scope_of_practice               text,
  section_3_completed_at          timestamptz,

  -- Section 4: signature
  signature_storage_key           text,                                  -- <intake_id>-sig.png in the `onboarding` bucket
  section_4_completed_at          timestamptz,

  -- Overall
  status                          text NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','in_progress','complete','processed','cancelled')),
  completed_at                    timestamptz,                           -- set when all 4 sections done
  processed_at                    timestamptz,                           -- set when admin creates provider row from intake
  processed_provider_id           uuid REFERENCES providers(id) ON DELETE SET NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_onboarding_intake_application_idx ON job_onboarding_intake (application_id);
CREATE INDEX IF NOT EXISTS job_onboarding_intake_status_idx      ON job_onboarding_intake (status);

-- All access via /api/job-applications (service role bypasses RLS).
ALTER TABLE job_onboarding_intake ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON job_onboarding_intake FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.job_onboarding_intake_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_onboarding_intake_touch ON job_onboarding_intake;
CREATE TRIGGER job_onboarding_intake_touch
  BEFORE UPDATE ON job_onboarding_intake
  FOR EACH ROW EXECUTE FUNCTION public.job_onboarding_intake_touch_updated_at();

-- Private storage bucket for APC + signature files.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('onboarding', 'onboarding', false)
  ON CONFLICT (id) DO NOTHING;
