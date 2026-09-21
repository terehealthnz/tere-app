-- Single admin-controlled flag that triggers the countersign flow for
-- prescriptions + radiology referrals. Default off — most providers work
-- unsupervised. When set, drafts route to the provider's assigned
-- supervisor_id (see _generate-prescription-pdf.js /
-- _generate-referral-pdf.js notifyAssignedSupervisor helper, wired
-- 2026-09-20 in commit 55e8884).
--
-- Replaces the previous implicit trigger (can_prescribe=false /
-- can_refer=false) which was too easy to set by mistake at onboarding
-- and lacked a single clear UI toggle. Root cause of the 2026-09-20
-- Rachel-getting-Ian's-drafts bug — Ian's row had can_prescribe=false
-- when it should have been true.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS requires_supervision boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN providers.requires_supervision IS
  'When true, this provider''s prescriptions and radiology referrals require countersign by their supervisor_id before dispatch. Default false — provider signs off directly.';

-- Fix Ian Mallett specifically (2026-09-20 incident): flip his can_prescribe
-- + can_refer back to true and confirm requires_supervision=false so
-- Rachel stops receiving his draft-approval emails.
UPDATE providers
SET can_prescribe = true,
    can_refer = true,
    requires_supervision = false
WHERE lower(first_name) = 'ian'
  AND lower(last_name)  = 'mallett';
