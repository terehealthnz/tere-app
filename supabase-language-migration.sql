-- Language support migration
-- Adds patient_language to consultations and translation columns to messages

-- Consultations: store selected language at triage time
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS patient_language text NOT NULL DEFAULT 'en';

-- Messages: store translated text and detected source language
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS translated_text text;
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS detected_language text;

-- Ensure messages table has open RLS policies (required for chat to work)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'open_access'
  ) THEN
    CREATE POLICY "open_access" ON messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
