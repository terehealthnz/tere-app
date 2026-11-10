-- Payroll — admin override for the notes-signed gate (1bad7f9).
--
-- The gate excludes any status='complete' consult that has neither
-- notes_finalised_at nor encounter_completed_at from the payable total,
-- protecting against sloppy sign-off. Rare legit cases still need to pay
-- out though — pre-migration consults with no sign-off stamp, providers
-- who leave the platform mid-fortnight, admin verifying the work another
-- way. This override lets admin include a specific unsigned consult in
-- payable WITH a reason + actor + timestamp recorded for IRD audit.
--
-- The override is per-consultation (not per-payroll-period) so it survives
-- Recalculate + follows the row forward. Once set, buildSummaries counts
-- the consult as payable even without notes stamps. Override shows amber
-- in the Review modal and the BCTI PDF carries an asterisk footnote so
-- an auditor can trace back to the admin override record.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS payroll_override_reason text,
  ADD COLUMN IF NOT EXISTS payroll_override_by     uuid REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payroll_override_at     timestamptz;

COMMENT ON COLUMN consultations.payroll_override_reason IS
  'Why admin force-included this consult in payable despite no notes sign-off. Appears as an asterisk footnote on the BCTI PDF.';
COMMENT ON COLUMN consultations.payroll_override_by IS
  'Admin provider ID who authorised the override (from auth.provider.id at override time).';
