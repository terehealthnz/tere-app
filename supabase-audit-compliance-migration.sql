-- Audit + compliance migration
-- Adds:
--   1. audit_logs table (was planned but never created — endpoints degraded to no-op)
--   2. providers.is_billing_admin flag (billing role, no clinical PHI access)
--
-- HIPC Rule 5 (security) + Privacy Act 2020 IPP5 (reasonable safeguards):
-- Admins viewing PHI must trigger an audit_logs write with a reason.

BEGIN;

-- 1. audit_logs table -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT NOT NULL,           -- 'view_consult_summary' | 'view_consult_notes' | 'view_transcript' | 'view_prescription' etc.
  provider_id       UUID NULL REFERENCES public.providers(id) ON DELETE SET NULL,
  provider_name     TEXT NULL,
  provider_role     TEXT NULL,               -- snapshot: 'admin' | 'billing_admin' | 'provider' | 'supervisor'
  consultation_id   UUID NULL REFERENCES public.consultations(id) ON DELETE SET NULL,
  patient_ref       TEXT NULL,               -- NHI or synthetic ref
  resource_type     TEXT NULL,               -- 'consultation' | 'prescription' | 'patient' | 'transcript'
  resource_id       UUID NULL,
  reason            TEXT NULL,               -- 'billing_dispute' | 'complaint_investigation' | 'quality_audit' | 'support_ticket_response' | 'patient_request' | 'other'
  reason_notes      TEXT NULL,               -- free-form justification when reason='other' or extra context
  metadata          JSONB NULL,
  ip                TEXT NULL,
  user_agent        TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_provider  ON public.audit_logs(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_consult   ON public.audit_logs(consultation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event     ON public.audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_reason    ON public.audit_logs(reason) WHERE reason IS NOT NULL;

-- RLS: readable by admins + supervisors only; inserts via service_role only.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
  FOR SELECT USING (false);   -- denied via RLS; server-mediated reads go through service_role in /api/audit

-- 2. providers.is_billing_admin -----------------------------------
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS is_billing_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.providers.is_billing_admin IS
  'Billing-only admin role. When TRUE the account can see billing/payment fields but MUST NOT be shown clinical PHI (notes, transcripts, chief_complaint, vitals, prescriptions). Combined with is_admin=true.';

COMMIT;

-- Verify:
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE (table_name='audit_logs' AND column_name IN ('reason','provider_role'))
--      OR (table_name='providers'  AND column_name='is_billing_admin')
--   ORDER BY table_name, column_name;
