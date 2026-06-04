-- Missing columns referenced by ProviderNotes.jsx and NotesCompletion.jsx
-- Run in Supabase dashboard: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql/new

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS is_acc                  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes_finalised_by      uuid,
  ADD COLUMN IF NOT EXISTS notes_completed_seconds integer;
