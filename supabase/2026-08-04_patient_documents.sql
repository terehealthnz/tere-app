-- Patient Documents — provider-uploaded files attached to a patient chart.
-- Covers ad-hoc lab results the patient emailed us, external referral letters,
-- imaging PDFs (that didn't come via the Telnyx inbound-fax pipeline),
-- prior specialist correspondence, GP letters received, etc.
--
-- Scope: provider-uploaded only. Patient-side upload is a separate flow
-- (not in this migration). Auto-populated radiology reports still live in
-- the radiology_reports table and surface separately in the chart.

CREATE TABLE IF NOT EXISTS patient_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  file_url      text NOT NULL,      -- Supabase Storage public URL
  file_name     text,               -- original filename for display
  mime_type     text,
  file_size     integer,            -- bytes; capped at 20MB by bucket policy
  uploaded_by   uuid REFERENCES providers(id) ON DELETE SET NULL,
  uploaded_by_name text,            -- denormalised for stability if provider row is later deleted
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_documents_patient_idx
  ON patient_documents (patient_id, created_at DESC);

-- All access provider-authed via /api/patient-documents (service_role).
-- No anon policies added — patients can't upload their own docs through
-- this table yet; use the existing consult-scoped patient_documents flow
-- if that's needed later.
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

-- Storage bucket for the files themselves. Public read (so /doctor UI can
-- open View links without a signed URL round-trip) but INSERT locked to
-- authenticated + provider-authed API side.
-- Split INSERT + UPDATE to sidestep a Postgres type-inference gotcha on the
-- multi-element ARRAY literal — with ON CONFLICT DO UPDATE ... EXCLUDED, the
-- ARRAY's inferred element type has to be explicitly text[] or the EXCLUDED
-- pseudo-record fails to match the target column type at parse time.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-documents', 'patient-documents', true, 20971520,  -- 20 MB
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/heic', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
   SET public             = true,
       file_size_limit    = 20971520,
       allowed_mime_types = ARRAY[
         'application/pdf',
         'image/jpeg', 'image/png', 'image/heic', 'image/webp',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'text/plain'
       ]::text[]
 WHERE id = 'patient-documents';

DROP POLICY IF EXISTS "Providers can read patient documents" ON storage.objects;
CREATE POLICY "Providers can read patient documents"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'patient-documents');

-- Writes go through /api/patient-documents which uses service_role and
-- validates the caller is a provider before creating the storage object.
