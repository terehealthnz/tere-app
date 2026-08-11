-- Medical-Objects Capricorn Cloud inbound HL7 v2 receive integration.
-- Case #1058382 — HL7 v2.1 + v2.4, ORU (results) + REF (referrals) primarily.
--
-- Storage model:
--   inbound_hl7_messages     — one row per POST from Capricorn
--   inbound_hl7_attachments  — PDFs extracted from OBX segments (Storage path)
--
-- All service_role — no RLS policies. Providers reach it via
-- /api/provider-inbox which filters by matched_provider_id.

CREATE TABLE IF NOT EXISTS inbound_hl7_messages (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Message metadata (from MSH)
  msh_10_control_id         text NOT NULL,          -- MSH-10 (ACK correlates via MSA-2)
  msh_9_message_type        text NOT NULL,          -- e.g. ORU^R01, REF^I12
  msh_9_event               text,                   -- 'R01', 'I12' etc.
  msh_12_version            text,                   -- '2.1' | '2.4'
  msh_4_sending_facility    text,                   -- MSH-4 (sending facility HD variants)
  msh_5_receiving_app       text,                   -- MSH-5
  msh_6_receiving_facility  text,                   -- MSH-6 — used for provider match
  msh_7_datetime            timestamptz,            -- MSH-7 message datetime

  -- Patient identity (PID)
  patient_pid_3             text,                   -- PID-3 primary identifier (NHI in NZ)
  patient_first_name        text,
  patient_last_name         text,
  patient_middle_name       text,
  patient_dob               date,
  patient_sex               text,

  -- Order / referral top-level (OBR)
  obr_3_1_filler_order      text,                   -- OBR-3.1 — traceability
  obr_4_service_id          text,                   -- OBR-4 (test/service code + name)

  -- Matching results
  matched_provider_id       uuid REFERENCES providers(id) ON DELETE SET NULL,
  matched_patient_id        uuid REFERENCES patients(id) ON DELETE SET NULL,
  match_confidence          text,                   -- 'strong' | 'weak' | 'none'

  -- Payload (retain original; parsed_summary is what the UI renders)
  raw_message               text NOT NULL,
  parsed_summary            jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_pdf                   boolean NOT NULL DEFAULT false,

  -- Update handling — a later message with the same OBR-3.1 replaces the older.
  supersedes_id             uuid REFERENCES inbound_hl7_messages(id) ON DELETE SET NULL,
  superseded_by_id          uuid REFERENCES inbound_hl7_messages(id) ON DELETE SET NULL,

  -- Ack we returned to Capricorn
  ack_msa_1                 text,                   -- 'CA'|'CR'|'CE'|'AA'|'AR'|'AE'
  ack_msa_3_error           text,                   -- error text if any (returned in ack)
  ack_returned_at           timestamptz,

  -- Application status (workflow)
  status                    text NOT NULL DEFAULT 'received',
                              -- received | processed | needs_review | rejected | error
  read_by_provider_at       timestamptz,
  archived_at               timestamptz,

  received_at               timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_hl7_provider
  ON inbound_hl7_messages (matched_provider_id, received_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_hl7_patient
  ON inbound_hl7_messages (matched_patient_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_hl7_obr3
  ON inbound_hl7_messages (obr_3_1_filler_order);

CREATE INDEX IF NOT EXISTS idx_inbound_hl7_status
  ON inbound_hl7_messages (status, received_at DESC);

CREATE TABLE IF NOT EXISTS inbound_hl7_attachments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id                uuid NOT NULL REFERENCES inbound_hl7_messages(id) ON DELETE CASCADE,
  obx_index                 int NOT NULL,           -- OBX-1
  content_type              text NOT NULL DEFAULT 'application/pdf',
  storage_path              text NOT NULL,          -- 'hl7-attachments' bucket path
  filename                  text,
  size_bytes                int,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_hl7_attachments_message
  ON inbound_hl7_attachments (message_id);

-- Provider inbox unread badge query.
-- Feed a specific provider_id to get their unread count fast.
COMMENT ON TABLE inbound_hl7_messages IS
  'Inbound HL7 v2 messages from Medical-Objects Capricorn Cloud. See api/_hl7-inbound.js.';
