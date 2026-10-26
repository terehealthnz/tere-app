-- in_waiting_room_at = when the patient's browser actually landed on the
-- /waiting room page. Separate from status='waiting' (which fires at
-- payment auth, while the patient is still on vitals). Used as the
-- "waiting since" anchor on the provider queue card, so a patient who
-- paid 2 hours ago but only just finished vitals doesn't look like
-- they've been waiting 2 hours.
--
-- Also the trigger for the on-call provider SMS: now fires once, when
-- the patient actually enters the waiting room, instead of fanning out
-- across 4 call sites at various payment-stage transitions.
--
-- Backfill: for currently-in-queue rows, set in_waiting_room_at = NOW()
-- rather than created_at. The old "deadline from created_at" display
-- was already wrong for them; the fresh stamp is a reasonable zero.

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS in_waiting_room_at timestamptz;

UPDATE consultations SET in_waiting_room_at = NOW() WHERE in_waiting_room = true AND in_waiting_room_at IS NULL AND status IN ('waiting','vitals_requested','vitals_complete','ready');
