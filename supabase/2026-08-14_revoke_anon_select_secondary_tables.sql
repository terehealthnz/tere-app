-- 2026-08-14 — Tighten anon SELECT posture on secondary clinical tables.
--
-- Live-fire audit (docs/security-review-2026-08-14.md §5) found that 12
-- secondary tables have GRANT SELECT TO anon with RLS policies filtering
-- results to empty. That posture is safe today but relies on RLS being
-- correctly written. If a future policy change accidentally opened the
-- filter, the GRANT would allow rows to leak.
--
-- Primary PHI tables (patients, consultations, providers, audit_logs,
-- prescriptions, patient_flags, incidents, complaints, consents,
-- team_messages, appointments) already have anon SELECT revoked and
-- return 42501 permission denied on direct hits — the safer pattern.
--
-- This migration extends that pattern to the 12 remaining tables. Server
-- reads via service_role are unaffected (service_role bypasses grants +
-- RLS). Anon-facing endpoints must go through our /api/* proxies, which
-- already do — this migration doesn't change any application behaviour.
--
-- INSERT/UPDATE/DELETE by anon on all these tables was already blocked by
-- RLS (verified in the audit) — no additional revocations needed for
-- those operations, only SELECT.

REVOKE SELECT ON public.radiology_referrals   FROM anon;
REVOKE SELECT ON public.acc_claims            FROM anon;
REVOKE SELECT ON public.radiology_reports     FROM anon;
REVOKE SELECT ON public.patient_documents     FROM anon;
REVOKE SELECT ON public.patient_allergens     FROM anon;
REVOKE SELECT ON public.patient_medications   FROM anon;
REVOKE SELECT ON public.patient_conditions    FROM anon;
REVOKE SELECT ON public.spo2_calibrations     FROM anon;
REVOKE SELECT ON public.validation_readings   FROM anon;
REVOKE SELECT ON public.validation_subjects   FROM anon;
REVOKE SELECT ON public.bookings              FROM anon;
REVOKE SELECT ON public.inbound_hl7_messages  FROM anon;

-- Post-check: after running, an anon SELECT on any of these tables should
-- return {"code":"42501", "message":"permission denied for table ..."}
-- instead of the empty [] response it returned before this migration.
