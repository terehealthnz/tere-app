-- Patient-picked preferred imaging clinic (RHCNZ region id).
--
-- Captured during triage on the ACC branch so the patient tells us upfront
-- where they'd like their imaging done, instead of the provider guessing
-- from the address. Region-level granularity (matches RHCNZ_REGIONS ids
-- like 'mmi', 'pr-cbg', 'arg') — within a region there's usually only
-- one clinic, and where there's more (Auckland, Christchurch) the provider
-- can still pick a specific site in the imaging modal.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS preferred_imaging_region_id text;

COMMENT ON COLUMN consultations.preferred_imaging_region_id IS
  'Patient-picked RHCNZ region id (e.g. mmi, pr-cbg). Set during triage
   on the ACC branch. Provider modal prefills this instead of running
   autoSelectRegion when present.';
