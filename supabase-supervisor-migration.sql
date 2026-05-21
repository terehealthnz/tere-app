-- ═══════════════════════════════════════════════════════════════════
-- TERE HEALTH — Supervisor approval workflow migration
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Provider permission columns ──────────────────────────────────

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS can_prescribe  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_refer      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_acc        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_supervisor  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS supervisor_id  uuid REFERENCES providers(id);

-- ── 2. Update existing providers ────────────────────────────────────

UPDATE providers SET is_supervisor = true,  can_prescribe = true,  can_refer = true,  can_acc = true
  WHERE first_name = 'Patrick' AND last_name = 'Herling';

UPDATE providers SET is_supervisor = false, can_prescribe = true,  can_refer = true,  can_acc = true
  WHERE first_name = 'Rachel' AND last_name = 'Thomas';

-- Justin is admin-only (is_provider=false), no clinical permissions needed

-- ── 3. Add Alex Reid (paramedic, non-prescribing) ───────────────────

INSERT INTO providers (first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, is_supervisor, can_prescribe, can_refer, can_acc, pin)
SELECT 'Alex', 'Reid', 'Paramedic', 'Paramedicine', '#6366F1', true, false, true, false, false, false, true, 'alex2026'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE first_name = 'Alex' AND last_name = 'Reid');

-- ── 4. Prescriptions — approval audit columns ────────────────────────

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS approval_status  text DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS drafted_by_id    uuid REFERENCES providers(id),
  ADD COLUMN IF NOT EXISTS drafted_by_name  text,
  ADD COLUMN IF NOT EXISTS approved_by      uuid REFERENCES providers(id),
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by      uuid REFERENCES providers(id),
  ADD COLUMN IF NOT EXISTS rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS modification_log jsonb;

-- ── 5. Radiology referrals — approval audit columns ──────────────────

ALTER TABLE radiology_referrals
  ADD COLUMN IF NOT EXISTS approval_status  text DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS drafted_by_id    uuid REFERENCES providers(id),
  ADD COLUMN IF NOT EXISTS drafted_by_name  text,
  ADD COLUMN IF NOT EXISTS approved_by      uuid REFERENCES providers(id),
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by      uuid REFERENCES providers(id),
  ADD COLUMN IF NOT EXISTS rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS modification_log jsonb;

-- ── 6. Consultations — ACC approval columns ──────────────────────────

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS acc_approval_status text DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS acc_draft           jsonb,
  ADD COLUMN IF NOT EXISTS acc_approved_by     uuid REFERENCES providers(id),
  ADD COLUMN IF NOT EXISTS acc_approved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS acc_rejected_at     timestamptz,
  ADD COLUMN IF NOT EXISTS acc_rejection_reason text;

-- ── 7. Approval index for fast supervisor queries ────────────────────

CREATE INDEX IF NOT EXISTS prescriptions_approval_idx    ON prescriptions (approval_status, created_at);
CREATE INDEX IF NOT EXISTS referrals_approval_idx        ON radiology_referrals (approval_status, created_at);
CREATE INDEX IF NOT EXISTS consultations_acc_approval_idx ON consultations (acc_approval_status);
