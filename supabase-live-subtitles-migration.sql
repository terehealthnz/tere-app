-- Live subtitle transcript column
-- Stores bilingual segment history for medico-legal review after any consult
-- where AI subtitles were enabled. Structure:
--   [
--     { at: iso, speaker: 'patient'|'provider', src_lang: 'sm', src: '...',
--       tgt_lang: 'en', tgt: '...', confidence: 'high'|'medium'|'low' },
--     ...
--   ]

BEGIN;

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS transcript_translated JSONB NULL,
  ADD COLUMN IF NOT EXISTS subtitles_used BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subtitle_consent_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_consultations_subtitles_used
  ON public.consultations(subtitles_used) WHERE subtitles_used = TRUE;

COMMIT;
