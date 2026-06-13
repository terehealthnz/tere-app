-- Capacitor push notifications — add native token columns to push_subscriptions
-- Run in Supabase SQL editor

-- Add new columns (safe to run even if table already exists)
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS consultation_id uuid REFERENCES consultations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS token           text,
  ADD COLUMN IF NOT EXISTS platform        text DEFAULT 'web' CHECK (platform IN ('web', 'ios', 'android'));

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx         ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_consultation_id_idx ON push_subscriptions(consultation_id);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_platform_idx         ON push_subscriptions(user_id, platform)         WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_consult_platform_idx      ON push_subscriptions(consultation_id, platform)  WHERE consultation_id IS NOT NULL;

-- RLS: providers can manage their own subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Patients (anon) can insert/update their own consultation's push token
CREATE POLICY "Anon can upsert consultation push token"
  ON push_subscriptions FOR INSERT
  WITH CHECK (user_id IS NULL AND consultation_id IS NOT NULL);

CREATE POLICY "Anon can update consultation push token"
  ON push_subscriptions FOR UPDATE
  USING (user_id IS NULL AND consultation_id IS NOT NULL);

-- Service role bypasses RLS (no policy needed)
