-- Support ticket routing migration
-- Adds:
--   1. provider_notifications: to_provider_id (targeted vs broadcast) + context fields for actionable tickets
--   2. patient_support_requests: routing_status + routed_notification_id + routed_consultation_id
-- Related feature: patient contact form → routes to provider Messages tab, queue, or admin Support.

BEGIN;

-- 1. provider_notifications: targeted delivery + actionable context
ALTER TABLE public.provider_notifications
  ADD COLUMN IF NOT EXISTS to_provider_id   UUID NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS context_type     TEXT NULL,     -- 'support_ticket' | 'consult' | null(broadcast)
  ADD COLUMN IF NOT EXISTS context_id       UUID NULL,     -- ticket id or consult id
  ADD COLUMN IF NOT EXISTS action_url       TEXT NULL,     -- deep link e.g. /provider/consult/<id>?ticket=<id>
  ADD COLUMN IF NOT EXISTS resolved_at      TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS resolved_by      UUID NULL REFERENCES public.providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_note  TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_notifications_to_provider
  ON public.provider_notifications(to_provider_id)
  WHERE to_provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_notifications_context
  ON public.provider_notifications(context_type, context_id)
  WHERE context_type IS NOT NULL;

-- 2. patient_support_requests: track where each ticket routed to
ALTER TABLE public.patient_support_requests
  ADD COLUMN IF NOT EXISTS routing_status         TEXT NULL,  -- 'provider_messages' | 'new_consult' | 'admin_inbox'
  ADD COLUMN IF NOT EXISTS routed_notification_id UUID NULL,  -- fk to provider_notifications when routed there
  ADD COLUMN IF NOT EXISTS routed_consultation_id UUID NULL REFERENCES public.consultations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handled_by_provider_id UUID NULL REFERENCES public.providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handled_at             TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS handling_action        TEXT NULL;  -- 'handle_now' | 'convert_to_consult' | 'bounce_to_admin'

CREATE INDEX IF NOT EXISTS idx_patient_support_routing
  ON public.patient_support_requests(routing_status);

-- 3. prescriptions: track pharmacy redirections (change-pharmacy button)
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS redirected_at              TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS redirected_from_pharmacy   JSONB NULL,        -- {name, id, fax, phone, email} snapshot
  ADD COLUMN IF NOT EXISTS redirected_by_provider_id  UUID NULL REFERENCES public.providers(id) ON DELETE SET NULL;

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('provider_notifications','patient_support_requests','prescriptions')
--     AND column_name IN ('to_provider_id','context_type','routing_status','redirected_at')
--   ORDER BY table_name, column_name;
