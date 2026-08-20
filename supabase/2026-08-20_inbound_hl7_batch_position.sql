-- Add batch_position to inbound_hl7_messages so batched ORU messages
-- (multiple patients under one MSH) fan out into one row per patient.
--
-- NZ HealthLink practice: to keep transmission costs down, labs bundle
-- multiple patient reports under a single MSH segment. Our parser was
-- previously only extracting the first PID/OBR — subsequent patients
-- silently dropped. Confirmed by Tony Cruice (Medical-Objects) via case
-- #1058382 on 2026-08-20 after we mis-diagnosed the loss as a Fly.io
-- proxy issue.
--
-- Post-migration: each PID/OBR pair in a batch gets its own row, keyed
-- by (msh_10_control_id, batch_position). batch_position starts at 0 for
-- the first report in a message so pre-migration rows keep their
-- semantics unchanged.

ALTER TABLE inbound_hl7_messages
  ADD COLUMN IF NOT EXISTS batch_position INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN inbound_hl7_messages.batch_position IS
  'Zero-indexed position of this report within a batched HL7 message. 0 = only or first report. For non-batched messages this is always 0. Composite with msh_10_control_id + env + msh_4_sending_facility to detect retries.';

-- Idempotency: same (control ID, position, env, sender) posted twice
-- (retry) must not create a dupe row. Existing rows all have
-- batch_position=0 so index creation is safe.
CREATE UNIQUE INDEX IF NOT EXISTS inbound_hl7_messages_ctlid_pos_env_sender_uniq
  ON inbound_hl7_messages (msh_10_control_id, batch_position, env, msh_4_sending_facility);
