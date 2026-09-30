-- On-call SMS ping: providers opt-in to receive an SMS when a new patient
-- enters the queue. Rate-limited server-side (10 min per provider) and
-- gated to clinic hours (08:00-20:00 Pacific/Auckland) and non-sandbox
-- consults. Content is generic — no PHI ever in the SMS body.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS mobile_phone              TEXT,
  ADD COLUMN IF NOT EXISTS sms_on_call               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_on_call_last_sent_at  TIMESTAMPTZ;

-- Partial index: only the rows we actually filter by. Keeps the index
-- tiny even as the providers table grows.
CREATE INDEX IF NOT EXISTS idx_providers_sms_on_call
  ON providers (id)
  WHERE sms_on_call = true;
