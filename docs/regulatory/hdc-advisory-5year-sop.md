# HDC Advisory 5-year auto-publish SOP

**Purpose:** convert closed complaints older than 5 years into a sanitised, patient-de-identified "organisational learning" record that stays useful for training + quality improvement, without indefinitely retaining identifiable complaint details.

Aligns to HDC's expectation that providers *learn* from complaints and to Privacy Act 2020 IPP9 (do not keep information longer than needed).

## Trigger

Any row in `complaints` where:
- `status` = `'closed'` OR `'resolved'`, AND
- `resolved_at` (or `updated_at` if `resolved_at` null) is > 5 years ago.

## Transformation

Manual for now (an admin cron can be added when volume warrants). The admin process, run quarterly:

1. **Query the candidate list:**
   ```sql
   SELECT id, source, complaint_description, severity, status, resolution_type, lessons_learned, resolved_at
     FROM complaints
    WHERE status IN ('closed', 'resolved')
      AND COALESCE(resolved_at, updated_at) < now() - interval '5 years'
   ORDER BY resolved_at ASC
   ```
2. **For each row**, create an anonymised summary in `docs/regulatory/hdc-learning/YYYY-QQ/complaint-N.md` containing:
   - Nature of concern (e.g. "delayed radiology follow-up", "prescription error", "consent dispute")
   - Resolution type
   - Lessons learned + corrective action taken
   - **NO patient identifiers, provider names, dates finer than year, or clinical detail that could re-identify.**
3. **Delete the source complaint row** (or `UPDATE ... SET patient_name = NULL, patient_email = NULL, patient_phone = NULL, complaint_description = REPLACE_WITH_SUMMARY_ID, ...` if we want a soft-delete audit path).
4. **Record the operation** in `retention_purge_runs` (policy_name = `'complaints_5y_learning_summary'`).
5. **Publish internally** — new learning summaries reviewed at the next clinical governance meeting; themes fed into training material.

## Why not automated

Complaint sanitisation requires clinical judgment (e.g. what to summarise, whether the "lesson learned" text itself contains identifying language). Automating without review risks either leaking identifiers or losing valuable detail. Manual quarterly cadence keeps the volume manageable given Tere's current patient base.

**Trigger to automate:** when we're processing >10 complaints/year that hit the 5-year mark.

## Governance

- **Owner:** Rachel Thomas (Medical Director) — clinical review.
- **Executor:** Patrick Herling — technical execution.
- **Cadence:** end of each calendar quarter.
- **Retention of the anonymised summaries:** indefinite — they're organisational learning.
- **Retention of the original complaint rows:** destroyed after summary is filed.

## Change log

- 2026-09-03 — v1.0 initial SOP.
