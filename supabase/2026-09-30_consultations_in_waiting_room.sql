-- Gates a consult's appearance in the provider queue on whether the patient
-- has actually reached the /waiting/:id page. Without this, consults were
-- surfacing in the queue immediately after status flipped to 'waiting' — for
-- public patients that's post-payment but BEFORE vitals, and for employer
-- (roster-verified) patients it's immediately at create-time. Providers were
-- being paged with no card on file / no vitals / patient not actually looking
-- at the site.
--
-- WaitingRoom.jsx PATCHes this to true on mount. Queue query in
-- api/_consultations.js (filter=active|queue) requires it. Once true, the
-- consult behaves exactly as before.

alter table public.consultations
  add column if not exists in_waiting_room boolean not null default false;

-- Backfill: any consult that's past the pre-waiting-room phase (in queue,
-- being seen, or already closed out) is considered to have been in the
-- waiting room. Without this backfill, in-flight consults at deploy time
-- would silently vanish from the queue.
update public.consultations
  set in_waiting_room = true
  where status in (
    'waiting', 'vitals_requested', 'vitals_complete', 'ready',
    'in_progress', 'notes_pending', 'notes_finalised',
    'completed', 'no_show', 'abandoned', 'expired', 'cancelled'
  );

-- Small index to keep the queue filter fast at scale (queue query is
-- .eq('is_practice', false) + .eq('in_waiting_room', true) + status IN (...)).
create index if not exists consultations_queue_visible_idx
  on public.consultations (in_waiting_room, is_practice, status)
  where in_waiting_room = true;
