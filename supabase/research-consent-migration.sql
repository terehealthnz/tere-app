-- Add research_consent column to consultations table
-- Run this in the Supabase SQL editor
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS research_consent BOOLEAN NOT NULL DEFAULT false;
