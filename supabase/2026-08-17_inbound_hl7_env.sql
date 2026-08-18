-- Add env column to inbound_hl7_messages to track which mTLS proxy
-- (nz-prod / nz-test / au-prod / au-test / …) the message came through.
-- Set by the Fly proxy via X-Tere-Env header (see hl7-mtls-proxy/index.js)
-- and stamped on every row in api/_hl7-inbound.js.
--
-- Naming pattern is '<country>-<prod|test>' so AU/US expansion drops in
-- without another migration — the column is just a text tag.
--
-- Motivation: Medical-Objects (case #1058382, Tony Cruice 2026-08-17)
-- requires distinct test and production endpoints so a test message can
-- never accidentally land in a real patient record. This column is the
-- server-side proof of provenance — the future auto-file-to-patient-chart
-- logic must filter to env LIKE '%-prod' before touching real data.
--
-- Backfill: existing rows predate the separation and were all received
-- via the (now-relabeled) NZ prod endpoint. Safe to default to 'nz-prod'.

ALTER TABLE inbound_hl7_messages
  ADD COLUMN IF NOT EXISTS env text NOT NULL DEFAULT 'nz-prod';

-- Filter index for the admin inbox — we'll usually want to show only
-- env LIKE '%-prod' rows once real traffic starts flowing.
CREATE INDEX IF NOT EXISTS inbound_hl7_messages_env_idx
  ON inbound_hl7_messages (env, received_at DESC);

COMMENT ON COLUMN inbound_hl7_messages.env IS
  '<country>-<prod|test> — set from X-Tere-Env forwarded by the mTLS proxy '
  '(e.g. nz-prod, nz-test, au-prod). Downstream auto-filing to patient '
  'charts MUST filter to env LIKE ''%-prod''.';
