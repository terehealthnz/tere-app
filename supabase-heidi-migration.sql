-- Heidi-style notes system migration
-- Run in Supabase dashboard: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql/new

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS notes_final      text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS acc_read_code    text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS work_capacity    text DEFAULT 'fit';
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS return_to_work_date date;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS billing_code     text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS transcript       text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS note_generated_at timestamptz;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS note_finalised_by text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS gp_letter_sent_at timestamptz;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS gp_email         text;
