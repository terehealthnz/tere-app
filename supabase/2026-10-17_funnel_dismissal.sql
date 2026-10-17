-- Funnel dismissal — lets an admin acknowledge a severity-flagged abandoned
-- consult after they've acted on it (called the patient, confirmed they went
-- to ED, decided no further action etc.) so it stops showing in the
-- Operations funnel's abandoned-list.
--
-- Two columns on consultations:
--   funnel_dismissed_at   when the dismiss happened
--   funnel_dismissed_by   which provider clicked dismiss (FK to providers.id,
--                         SET NULL on provider delete so we keep the dismissal
--                         timestamp even if the provider row is removed)
--
-- No reason text — keep it one-click. If audit evidence is ever needed, the
-- audit_log capture of the dismiss action carries the full provider identity
-- and timestamp; this table only needs the "has been dismissed" boolean +
-- when, so the funnel panel can filter cheaply.

alter table consultations
  add column if not exists funnel_dismissed_at timestamptz,
  add column if not exists funnel_dismissed_by uuid references providers(id) on delete set null;

-- Index for the funnel endpoint's filter (status in abandoned-set + not
-- dismissed). Partial-index on the dismissed=null case keeps it small.
create index if not exists idx_consultations_funnel_undismissed
  on consultations (created_at desc)
  where funnel_dismissed_at is null;
