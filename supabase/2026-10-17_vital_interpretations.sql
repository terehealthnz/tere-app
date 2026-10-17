-- Vital interpretations — one row per consult, keyed by vital name
-- (hr / rr / spo2 / bp). Lets a provider acknowledge an abnormal
-- camera-estimated vital with one of three statuses and a short free-text
-- reason, so the chart carries evidence of clinical interpretation rather
-- than leaving an abnormal number sitting there un-reviewed.
--
-- Shape of the jsonb:
--   {
--     "spo2": {
--       "status": "artefact" | "confirmed" | "noted",
--       "reason": "patient asymptomatic, speaking in full sentences",
--       "interpreted_at": "2026-10-17T03:14:00Z",
--       "interpreted_by": "<provider uuid>"
--     },
--     ...
--   }
--
-- No separate table — this is read/written atomically with the consult row
-- and only ever belongs to one consult. jsonb keeps it schemaless and
-- doesn't require a migration if we add temperature or glucose later.

alter table consultations
  add column if not exists vital_interpretations jsonb;
