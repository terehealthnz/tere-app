-- bp_v2_models — stores promoted v2 ridge models so the live /vitals surface
-- can load the active one on page mount, same pattern as model_versions for
-- v15. v15's schema is TF.js-specific (model_topology / weight_specs /
-- weight_data_base64); the ridge model is tiny (W 13×2, means 12, stds 12,
-- plus meta — fits in ~2 KB JSON) so a single jsonb column is the right
-- shape. One row is marked is_active = true at any time; load picks that.
--
-- No PHI in this table — model weights are statistical summaries, not
-- individual-identifiable data.

create table if not exists bp_v2_models (
  id              uuid primary key default gen_random_uuid(),
  trained_at      timestamptz not null default now(),
  n_training      int,
  n_val           int,
  val_mae_sys     numeric,
  val_mae_dia     numeric,
  lambda          numeric,
  feature_names   text[],
  model_json      jsonb not null,
  is_active       boolean not null default false,
  promoted_by     uuid,
  notes           text
);

create index if not exists bp_v2_models_active_idx
  on bp_v2_models (is_active)
  where is_active = true;

create index if not exists bp_v2_models_trained_at_idx
  on bp_v2_models (trained_at desc);

alter table bp_v2_models enable row level security;

-- Only service_role touches this table. All read/write happens via
-- /api/bp-v2-model so no anon policy is needed; keeping RLS on with no
-- policies means anon has no access by default.
