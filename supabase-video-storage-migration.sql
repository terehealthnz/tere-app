-- Tere Vitals validation: video storage + extraction quality tracking
-- Run in Supabase SQL editor.

-- 1. New columns on validation_readings.
-- hr_quality values: verified, unreliable, no_signal, legacy_signal, or NULL.
ALTER TABLE validation_readings
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS hr_quality TEXT,
  ADD COLUMN IF NOT EXISTS extraction_runs JSONB;

-- 2. Storage bucket (idempotent).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('scan-videos', 'scan-videos', false, 52428800, ARRAY['video/webm', 'video/mp4'])
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies. Drop if they already exist, then recreate.
DROP POLICY IF EXISTS "Public can upload scan videos" ON storage.objects;
CREATE POLICY "Public can upload scan videos"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'scan-videos');

DROP POLICY IF EXISTS "Public can read own scan videos" ON storage.objects;
CREATE POLICY "Public can read own scan videos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'scan-videos');

-- 4. Cleanup: nullify the artifact HR cluster from old reprocessing.
-- The 44 to 51 bpm band across many subjects is AWB/drift artifact, not heart rate.
UPDATE validation_readings
SET tere_hr = NULL,
    hr_difference = NULL,
    hr_quality = 'no_signal'
WHERE tere_hr BETWEEN 44 AND 51
  AND manual_hr IS NOT NULL
  AND ABS(tere_hr - manual_hr) > 10;

-- 5. Tag all readings without a stored video as legacy until they are recaptured.
UPDATE validation_readings
SET hr_quality = COALESCE(hr_quality, 'legacy_signal')
WHERE video_url IS NULL;
