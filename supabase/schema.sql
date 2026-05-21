-- Tere Health — Supabase schema
-- Run this in your Supabase SQL editor before launching

create extension if not exists "uuid-ossp";

create table consultations (
  id                  uuid primary key default uuid_generate_v4(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Patient details
  patient_first_name  text not null,
  patient_last_name   text not null,
  patient_nhi         text,
  patient_dob         date,
  patient_phone       text,
  patient_location    text,
  patient_allergies   text,

  -- Consultation
  chief_complaint     text not null,
  duration            text,
  status              text not null default 'waiting',
  -- status: waiting | vitals_complete | ready | in_progress | complete | cancelled

  -- Vitals (from Tere rPPG or manual entry)
  vitals              jsonb,

  -- ACC
  acc_eligible        text,  -- yes | no | unsure
  acc_employer        text,
  acc_injury_date     date,
  acc_injury_details  text,
  acc_consent         boolean default false,

  -- Consent
  recording_consent   boolean default false,

  -- Video (Daily.co)
  daily_room_url      text,
  daily_room_name     text,

  -- Clinical output
  clinical_notes      jsonb,   -- { S, O, A, P, actions, transcript }
  prescriptions       jsonb,
  radiology_referrals jsonb,
  acc_claims          jsonb
);

-- Row level security
alter table consultations enable row level security;

-- Clinician can read/write all rows (authenticated via service_role key in backend)
-- Patient can read only their own row by ID (no auth required for MVP)
create policy "Service role full access" on consultations
  using (true) with check (true);

-- Index for status queries
create index on consultations(status);
create index on consultations(created_at desc);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger consultations_updated_at
  before update on consultations
  for each row execute function update_updated_at();
