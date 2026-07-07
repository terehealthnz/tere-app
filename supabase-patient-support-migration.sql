-- Patient support request tickets — patient-facing "Contact us" backend.
--
-- Patients submit a support request (billing, prescription follow-up, technical
-- issue, complaint, etc.) via /contact. Row is inserted anonymously; admin
-- reviews via /clinician/admin. Two Resend emails fire on submit — an internal
-- alert to terehealthnz@gmail.com and a "we've received your message"
-- autoresponder to the patient.
--
-- Safe to re-run.

create table if not exists patient_support_requests (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- What the patient told us
  category          text not null check (category in ('prescription','billing','follow_up','technical','complaint','other')),
  message           text not null,
  patient_name      text,
  patient_email     text not null,
  patient_phone     text,
  consultation_id   uuid,    -- optional link to a specific consult
  source            text default 'contact_page',   -- 'contact_page' | 'post_consult' | 'landing' | etc.

  -- Admin lifecycle
  status            text not null default 'new' check (status in ('new','in_progress','resolved','archived')),
  admin_notes       text,
  handled_by        uuid,    -- provider row id who took ownership
  handled_by_name   text,
  resolved_at       timestamptz,
  resolved_by       uuid
);

comment on table patient_support_requests is
  'Patient-submitted "Contact us" tickets. Anonymous POST allowed at /api/patient-support; admin GET/PATCH manages them.';

-- Indexes for the two hot queries: "show new tickets" and "show tickets for a consult"
create index if not exists idx_patient_support_status_created
  on patient_support_requests (status, created_at desc);
create index if not exists idx_patient_support_consultation
  on patient_support_requests (consultation_id) where consultation_id is not null;

-- Trigger to bump updated_at on any change
create or replace function patient_support_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_patient_support_touch on patient_support_requests;
create trigger trg_patient_support_touch
before update on patient_support_requests
for each row execute function patient_support_touch_updated_at();

-- RLS off — the endpoint uses the service role. No direct client access.
alter table patient_support_requests disable row level security;

-- Sanity
select count(*) as row_count from patient_support_requests;
