-- Employer-covered consultations (B2B).
--
-- Trigger: Tere is starting B2B partnerships (Cloudy Bay, Sanford, Kono,
-- Thornhill, Top 10 etc.). Employer signs a monthly retainer agreement
-- (invoiced offline, not via Windcave). Their workers reach Tere via a
-- non-guessable URL `/work/[slug]`. Consultations created from that route
-- carry `employer_plan_id` and skip the payment gate — they go straight
-- from triage to the provider queue.
--
-- Isolation-by-design (per 2026-09-19 architecture decision):
--   1. Public patient flow (`/`, `/start`) code path is UNCHANGED.
--   2. Payment gate on the public flow gets ZERO new branches.
--   3. The employer path forks at the front door (`/work/[slug]`) and
--      rejoins the shared flow AFTER the payment step is skipped.
--   4. If employer flow breaks, only employer-flow patients are affected;
--      paying-patient revenue is untouched.
--
-- Billing: offline. Admin generates a monthly report per plan (consult
-- count within calendar month) and invoices the employer via SES email.
-- The `monthly_retainer_nzd` field on this table is a reference amount
-- for internal use — it is NOT enforced by the app.
--
-- Slug design: non-guessable. Slugs are generated server-side as random
-- 12-char lowercase-alphanumeric strings (e.g. `mx8k2n9q3f4z`). The URL
-- IS the credential; there is no separate employee allowlist. This keeps
-- the flow simple for workers (no company code, no login) while making
-- casual guessing infeasible. The optional `usage_cap_month` provides a
-- second line of defence: if a slug leaks, monthly cap bounds the abuse.

CREATE TABLE IF NOT EXISTS employer_plans (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text NOT NULL UNIQUE,
  name                 text NOT NULL,
  contact_name         text,
  contact_email        text,
  monthly_retainer_nzd numeric(10, 2),
  usage_cap_month      integer,
  active               boolean NOT NULL DEFAULT true,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT employer_plans_slug_format
    CHECK (slug ~ '^[a-z0-9]{8,32}$')
);

CREATE INDEX IF NOT EXISTS employer_plans_active_idx
  ON employer_plans (active) WHERE active = true;

-- Link consultations to the employer plan that covered them. Nullable
-- because most consultations are still paying-patient (public flow).
-- ON DELETE SET NULL — audit trail must survive plan deletion.
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS employer_plan_id uuid
    REFERENCES employer_plans(id) ON DELETE SET NULL;

-- Composite index for the two hot queries:
--   1. Monthly usage counter per plan (admin report)
--   2. Enforcing usage_cap_month during consult creation
CREATE INDEX IF NOT EXISTS consultations_employer_plan_created_idx
  ON consultations (employer_plan_id, created_at DESC)
  WHERE employer_plan_id IS NOT NULL;

-- Enable RLS on employer_plans; no policies defined, so only service-role
-- key (used by all our server endpoints) can read/write. Matches the
-- pattern used for other admin-managed tables since the server-mediation
-- refactor (task #63-90).
ALTER TABLE employer_plans ENABLE ROW LEVEL SECURITY;

-- Auto-bump updated_at on any UPDATE.
CREATE OR REPLACE FUNCTION employer_plans_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employer_plans_updated_at ON employer_plans;
CREATE TRIGGER employer_plans_updated_at
  BEFORE UPDATE ON employer_plans
  FOR EACH ROW EXECUTE FUNCTION employer_plans_touch_updated_at();
