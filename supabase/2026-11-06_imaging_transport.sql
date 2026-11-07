-- Imaging referral transport metadata. Tracks whether a referral went via
-- ERMS (provider manually uploads to Pegasus portal) or RHCNZ (auto-emailed
-- to the regional private intake). Enables reporting + downstream tooling.

ALTER TABLE radiology_referrals
  ADD COLUMN IF NOT EXISTS transport       text
    CHECK (transport IS NULL OR transport IN ('erms','rhcnz')),
  ADD COLUMN IF NOT EXISTS erms_region_id  text,
  ADD COLUMN IF NOT EXISTS erms_path       text
    CHECK (erms_path IS NULL OR erms_path IN ('dhb','acc','private'));

CREATE INDEX IF NOT EXISTS idx_radiology_referrals_transport
  ON radiology_referrals(transport) WHERE transport IS NOT NULL;
