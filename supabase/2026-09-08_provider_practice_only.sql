-- Server-forced sandbox flag per provider.
--
-- When practice_only=true, resolveDataMode returns practice=true regardless
-- of admin status, x-practice-mode header, or patient_access_from gate.
-- The provider CANNOT see real patients — every query filters
-- is_practice=true.
--
-- Use cases:
--   - Demo accounts (Justin's "Tere Demo" login) — safe for prospect demos
--   - New hires still onboarding — belt-and-braces on top of the
--     patient_access_from date gate
--   - Contractors who should never see live PHI
--
-- Admins can toggle this flag on any provider row from Admin → Team.
-- Default false so existing providers keep their current access.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS practice_only BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN providers.practice_only IS
  'Server-forced sandbox lock. When true, resolveDataMode overrides all other logic and returns practice=true. Set from Admin → Team. See api/_provider-access-gate.js.';
