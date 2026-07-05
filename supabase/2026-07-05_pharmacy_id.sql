-- Add pharmacy_id columns so the triage picker can save both the stable
-- Medsafe register id (slug) alongside the human-readable pharmacy_name.
-- Free-text `pharmacy` (on consultations) and `pharmacy_name` (on patients)
-- both remain — they're the display string. pharmacy_id is the reference key.
--
-- Run this in Supabase Studio → SQL editor before deploying the picker.

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS pharmacy_id text;
ALTER TABLE patients      ADD COLUMN IF NOT EXISTS pharmacy_id text;
