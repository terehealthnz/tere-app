-- Inbound fax: land reports from radiology providers into a queue that
-- providers can review, match to a patient, and file.
--
-- Flow:
--   1. Radiology practice faxes to +64 3 568 8145 (Tere's Telnyx number).
--   2. Telnyx POSTs webhook to /api/telnyx-inbound-fax with a media URL.
--   3. Endpoint verifies Telnyx signature, downloads the PDF, uploads it to
--      Supabase Storage bucket `radiology-reports`, inserts a row here.
--   4. Provider UI lists unmatched reports; provider clicks to view PDF,
--      matches to a patient (and optionally to the originating referral).

CREATE TABLE IF NOT EXISTS radiology_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provenance
  received_at           timestamptz NOT NULL DEFAULT now(),
  sender_number         text,             -- caller ID from the fax (may be null)
  sender_name           text,             -- inferred from directory or blank
  telnyx_fax_id         text UNIQUE,      -- Telnyx's fax ID — idempotency key
  page_count            int,

  -- The PDF itself
  storage_path          text NOT NULL,    -- key within the radiology-reports bucket
  mime_type             text NOT NULL DEFAULT 'application/pdf',
  byte_size             int,

  -- Matching
  patient_id            uuid REFERENCES patients(id) ON DELETE SET NULL,
  referral_id           uuid REFERENCES radiology_referrals(id) ON DELETE SET NULL,
  consultation_id       uuid REFERENCES consultations(id) ON DELETE SET NULL,

  -- Workflow
  status                text NOT NULL DEFAULT 'unmatched'
                          CHECK (status IN ('unmatched','matched','reviewed','archived')),
  matched_by            uuid REFERENCES providers(id),
  matched_at            timestamptz,
  reviewed_by           uuid REFERENCES providers(id),
  reviewed_at           timestamptz,
  provider_notes        text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_radiology_reports_status
  ON radiology_reports(status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_radiology_reports_patient
  ON radiology_reports(patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_radiology_reports_referral
  ON radiology_reports(referral_id) WHERE referral_id IS NOT NULL;

ALTER TABLE radiology_reports ENABLE ROW LEVEL SECURITY;
-- No policies — service-role only via /api/radiology-reports endpoint,
-- which does its own guardProvider auth.

-- Storage bucket for the PDFs. Private — signed URLs only.
INSERT INTO storage.buckets (id, name, public)
VALUES ('radiology-reports', 'radiology-reports', false)
ON CONFLICT (id) DO NOTHING;
