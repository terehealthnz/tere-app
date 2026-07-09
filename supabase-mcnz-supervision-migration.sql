-- supabase-mcnz-supervision-migration.sql
--
-- MCNZ RMO supervision architecture. Adds the fields Tere needs to comply
-- with the Medical Council of NZ requirements for RMOs (resident medical
-- officers / house officers / registrars) working under supervision:
--
--   • Named senior supervisor recorded on the RMO's provider row
--   • Documented scope of practice (jsonb) — what the RMO may take solo,
--     what requires countersign, what must be escalated before decision
--   • Notes countersign trail — every RMO consultation is reviewed by the
--     supervisor within an SLA and the review is stamped in the DB
--   • Regular case-review meetings, logged with what was discussed
--
-- Contactability is NOT enforced by the DB — MCNZ's standard is that the
-- supervisor is reachable by phone (like an ER attending on-call), not
-- that they are logged in at the same time. That contract sits in the
-- supervision plan document, not in a schema constraint.
--
-- See docs/supervision-plan.md for the MCNZ-facing narrative. This migration
-- is the DB backbone that lets the app enforce the plan.
--
-- Run once against Supabase.

-- ── providers: supervision metadata per doctor ───────────────────────────
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS provider_type text NOT NULL DEFAULT 'senior'
    CHECK (provider_type IN ('senior', 'rmo')),
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervision_start_date date,
  -- JSON structure kept intentionally loose so the supervision plan can list
  -- exactly which complaint categories the RMO may take solo, e.g.
  --   { "solo_ok": ["urti","otitis","gastroenteritis"],
  --     "countersign_required": ["prescriptions_controlled","acc_claim","referral"],
  --     "escalate_immediately": ["chest_pain","stroke_symptoms","psych_crisis"] }
  ADD COLUMN IF NOT EXISTS supervision_scope jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_providers_supervisor_id
  ON providers (supervisor_id) WHERE supervisor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_providers_type
  ON providers (provider_type) WHERE provider_type = 'rmo';

-- ── consultations: countersign trail on RMO consultations ────────────────
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS requires_countersign boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS countersigned_by uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS countersigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS countersign_notes text;

-- Queue index — supervisor dashboard filters consultations where the RMO
-- has finalised notes but the supervisor hasn't countersigned yet.
CREATE INDEX IF NOT EXISTS idx_consultations_pending_countersign
  ON consultations (updated_at DESC)
  WHERE requires_countersign = true AND countersigned_at IS NULL;

-- ── supervision_reviews: weekly meeting log ──────────────────────────────
-- Kept intentionally minimal. Each row is one meeting between an RMO and
-- their supervisor. cases_reviewed is a jsonb array of { consultation_id,
-- notes, action } so a single meeting can cover many consults without a
-- join table. concerns_raised captures anything the supervisor wants on
-- the audit trail (near-miss, prescribing pattern, escalation delay).
CREATE TABLE IF NOT EXISTS supervision_reviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rmo_id            uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  supervisor_id     uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  meeting_date      date NOT NULL DEFAULT CURRENT_DATE,
  meeting_duration_min int,
  cases_reviewed    jsonb NOT NULL DEFAULT '[]'::jsonb,
  concerns_raised   text,
  actions_agreed    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES providers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_supervision_reviews_rmo
  ON supervision_reviews (rmo_id, meeting_date DESC);

-- No anon access — everything here is provider-only.
ALTER TABLE supervision_reviews ENABLE ROW LEVEL SECURITY;
-- Deliberately no permissive policy: the server-mediated /api/supervision
-- endpoints use service_role and enforce their own guards.
