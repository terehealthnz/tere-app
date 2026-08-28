-- Job offers — DocuSign-style dual signing for candidates advancing past
-- interview.
--
-- Flow:
--   1. Provider creates offer row via /api/job-applications?action=create_offer
--      (status='sent'). Applicant is emailed a link to /offer/sign/<token>.
--   2. Applicant reads terms + signs (typed name + optional canvas signature
--      captured as PNG data URL). Server stores applicant_signed_*.
--      status='applicant_signed'. Provider is emailed to countersign.
--   3. Provider countersigns from Admin panel. Server renders final PDF
--      combining both signatures and uploads to `offers` bucket. Status
--      flips to 'countersigned', pdf_storage_key populated. Applicant is
--      emailed the final signed PDF (via signed URL).
--
-- One offer per application is the normal case; multiple allowed if an offer
-- is cancelled and re-issued (application_id is NOT unique). Latest by
-- created_at is the "current" one for UI purposes.

CREATE TABLE IF NOT EXISTS job_offers (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id                uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  created_by_provider_id        uuid REFERENCES providers(id) ON DELETE SET NULL,
  role_title                    text NOT NULL,                  -- e.g. "Nurse Practitioner"
  compensation                  text NOT NULL,                  -- free text: "$130/hr contractor" or "$120k p.a."
  start_date                    date,
  contract_terms                text NOT NULL,                  -- offer letter body (markdown-ish, rendered plain in PDF)

  applicant_sign_token          text NOT NULL UNIQUE,           -- URL-safe (~32 chars)
  applicant_signed_name         text,                           -- typed full name
  applicant_signed_png          text,                           -- data URL of canvas signature (optional)
  applicant_signed_ip           text,
  applicant_signed_user_agent   text,
  applicant_signed_at           timestamptz,

  countersigned_by_provider_id  uuid REFERENCES providers(id) ON DELETE SET NULL,
  countersigned_name            text,                           -- typed full name of Tere signer
  countersigned_at              timestamptz,

  pdf_storage_key               text,                           -- <offer_id>.pdf in the `offers` bucket

  status                        text NOT NULL DEFAULT 'sent'
                                CHECK (status IN ('draft','sent','applicant_signed','countersigned','cancelled')),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_offers_application_idx ON job_offers (application_id);
CREATE INDEX IF NOT EXISTS job_offers_status_idx      ON job_offers (status);
CREATE INDEX IF NOT EXISTS job_offers_created_at_idx  ON job_offers (created_at DESC);

-- Lock down — all access via /api/job-applications (service role).
ALTER TABLE job_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON job_offers FROM anon, authenticated;

-- Touch updated_at on any change.
CREATE OR REPLACE FUNCTION public.job_offers_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_offers_touch ON job_offers;
CREATE TRIGGER job_offers_touch
  BEFORE UPDATE ON job_offers
  FOR EACH ROW EXECUTE FUNCTION public.job_offers_touch_updated_at();

-- Storage bucket for signed offer PDFs. Private — always accessed via signed URL.
-- Buckets are declared via storage.buckets in Supabase; RLS on storage.objects
-- ensures only service-role can read/write (the API mediates every access).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('offers', 'offers', false)
  ON CONFLICT (id) DO NOTHING;
