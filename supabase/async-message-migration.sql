-- Async message consultation columns
-- Run once in Supabase SQL editor

alter table consultations
  add column if not exists consultation_subtype     text,
  add column if not exists async_symptom_detail     text,
  add column if not exists async_symptom_progression text,
  add column if not exists async_previous_treatment text,
  add column if not exists async_previous_episodes  text,
  add column if not exists async_daily_impact       text,
  add column if not exists async_photo_urls         text[],
  add column if not exists async_requests           text[],
  add column if not exists async_urgency            text,
  add column if not exists async_deadline           timestamptz,
  add column if not exists async_response           text,
  add column if not exists async_responded_at       timestamptz,
  add column if not exists async_responded_by       uuid;

-- Index for provider queue: fetch async messages waiting for response
create index if not exists idx_consultations_async_queue
  on consultations (consultation_subtype, status, async_deadline)
  where consultation_subtype = 'async_message';

-- Supabase Storage: create the async-photos bucket via Dashboard (Storage > New bucket)
-- Bucket name: async-photos
-- Public: true (so photo URLs are accessible)
-- File size limit: 10MB
-- Allowed MIME types: image/*

-- Payroll events: per-consultation earnings log for providers
create table if not exists payroll_events (
  id                uuid primary key default uuid_generate_v4(),
  provider_id       uuid references providers(id) on delete set null,
  consultation_id   uuid references consultations(id) on delete cascade,
  event_type        text not null,
  amount_cents      integer not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_payroll_events_provider
  on payroll_events (provider_id, created_at desc);

alter table payroll_events enable row level security;
drop policy if exists "Service role full access" on payroll_events;
create policy "Service role full access" on payroll_events for all using (true);

-- Admin notification tracking: prevents duplicate overdue alert emails
alter table consultations
  add column if not exists async_admin_notified_at timestamptz;
