-- Outbound lab ordering + inbound-result review flags.
--
-- Tere orders pathology by emailing a signed PDF requisition to the patient;
-- patient presents at any Awanui (or Pathlab, or hospital) collection centre.
-- Results come back as HL7 ORU via Medical-Objects and auto-file to the
-- patient chart via inbound_hl7_messages (existing infra). This table tracks
-- outbound orders so providers can see what's been requested but not yet
-- resulted (gap between send + collection + report).

CREATE TABLE IF NOT EXISTS lab_orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- who / what consult
  patient_id           uuid REFERENCES patients(id) ON DELETE SET NULL,
  consultation_id      uuid REFERENCES consultations(id) ON DELETE SET NULL,
  provider_id          uuid REFERENCES providers(id) ON DELETE SET NULL,
  provider_name        text,
  provider_cpn         text,
  provider_mcnz        text,

  -- patient snapshot at time-of-order (survives patient edits)
  patient_name         text NOT NULL,
  patient_nhi          text,
  patient_dob          date,
  patient_email        text,
  patient_phone        text,
  patient_address      text,

  -- what we're ordering
  tests                text[] NOT NULL,
  tests_freetext       text,
  clinical_info        text NOT NULL,

  -- billing path
  billing_type         text NOT NULL CHECK (billing_type IN ('public','acc','private')),
  acc_claim_number     text,
  urgency              text CHECK (urgency IS NULL OR urgency IN ('routine','urgent')),

  -- delivery + lifecycle
  status               text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft','sent','resulted','cancelled')),
  pdf_url              text,
  sent_at              timestamptz,
  delivery_status      text CHECK (delivery_status IS NULL OR delivery_status IN ('pending','sent','error')),
  delivery_error       text,

  -- Manual link from a provider when they recognise a received ORU as the
  -- result for a pending order. Awanui doesn't echo our order ID (we send
  -- PDFs not ORMs) so there is no automatic join.
  linked_hl7_message_id uuid,

  is_practice          boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_patient     ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_consult     ON lab_orders(consultation_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_provider    ON lab_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status      ON lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_nhi ON lab_orders(patient_nhi) WHERE patient_nhi IS NOT NULL;

-- Manual-review flags on inbound HL7 messages. Separate from `status`
-- (which tracks parse/match state) because review is a clinical action, not
-- a parse outcome; a successfully-parsed-and-auto-filed result is still
-- "unreviewed" until a clinician has eyeballed it.
ALTER TABLE inbound_hl7_messages
  ADD COLUMN IF NOT EXISTS reviewed_by_provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at             timestamptz;
