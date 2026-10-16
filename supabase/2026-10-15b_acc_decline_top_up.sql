-- Top-up billing tracking for ACC-declined consults.
--
-- When a provider picks "No, not ACC" at the Complete Encounter popup,
-- they can choose what happens to the price differential (patient paid
-- the $25 ACC co-pay, standard private consult is $65 → $40 owing):
--
--   charge  — modal fires /api/acc-confirm with topUpAction=charge, server
--             creates a Windcave session, emails patient a payment link.
--             status moves pending → paid when FPRN lands.
--
--   waive   — provider absorbs the differential (goodwill), status=waived.
--
--   defer   — provider leaves it to admin to decide, status=deferred.
--             Shows up in the admin Reclassifications tab for later action.
--
-- Nullable, zero-default — existing declined consults (migration run before
-- this one) stay NULL until admin re-opens them if they want to action.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS acc_decline_top_up_amount_cents integer,
  ADD COLUMN IF NOT EXISTS acc_decline_top_up_status      text,
  ADD COLUMN IF NOT EXISTS acc_decline_top_up_session_id  text,
  ADD COLUMN IF NOT EXISTS acc_decline_top_up_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS acc_decline_top_up_paid_at     timestamptz;

COMMENT ON COLUMN consultations.acc_decline_top_up_amount_cents
  IS 'Differential to charge patient after ACC-decline. In cents to match payment_amount convention. NULL = no top-up action yet.';
COMMENT ON COLUMN consultations.acc_decline_top_up_status
  IS 'pending | paid | waived | deferred. Set at /api/acc-confirm time; moves pending→paid when Windcave FPRN confirms top-up charge.';
COMMENT ON COLUMN consultations.acc_decline_top_up_session_id
  IS 'Windcave sessionId for the top-up charge (NULL if waived/deferred/not yet charged).';
COMMENT ON COLUMN consultations.acc_decline_top_up_sent_at
  IS 'When the top-up payment-link email was sent to the patient.';
COMMENT ON COLUMN consultations.acc_decline_top_up_paid_at
  IS 'When the top-up charge was confirmed paid via FPRN. NULL while still pending.';

-- Visibility index for the Reclassifications admin tab (unlikely to be large,
-- but keeps the "pending top-ups" query cheap).
CREATE INDEX IF NOT EXISTS idx_consultations_acc_decline_status
  ON consultations (acc_decline_top_up_status, acc_provider_declined_at DESC)
 WHERE acc_provider_declined_at IS NOT NULL;
