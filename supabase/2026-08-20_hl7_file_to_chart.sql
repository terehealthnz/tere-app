-- File-to-chart for inbound HL7 messages.
--
-- Model: the message stays as source of truth in inbound_hl7_messages.
-- We add filing metadata so the same row can be queried from the patient
-- chart as one of that patient's reports. No separate copy — avoids
-- drift between "raw HL7" and "chart entry".
--
-- Auto-file policy (implemented in api/_hl7-inbound.js): when
-- match_confidence = 'strong' (PID-3 NHI matched an existing patients
-- row) the parser sets filed_to_patient_id + filed_at automatically at
-- receive time. filed_by_provider_id stays NULL to signal system-filed.
--
-- Manual file (weaker matches, or provider deliberately re-assigning
-- to a different patient) uses api/_hl7-file which sets filed_by to
-- the acting provider.
--
-- Audit trail: every filed_at write is logged to audit_log with
-- entity=inbound_hl7_messages + reason.

ALTER TABLE inbound_hl7_messages
  ADD COLUMN IF NOT EXISTS filed_to_patient_id   uuid REFERENCES patients(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS filed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS filed_by_provider_id  uuid REFERENCES providers(id) ON DELETE SET NULL;

-- Patient-chart lookup: "give me every HL7 report filed to this patient
-- newest-first". Partial index so we don't index unfiled rows (typically
-- the majority while inbox backlog exists).
CREATE INDEX IF NOT EXISTS inbound_hl7_messages_filed_patient_idx
  ON inbound_hl7_messages (filed_to_patient_id, received_at DESC)
  WHERE filed_to_patient_id IS NOT NULL;

COMMENT ON COLUMN inbound_hl7_messages.filed_to_patient_id IS
  'When set, this HL7 message is considered part of this patient''s chart. Auto-set on receive when PID-3 NHI matches an existing patient (match_confidence=strong). Providers can also manually file/unfile via /api/hl7-file.';
COMMENT ON COLUMN inbound_hl7_messages.filed_by_provider_id IS
  'NULL = system auto-filed on strong NHI match. UUID = provider who manually filed this message from the inbox.';
