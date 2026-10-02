-- bp_v3_models — mirror of bp_v2_models for the gradient-boost pipeline.
-- Separate table (not a column on v2) so each lineage promotes independently
-- and old v2 model_json shape stays untouched. GET is anon (live /vitals on
-- unauthed patient devices); POST is admin-only via /api/bp-v3-model.
--
-- Trees serialize to compact JSON; 50 depth-3 trees × 2 (sys/dia) ≈ ~15 KB.

create table if not exists bp_v3_models (
  id              uuid primary key default gen_random_uuid(),
  trained_at      timestamptz not null default now(),
  n_training      int,
  n_val           int,
  val_mae_sys     numeric,
  val_mae_dia     numeric,
  n_trees         int,
  depth           int,
  lr              numeric,
  feature_names   text[],
  model_json      jsonb not null,
  is_active       boolean not null default false,
  promoted_by     uuid,
  notes           text
);

create index if not exists bp_v3_models_active_idx
  on bp_v3_models (is_active)
  where is_active = true;

create index if not exists bp_v3_models_trained_at_idx
  on bp_v3_models (trained_at desc);

alter table bp_v3_models enable row level security;
-- Server-mediated only via /api/bp-v3-model (service_role). No anon policies.
