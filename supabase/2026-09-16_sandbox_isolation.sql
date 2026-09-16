-- Sandbox isolation: real-patient safety constraints must not apply to
-- is_practice=true rows.
--
-- Background: the unique index consultations_one_open_per_patient_idx
-- (2026-07-24) prevents a real patient from having two open consults at
-- once. That's a load-bearing safety invariant for PHI — but it's been
-- silently sabotaging the sandbox seed. If a provider leaves a fake
-- patient's consult in draft/waitlisted/no_show state from a previous
-- training session, the next seed tries to INSERT a fresh consult and
-- trips the unique. And the sandbox reset path can't clean up because
-- an audit trigger on consultations DELETE tries to update audit_logs,
-- which is append-only.
--
-- Fix: rescope the index to real patients only. Sandbox rows can
-- collide as much as they like — they're not clinically meaningful.
-- The seed can then do a deterministic idempotent upsert without any
-- lookup gymnastics, and reset can safely re-run.
--
-- Safety: this does NOT relax the invariant for real patients. Any row
-- with is_practice = false still enforces one-open-per-patient.
DROP INDEX IF EXISTS consultations_one_open_per_patient_idx;
CREATE UNIQUE INDEX IF NOT EXISTS consultations_one_open_per_patient_idx
  ON consultations (patient_id)
  WHERE status NOT IN ('complete', 'cancelled')
    AND is_practice = false;

COMMENT ON INDEX consultations_one_open_per_patient_idx IS
  '2026-07-24 + 2026-09-16 update — one open consult per real patient
   (is_practice=false only). Sandbox rows are exempt so training seeds
   can upsert cleanly without hitting this invariant.';
