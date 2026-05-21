-- Notes management + consultation timing columns
-- Run this in the Supabase dashboard: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS started_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS consultation_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS notes_flagged                boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes_finalised              boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes_finalised_at           timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_days               integer,
  ADD COLUMN IF NOT EXISTS outcome                      text,
  ADD COLUMN IF NOT EXISTS notes_draft                  jsonb;
