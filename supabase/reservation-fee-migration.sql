-- Add reservation_payment_intent_id to appointments table
-- Run this in the Supabase SQL editor
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reservation_payment_intent_id TEXT;
