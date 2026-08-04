-- Reconcile audit_logs schema with what the application actually writes.
--
-- Background: features-migration.sql created audit_logs with a minimal
-- schema (event_type, provider_id, provider_name, consultation_id,
-- patient_ref, metadata, ip, created_at). The application has since
-- extended writers to include provider_role, resource_type, resource_id,
-- reason, reason_notes, and user_agent (see api/_audit-log.js). Production
-- has these columns from ad-hoc console additions; this migration ensures
-- every environment (staging, new dev clones) has the same shape.
--
-- Idempotent: all ADDs use IF NOT EXISTS. Safe to re-run.
--
-- This migration does NOT change existing rows.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS provider_role  text,
  ADD COLUMN IF NOT EXISTS resource_type  text,
  ADD COLUMN IF NOT EXISTS resource_id    text,
  ADD COLUMN IF NOT EXISTS reason         text,
  ADD COLUMN IF NOT EXISTS reason_notes   text,
  ADD COLUMN IF NOT EXISTS user_agent     text;

COMMENT ON COLUMN audit_logs.provider_role IS
  'Snapshot of the actor role at time of write: admin | billing_admin | supervisor | provider. Snapshotted (not FK) so role changes do not rewrite history.';
COMMENT ON COLUMN audit_logs.resource_type IS
  'e.g. consultation | patient | prescription | radiology_report — what kind of thing this event touched.';
COMMENT ON COLUMN audit_logs.resource_id IS
  'ID of the touched resource. Not FK because targets may be deleted; audit outlives the target.';
COMMENT ON COLUMN audit_logs.reason IS
  'One of the ALLOWED_REASONS in api/_audit-log.js: billing_dispute | complaint_investigation | quality_audit | support_ticket_response | patient_request | clinical_care | other.';
COMMENT ON COLUMN audit_logs.reason_notes IS
  'Free-text elaboration on the reason, captured at the PhiRevealGate prompt.';
COMMENT ON COLUMN audit_logs.user_agent IS
  'Client User-Agent header at time of write. Best-effort — may be null for server-initiated events.';

-- Guard against destructive edits to history. Audit is append-only.
-- Supabase RLS already gates writes to service_role, but this trigger
-- catches accidental UPDATE or DELETE issued via the service role too.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- Reason: HDC / HIPC inspectors expect audit trail integrity. UPDATE and
-- DELETE at the SQL layer are now impossible without dropping the trigger
-- first — which itself would appear in Postgres pg_stat_user_tables /
-- Supabase logs as a schema-modifying operation.
