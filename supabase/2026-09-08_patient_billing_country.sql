-- Auto-detect patient fee tier from Stripe card billing address.
-- Instead of asking the provider to make a business decision they shouldn't
-- (was: 🇳🇿 NZ resident $60 vs 🌍 International $100), we now cache the
-- country from Stripe's payment_method.billing_details.address.country and
-- derive the tier on the server.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS patient_billing_country text;
