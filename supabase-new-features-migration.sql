-- New features migration: GP letter, medical cert, patient ratings
-- Run in Supabase SQL Editor

alter table consultations
  add column if not exists gp_name text,
  add column if not exists gp_email text,
  add column if not exists gp_clinic text,
  add column if not exists gp_letter_sent_at timestamptz,
  add column if not exists medical_certificate_issued boolean default false,
  add column if not exists medical_certificate_url text,
  add column if not exists rating integer,
  add column if not exists rating_comment text,
  add column if not exists rated_at timestamptz;

-- Allow anon to read limited fields for rating page (provider name, date)
-- and submit rating update
grant select (id, patient_first_name, provider_display_name, created_at, rating, rated_at) on consultations to anon;
grant update (rating, rating_comment, rated_at) on consultations to anon;

notify pgrst, 'reload schema';
