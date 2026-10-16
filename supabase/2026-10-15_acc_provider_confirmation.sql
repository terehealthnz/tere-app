-- Provider ACC confirmation gate on consult close.
--
-- Context: patient's "yes" to the triage ACC question
-- (AITriage.jsx:260) was treated as the final ACC determination for
-- billing. Providers had no clear forcing-function to confirm/override
-- during the consult, so an infection like otitis externa could get
-- billed at the ACC co-pay rate ($25) without the provider ever actively
-- deciding (Patrick 2026-10-15, Melanie's consult).
--
-- Fix: on Complete Encounter, if the consult is still flagged ACC from
-- triage, the provider gets a mandatory Yes/No popup. These columns
-- record the provider's answer so (a) the decision is auditable and (b)
-- future consult-closes know not to re-prompt.
--
-- Nullable, zero-default — existing rows don't need backfilling.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS acc_provider_confirmed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS acc_provider_confirmed_by   uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acc_provider_declined_at    timestamptz,
  ADD COLUMN IF NOT EXISTS acc_provider_declined_by    uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acc_provider_decline_reason text;

COMMENT ON COLUMN consultations.acc_provider_confirmed_at
  IS 'Provider affirmed at consult close that this is a genuine ACC claim (popup gate). NULL = never prompted or declined.';
COMMENT ON COLUMN consultations.acc_provider_declined_at
  IS 'Provider rejected the patient-triage ACC flag at consult close. is_acc and acc_eligible get flipped to false at the same time.';
COMMENT ON COLUMN consultations.acc_provider_decline_reason
  IS 'Free-text reason captured when provider declined ACC (e.g. "otitis externa — infection, not injury"). Shown in admin reclassifications view.';

-- Report pending prompts admin should know about.
SELECT COUNT(*) AS consults_pending_provider_acc_confirmation
  FROM consultations
 WHERE (is_acc = true OR acc_eligible = 'yes')
   AND acc_provider_confirmed_at IS NULL
   AND acc_provider_declined_at IS NULL
   AND completed_at IS NOT NULL;
