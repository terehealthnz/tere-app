-- Silent-failure safety net (task: patient-side stuck detection).
-- consultations.stuck_alerted_at is stamped by /api/patient-stuck-alert
-- the first time a patient's waiting-room detects the consult in a dead
-- status (expired/cancelled/no_show/abandoned) or stuck-draft state.
-- Nullable — pre-migration rows return null, alert fires once, then
-- the column dedups any further alerts on the same consult.
--
-- Only ever written by the server (service_role). No RLS grant needed.
alter table public.consultations
  add column if not exists stuck_alerted_at timestamptz;

comment on column public.consultations.stuck_alerted_at is
  'When the patient waiting-room first detected this consult in a dead/stuck state and fired /api/patient-stuck-alert. Dedup key — server skips re-alerting if this is set. Null for healthy consults.';
