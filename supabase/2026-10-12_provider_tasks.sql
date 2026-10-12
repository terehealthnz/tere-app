-- Provider tasks: async admin-to-provider work queue (task #649).
-- Primary use case = follow-up / represcribe requests where the patient has an
-- existing completed consult but no live encounter. Admin creates a task
-- pointing at the parent consult; provider opens it from the inbox, opens
-- the chart in that parent consult's context, writes a fresh Rx against the
-- parent consult, marks the task complete.
--
-- Clinical safety rule enforced here + in /api/provider-tasks:
--   every task MUST reference an existing consultation (parent_consultation_id
--   NOT NULL). No prescribing into a vacuum. For represcribe_request tasks,
--   that parent consult must also have at least one existing prescription
--   (validated server-side, not here).
--
-- Design notes:
-- - Task types are a text column with a CHECK constraint rather than a
--   Postgres ENUM so we can extend without a migration (same pattern as
--   consultations.consultation_type).
-- - No append-only triggers — tasks need to mutate (status, assignment,
--   completion). Audit history lives in audit_logs via writeAuditEvent.
-- - represcribe_task_id on prescriptions is nullable — only set when the Rx
--   was issued as part of a task. Preserves full audit chain:
--     task -> parent consult -> provider assessment -> fresh Rx -> back to task.

-- 1. Core table
CREATE TABLE IF NOT EXISTS provider_tasks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clinical anchor — the prior completed consult this task references.
  -- NOT NULL enforced here; same-patient check enforced server-side.
  patient_id               uuid NOT NULL REFERENCES patients(id),
  parent_consultation_id   uuid NOT NULL REFERENCES consultations(id),

  -- Task shape
  task_type                text NOT NULL CHECK (task_type IN (
    'represcribe_request',
    'review_result',
    'countersign_referral',
    'patient_callback',
    'other'
  )),
  title                    text NOT NULL,
  body                     text,
  priority                 text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),

  -- Status machine
  status                   text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed', 'cancelled'
  )),

  -- Audit — who / when
  created_by               uuid NOT NULL REFERENCES providers(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  -- Nullable = any on-duty provider can pick it up
  assigned_to              uuid REFERENCES providers(id),
  started_by               uuid REFERENCES providers(id),
  started_at               timestamptz,
  completed_by             uuid REFERENCES providers(id),
  completed_at             timestamptz,
  completion_notes         text,
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Practice-mode isolation (sandbox + prod separation — same pattern as
  -- consultations.is_practice via 2026-08-21 extend-is-practice migration)
  is_practice              boolean NOT NULL DEFAULT false
);

-- 2. Indices for inbox query patterns
CREATE INDEX IF NOT EXISTS provider_tasks_assigned_status_idx
  ON provider_tasks (assigned_to, status)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX IF NOT EXISTS provider_tasks_unassigned_pending_idx
  ON provider_tasks (status, created_at DESC)
  WHERE assigned_to IS NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS provider_tasks_patient_idx
  ON provider_tasks (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS provider_tasks_parent_consult_idx
  ON provider_tasks (parent_consultation_id);

-- 3. updated_at trigger (same pattern as other mutable tables)
CREATE OR REPLACE FUNCTION provider_tasks_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_tasks_touch_updated_at ON provider_tasks;
CREATE TRIGGER provider_tasks_touch_updated_at
  BEFORE UPDATE ON provider_tasks
  FOR EACH ROW EXECUTE FUNCTION provider_tasks_touch_updated_at();

-- 4. RLS — writes always go through /api/provider-tasks (service-role key),
-- but enable RLS and deny anon so the table is correctly locked down.
ALTER TABLE provider_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON provider_tasks FROM anon, authenticated;
GRANT ALL ON provider_tasks TO service_role;

-- 5. Prescriptions back-reference — Rx issued inside a task gets stamped so
-- the audit trail links back. Nullable: non-task Rxs leave it null.
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS represcribe_task_id uuid REFERENCES provider_tasks(id);

CREATE INDEX IF NOT EXISTS prescriptions_represcribe_task_idx
  ON prescriptions (represcribe_task_id)
  WHERE represcribe_task_id IS NOT NULL;

-- 6. Comment the table so future-us + anyone browsing the schema knows what
-- this is for without having to hunt down the migration.
COMMENT ON TABLE provider_tasks IS
  'Admin-to-provider async work queue. Each task references a prior completed consultation (parent_consultation_id) — enforces that follow-up prescribing / sign-off work is clinically anchored to a real prior encounter, not created in a vacuum. Primary use: represcribe_request for standalone follow-up Rx without a new consult. Audit history lives in audit_logs.';
