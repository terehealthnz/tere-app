-- Add controlled_medication_mentioned flag to consultations table
-- Run in Supabase SQL editor

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS controlled_medication_mentioned BOOLEAN NOT NULL DEFAULT false;
