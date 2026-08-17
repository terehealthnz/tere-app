-- Signatures storage bucket — provider prescriber signatures uploaded via
-- the SignaturePad component (Admin panel > Add/Edit provider). Signature
-- images are then embedded into prescription PDFs by buildPrescriptionPdf.
--
-- Fixes "Save failed: Bucket not found" on signature save. Bucket must exist
-- before SignaturePad uploads — nothing in the app auto-creates it.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signatures', 'signatures', true, 524288,  -- 512 KB
  ARRAY['image/png', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
   SET public             = true,
       file_size_limit    = 524288,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg']::text[]
 WHERE id = 'signatures';

-- Signatures are public-read (they render inside prescription PDFs which
-- pharmacies open outside the app).
DROP POLICY IF EXISTS "Public read signatures" ON storage.objects;
CREATE POLICY "Public read signatures"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'signatures');

-- INSERT: allowed for anon so the current client-side SignaturePad upload
-- (supabase.storage.from('signatures').upload(...) from Admin.jsx) works
-- against the anon key. Provider identity is enforced UI-side (only shown
-- inside the admin-authed EditProviderModal). Server-mediated upload via
-- /api/providers is a follow-up (see PROVIDER-SIG-UPLOAD-TODO below).
DROP POLICY IF EXISTS "Anon insert signatures" ON storage.objects;
CREATE POLICY "Anon insert signatures"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'signatures');

-- UPDATE/DELETE via anon key deliberately NOT allowed — a signature is
-- write-once. Admins can overwrite by re-saving (upsert=false triggers a
-- unique filename per save via the SignaturePad UUID scheme).

-- PROVIDER-SIG-UPLOAD-TODO: replace the direct anon supabase.storage upload
-- in Admin.jsx SignaturePad with a POST to /api/providers?action=upload_sig
-- so uploads run through service_role + admin auth check. That lets us drop
-- the anon INSERT policy above.
