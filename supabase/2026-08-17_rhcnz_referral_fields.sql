-- RHCNZ referral fields.
--
-- Extends radiology_referrals with the fields Jesse Thorpe's eReferral
-- template asks for (docs/regulatory/rhcnz/README.md, 2026-08-17). All
-- nullable so existing referrals (free-text facility path) keep working.
--
-- Existing patient_phone is treated as MOBILE going forward. New
-- patient_phone_home column captures a separate landline if the patient
-- supplies one on the referral form.

ALTER TABLE radiology_referrals
  ADD COLUMN IF NOT EXISTS rhcnz_region_id           text,
  ADD COLUMN IF NOT EXISTS csc_number                text,
  ADD COLUMN IF NOT EXISTS patient_phone_home        text,
  ADD COLUMN IF NOT EXISTS patient_phone_mobile      text,
  ADD COLUMN IF NOT EXISTS other_funding_pathway     text,
  ADD COLUMN IF NOT EXISTS date_of_injury            date,
  ADD COLUMN IF NOT EXISTS copy_to_doctor            text,
  ADD COLUMN IF NOT EXISTS referrer_mo_shortcode     text,
  ADD COLUMN IF NOT EXISTS patient_preferred_name    text,
  ADD COLUMN IF NOT EXISTS patient_address           text;

COMMENT ON COLUMN radiology_referrals.rhcnz_region_id IS
  'One of the eight RHCNZ region ids in src/lib/rhcnzRegions.js. Non-null → server routed the referral to the matching intake email and defaulted urgency=Urgent.';

COMMENT ON COLUMN radiology_referrals.referrer_mo_shortcode IS
  'Practice Dispatch value on RHCNZ template. Currently HPI-O G11238-E; awaiting confirmation from Tony Cruice at MO Helpdesk (case #1058382) that this is the right value.';
