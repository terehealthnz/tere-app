-- Backfill providers.cpn from providers.hpi_number where cpn is NULL.
--
-- Context: providers table carried two person-level HPI columns historically:
--   - hpi_number  (older, colloquial "HPI number" field)
--   - cpn         (added when the HPI FHIR integration shipped — HNZ's canonical
--                  Common Person Number is the authoritative name)
--
-- Both columns stored the same identifier shape (6-char alphanumeric, e.g.
-- 24NSES / 25JYBH). MyProfile + Admin edit UIs exposed BOTH fields side-by-
-- side, which confused Rachel at onboarding (2026-10-15 WhatsApp screenshot).
-- UI now collapses to a single HPI-CPN field; this migration ensures no data
-- is lost for providers who only filled the older hpi_number field.
--
-- One-way merge: cpn wins if already set. Does not touch hpi_number so any
-- API consumer still reading it (ACC cert generator, HL7 inbound router,
-- ACC audit PDF — all now updated to prefer cpn, keep hpi_number as fallback)
-- continues to work until the column can be dropped in a future cleanup.
--
-- Idempotent: safe to re-run (NULL guard means already-backfilled rows skip).

UPDATE providers
   SET cpn = TRIM(UPPER(hpi_number))
 WHERE cpn IS NULL
   AND hpi_number IS NOT NULL
   AND TRIM(hpi_number) <> '';

-- Report what moved (visible in Supabase SQL editor output).
SELECT COUNT(*) AS providers_backfilled
  FROM providers
 WHERE cpn IS NOT NULL
   AND cpn = TRIM(UPPER(COALESCE(hpi_number, '')));
