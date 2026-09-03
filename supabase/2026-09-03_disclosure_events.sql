-- Per-disclosure consent snapshot table (task #351).
--
-- audit_logs records who READ data internally. disclosure_events records
-- when we SENT data outward (to a GP, another provider via HL7, HPI query,
-- etc.) with a snapshot of the patient's consent state at the moment of
-- disclosure. NZ Privacy Act 2020 IPP11 + HIPC Rule 11 + HDC Right 7(6)
-- expect us to demonstrate consent for each disclosure event, not just the
-- initial triage tick.
--
-- Fed by a helper (recordDisclosure) invoked from each outbound endpoint.

CREATE TABLE IF NOT EXISTS disclosure_events (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_nhi           text,
  patient_id            uuid,
  consultation_id       uuid,
  channel               text NOT NULL CHECK (channel IN (
    'gp_letter_email', 'hl7_outbound', 'hpi_query', 'acc_invoice',
    'radiology_referral', 'insurance_receipt', 'section_22f_export', 'other'
  )),
  destination           text NOT NULL,       -- email addr, HL7 org id, HPI-O, etc.
  destination_label     text,                -- human-readable destination
  disclosed_by          uuid,                -- providers.id
  disclosed_by_name     text,
  disclosed_at          timestamptz DEFAULT now(),
  consent_source        text CHECK (consent_source IN (
    'triage_tick', 'verbal_documented', 'written_signed',
    'implied_care_continuity', 'legal_obligation', 'patient_request', 'not_recorded'
  )),
  consent_source_ref    text,                -- e.g. consultations.id where triage consent was captured
  disclosure_purpose    text,                -- 'referral', 'billing', 'continuity_of_care', 'compliance', etc.
  payload_summary       text,                -- e.g. 'GP letter — chief complaint + SOAP + plan'
  metadata              jsonb,
  ip                    text
);
CREATE INDEX IF NOT EXISTS disclosure_events_patient_nhi ON disclosure_events(patient_nhi);
CREATE INDEX IF NOT EXISTS disclosure_events_patient_id  ON disclosure_events(patient_id);
CREATE INDEX IF NOT EXISTS disclosure_events_consult     ON disclosure_events(consultation_id);
CREATE INDEX IF NOT EXISTS disclosure_events_when        ON disclosure_events(disclosed_at DESC);
CREATE INDEX IF NOT EXISTS disclosure_events_channel     ON disclosure_events(channel);

ALTER TABLE disclosure_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON disclosure_events;
CREATE POLICY "service_role_all" ON disclosure_events FOR ALL USING (true);

-- Append-only: disclosures are a legal record. Same append-only pattern
-- as audit_logs.
CREATE OR REPLACE FUNCTION prevent_disclosure_events_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'disclosure_events is append-only — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS disclosure_events_no_update ON disclosure_events;
CREATE TRIGGER disclosure_events_no_update
  BEFORE UPDATE ON disclosure_events
  FOR EACH ROW EXECUTE FUNCTION prevent_disclosure_events_mutation();
DROP TRIGGER IF EXISTS disclosure_events_no_delete ON disclosure_events;
CREATE TRIGGER disclosure_events_no_delete
  BEFORE DELETE ON disclosure_events
  FOR EACH ROW EXECUTE FUNCTION prevent_disclosure_events_mutation();

COMMENT ON TABLE disclosure_events IS
  'Append-only record of every outbound disclosure of patient data with a snapshot of consent state at time of disclosure. Fed by recordDisclosure() from each outbound endpoint (GP letter, HL7, HPI, ACC invoice, radiology referral, Section 22F export).';
