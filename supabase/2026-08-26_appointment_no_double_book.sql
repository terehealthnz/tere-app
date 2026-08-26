-- Pen-test P2 deferred #318: eliminate the appointment double-book race.
--
-- api/_appointments.js action=book currently does:
--   1. SELECT count WHERE slot_start=X AND provider_id=Y AND status<>'cancelled'
--   2. If count===0, INSERT the appointment
-- Two concurrent bookings for the same slot both read count=0 and both insert.
--
-- Fix: partial unique index on (provider_id, slot_start) WHERE status is not
-- 'cancelled'. Concurrent inserts race at the DB level; whoever loses gets
-- a unique_violation (23505) which the endpoint catches and surfaces as
-- 409 "Slot already booked", same UX as the pre-check.

CREATE UNIQUE INDEX IF NOT EXISTS appointments_no_double_book_idx
  ON appointments (provider_id, slot_start)
  WHERE status <> 'cancelled';

COMMENT ON INDEX appointments_no_double_book_idx IS
  'Prevents two concurrent bookings from claiming the same (provider, slot).
   Read-then-insert check in _appointments.js is racy — the DB-level partial
   unique index is the authoritative guard. Filter WHERE status <> cancelled
   so a re-book of a previously cancelled slot is allowed.';

-- Same race also exists on the bookings table (patient-facing /booking flow
-- at api/_bookings.js action=create around line 229-247). Same fix pattern
-- with the appropriate columns.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_no_double_book_idx
  ON bookings (provider_id, appointment_date, appointment_time)
  WHERE status <> 'cancelled';

COMMENT ON INDEX bookings_no_double_book_idx IS
  'Prevents two concurrent patients from claiming the same booking slot.
   _bookings.js has the same read-then-insert pattern as _appointments.js
   — DB-level partial unique index is the authoritative guard.';
