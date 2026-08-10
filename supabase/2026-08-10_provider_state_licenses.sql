-- Provider state-license self-service + admin approval workflow.
-- Complements 2026-08-10_us_consult_fields.sql (which added
-- providers.licensed_states text[] as the runtime lookup).
--
-- Model:
--   Provider POSTs a new row here with status='pending_review'.
--   Admin PATCHes status → 'active' (and the endpoint updates
--   providers.licensed_states array). Deletion also possible.
--
-- No RLS policies added — endpoint uses service_role.
-- License doc upload (Supabase Storage) is a follow-up.

CREATE TABLE IF NOT EXISTS provider_state_licenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  state_code        text NOT NULL,        -- 2-letter USPS
  license_number    text NOT NULL,
  expires_at        date NOT NULL,        -- required — expiration drives auto-revoke
  license_doc_url   text,                 -- Supabase Storage path (licenses/ bucket)
  status            text NOT NULL DEFAULT 'pending_review',
                    -- pending_review | active | rejected | expired | revoked
  reviewed_by       uuid REFERENCES providers(id),
  reviewed_at       timestamptz,
  review_notes      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, state_code)        -- one row per state per provider
);

CREATE INDEX IF NOT EXISTS idx_provider_state_licenses_status
  ON provider_state_licenses (status)
  WHERE status = 'pending_review';

CREATE INDEX IF NOT EXISTS idx_provider_state_licenses_provider
  ON provider_state_licenses (provider_id);
