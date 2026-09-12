-- Add employment status field to consultations for ACC weekly compensation
-- assessment + return-to-work planning.
--
-- Why: ACC needs to know the patient's employment context before certifying
-- weekly comp (loss of earnings) or issuing a fit-for-work certificate.
-- Different documentation applies to employed vs self-employed vs student /
-- unemployed. Currently only captured implicitly via `is_work_injury`, which
-- doesn't distinguish "employed but injured off-shift" from "unemployed".
--
-- Constrained to a small set of values so downstream reports (ACC audit
-- bundle, RTW plans) can branch reliably.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS acc_employment_status text
    CHECK (acc_employment_status IS NULL OR acc_employment_status IN (
      'employed',
      'self_employed',
      'not_employed',
      'student',
      'retired'
    ));

-- No index — read only as part of the per-consult ACC bundle (keyed on PK).
