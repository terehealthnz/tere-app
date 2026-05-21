-- Consultation types + in-call messaging migration
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql

-- 1. Add consultation_type to consultations
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS consultation_type text DEFAULT 'video';

-- 2. Messages table for in-call chat
CREATE TABLE IF NOT EXISTS messages (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id   uuid        REFERENCES consultations(id) ON DELETE CASCADE,
  sender            text        NOT NULL CHECK (sender IN ('patient', 'provider')),
  message           text,
  photo_url         text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_consult_idx ON messages (consultation_id, created_at);

-- 3. Enable realtime on messages table
-- Run this in the Supabase dashboard under Database > Replication
-- or uncomment the line below (requires superuser):
-- ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- 4. Row-level security (optional — remove if you want open access for dev)
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Anyone can read messages" ON messages FOR SELECT USING (true);
-- CREATE POLICY "Anyone can insert messages" ON messages FOR INSERT WITH CHECK (true);
