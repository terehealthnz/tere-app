-- Payroll v3 — per-provider per-consult rate.
--
-- Context: since the task-#252 refactor api/_payroll.js has ignored
-- providers.base_rate and paid a global $20/consult (video/phone) or
-- $10/consult (message, sunset). base_rate on existing rows is stale
-- (holdover from the older hourly + holiday model).
--
-- Fix:
--   1. Default bumped from 15.00 → 20.00 so newly-created providers get
--      the current rate automatically.
--   2. Every existing row reset to 20.00 to match what they've actually
--      been paid. Admin can bump individual providers up from the new
--      AdminPayroll rate-edit UI. Nobody's pay changes as of the deploy;
--      only the source of truth shifts from a global const to per-row.

ALTER TABLE providers ALTER COLUMN base_rate SET DEFAULT 20.00;
UPDATE providers SET base_rate = 20.00;

COMMENT ON COLUMN providers.base_rate IS
  'Per-consult contractor rate in NZD. Read by api/_payroll.js. Admin-editable via /api/providers PATCH (base_rate is in the admin allowlist).';
