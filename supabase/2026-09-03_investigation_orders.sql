-- Investigation orders — results follow-up loop (task #418).
-- THE load-bearing telehealth safety control: every HDC + coronial finding
-- I know of turns on a result that went unfound or unactioned. This tracks
-- ordered → received → reviewed → actioned as a first-class state machine
-- with SLA + escalation on unactioned abnormal results.
--
-- Paired nightly cron flags:
--   • orders past expected_by_days with no result → notify ordering provider
--   • results received but not reviewed within 48h → notify + escalate
--   • reviewed abnormal but not actioned within 24h → admin alert
--
-- Auto-populated from radiology_referrals INSERTs; HL7 receive marks
-- received when the report matches. Manual add path for lab tests + other
-- investigations that don't route via RHCNZ / Medical-Objects.

-- 2026-09-03 · investigation_orders

CREATE TABLE IF NOT EXISTS investigation_orders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage to the consult + patient the order was made for.
  consultation_id             uuid REFERENCES consultations(id) ON DELETE SET NULL,
  patient_id                  uuid REFERENCES patients(id)      ON DELETE SET NULL,
  patient_nhi                 text,
  patient_name                text,

  -- Who ordered it + when.
  ordered_by_provider_id      uuid REFERENCES providers(id) ON DELETE SET NULL,
  ordered_by_provider_name    text,
  ordered_at                  timestamptz NOT NULL DEFAULT now(),

  -- What was ordered.
  order_type                  text NOT NULL CHECK (order_type IN ('radiology','lab','referral','other')),
  order_description           text NOT NULL,
  order_source_table          text,  -- e.g. 'radiology_referrals'
  order_source_id             uuid,  -- FK id in that table (loose)

  -- SLA — expected turnaround. Defaults set per-type in the endpoint.
  expected_by_days            int NOT NULL DEFAULT 7,

  -- State machine.
  status                      text NOT NULL DEFAULT 'ordered' CHECK (status IN (
                                'ordered','received','reviewed','actioned','cancelled'
                              )),

  -- Received (result came back).
  received_at                 timestamptz,
  received_source_table       text,   -- e.g. 'radiology_reports', 'hl7_messages'
  received_source_id          uuid,
  received_summary            text,
  is_abnormal                 boolean,

  -- Reviewed by a named clinician.
  reviewed_at                 timestamptz,
  reviewed_by_provider_id     uuid REFERENCES providers(id) ON DELETE SET NULL,
  reviewed_by_provider_name   text,

  -- Actioned (patient contacted, prescription changed, referred on, etc.).
  actioned_at                 timestamptz,
  actioned_by_provider_id     uuid REFERENCES providers(id) ON DELETE SET NULL,
  action_notes                text,

  -- Escalation trail (auto-set by cron when SLA breached, or manual).
  escalated_at                timestamptz,
  escalation_reason           text,
  escalated_to_admin          boolean NOT NULL DEFAULT false,

  -- Cancelled (patient declined, ordered in error, superseded).
  cancelled_at                timestamptz,
  cancelled_reason            text,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the worklist + cron queries. The cron scans by
-- (status, expected due date) and by (status='received', received_at) so
-- we want indexes matching those.
CREATE INDEX IF NOT EXISTS investigation_orders_status_expected_idx
  ON investigation_orders (status, ordered_at)
  WHERE status = 'ordered';
CREATE INDEX IF NOT EXISTS investigation_orders_status_received_idx
  ON investigation_orders (status, received_at)
  WHERE status = 'received';
CREATE INDEX IF NOT EXISTS investigation_orders_abnormal_unactioned_idx
  ON investigation_orders (status, reviewed_at)
  WHERE status = 'reviewed' AND is_abnormal = true;
CREATE INDEX IF NOT EXISTS investigation_orders_patient_idx
  ON investigation_orders (patient_id);
CREATE INDEX IF NOT EXISTS investigation_orders_provider_idx
  ON investigation_orders (ordered_by_provider_id);
CREATE INDEX IF NOT EXISTS investigation_orders_source_idx
  ON investigation_orders (order_source_table, order_source_id);

-- RLS: PHI table — anon revoked, service-role only. All access via /api.
ALTER TABLE investigation_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON investigation_orders FROM anon;
REVOKE ALL    ON investigation_orders FROM authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON investigation_orders TO service_role;

CREATE POLICY investigation_orders_service_role_all ON investigation_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- updated_at auto-touch on any row change.
CREATE OR REPLACE FUNCTION investigation_orders_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS investigation_orders_touch_updated_at_trg ON investigation_orders;
CREATE TRIGGER investigation_orders_touch_updated_at_trg
  BEFORE UPDATE ON investigation_orders
  FOR EACH ROW EXECUTE FUNCTION investigation_orders_touch_updated_at();

-- Auto-create investigation_orders row when a radiology referral is
-- inserted. Keeps the loop closed without provider action — every ordered
-- test is guaranteed to appear in the worklist.
CREATE OR REPLACE FUNCTION investigation_orders_from_radiology_referral()
RETURNS trigger AS $$
BEGIN
  -- Guard: only auto-create for actually-approved referrals (drafts don't
  -- count as ordered until approved).
  IF NEW.approval_status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  -- Skip if we already have an order row for this referral.
  IF EXISTS (
    SELECT 1 FROM investigation_orders
    WHERE order_source_table = 'radiology_referrals' AND order_source_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO investigation_orders (
    consultation_id, patient_nhi, patient_name,
    ordered_by_provider_id, ordered_by_provider_name, ordered_at,
    order_type, order_description, order_source_table, order_source_id,
    expected_by_days
  ) VALUES (
    NEW.consultation_id,
    NEW.patient_nhi,
    trim(concat_ws(' ', NEW.patient_first_name, NEW.patient_last_name)),
    NEW.provider_id, NEW.provider_name, COALESCE(NEW.approved_at, NEW.created_at),
    'radiology',
    concat_ws(' — ', NEW.investigation, NEW.urgency),
    'radiology_referrals', NEW.id,
    -- Urgency-based SLA: urgent 3d, routine 14d.
    CASE WHEN lower(coalesce(NEW.urgency,'')) LIKE '%urgent%' THEN 3
         WHEN lower(coalesce(NEW.urgency,'')) LIKE '%soon%'   THEN 7
         ELSE 14 END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS radiology_referrals_investigation_orders_trg ON radiology_referrals;
CREATE TRIGGER radiology_referrals_investigation_orders_trg
  AFTER INSERT OR UPDATE OF approval_status ON radiology_referrals
  FOR EACH ROW EXECUTE FUNCTION investigation_orders_from_radiology_referral();

COMMENT ON TABLE investigation_orders IS
  'Task #418 — every ordered investigation tracked from ordered → received
   → reviewed → actioned. Cron flags SLA breaches. THE load-bearing
   telehealth safety control per HDC/coronial findings.';
