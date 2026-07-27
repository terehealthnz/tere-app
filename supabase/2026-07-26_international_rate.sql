-- International (visitor) pricing tier for non-NZ residents.
--
-- Non-residents (tourists, cruise passengers, business travellers physically
-- in NZ) aren't in the PHO capitation pipeline, don't get CSC subsidies, and
-- need itemised receipts for their travel-insurance claims. NZ$100 video/phone.
--
-- MCNZ rule: patient must be physically in NZ at time of consult. This flag
-- is a pricing tier, not a jurisdictional bypass — the consent flow still
-- requires the patient to confirm they're currently located in NZ.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS is_international boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_consultations_international
  ON consultations(is_international) WHERE is_international = true;
