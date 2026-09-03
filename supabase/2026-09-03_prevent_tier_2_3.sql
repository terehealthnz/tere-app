-- Tier 2 + Tier 3 preventative controls (tasks #379–#384).
--
-- 1. Break-glass grants — temporary role elevations with justification.
-- 2. Provider PHI-training attestation cols.
-- 3. Access-review cadence tracking (last-completed timestamp).
-- 4. pgcrypto extension + encrypted ACC PHI columns (dual-write during transition).

-- ── Break-glass grants ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS break_glass_grants (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_provider_id  uuid NOT NULL,   -- provider being elevated
  granted_by          uuid NOT NULL,   -- admin who authorised
  granted_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  role_added          text NOT NULL,   -- e.g. 'is_admin' | 'is_billing_admin' | 'is_supervisor'
  justification       text NOT NULL,
  revoked_at          timestamptz,
  revoked_by          uuid,
  metadata            jsonb
);
CREATE INDEX IF NOT EXISTS break_glass_grants_target ON break_glass_grants(target_provider_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS break_glass_grants_active ON break_glass_grants(expires_at) WHERE revoked_at IS NULL;

ALTER TABLE break_glass_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON break_glass_grants;
CREATE POLICY "service_role_all" ON break_glass_grants FOR ALL USING (true);

COMMENT ON TABLE break_glass_grants IS
  'Emergency role elevations — bypasses normal role boundaries with mandatory justification. All other admins get notified when a grant fires. Auto-revoke via cron once expires_at passes.';

-- ── Provider PHI training attestation ──────────────────────────────────────
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS last_phi_training_at      timestamptz,
  ADD COLUMN IF NOT EXISTS phi_training_valid_until  timestamptz,
  ADD COLUMN IF NOT EXISTS last_access_review_at     timestamptz;

COMMENT ON COLUMN providers.last_phi_training_at IS
  'When this provider last completed the annual PHI/privacy training attestation. Warned at 12mo, blocked from PHI access at 13mo per Ethics Policy v1.';
COMMENT ON COLUMN providers.phi_training_valid_until IS
  'last_phi_training_at + 12 months, computed by the training-completion endpoint. Convenience column for enforcement checks.';
COMMENT ON COLUMN providers.last_access_review_at IS
  'When admin last completed a quarterly access review of this provider. Fed by the quarterly cron email link.';

-- ── pgcrypto for highest-sensitivity ACC fields ────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS acc_injury_details_enc  bytea,
  ADD COLUMN IF NOT EXISTS rehab_plan_enc          bytea,
  ADD COLUMN IF NOT EXISTS discharge_summary_enc   bytea;

COMMENT ON COLUMN consultations.acc_injury_details_enc IS
  'pgp_sym_encrypt of acc_injury_details. Dual-write during transition (task #381). Readers prefer enc + fall back to plain. Plain column will be nulled once all rows are migrated.';
COMMENT ON COLUMN consultations.rehab_plan_enc IS
  'pgp_sym_encrypt of rehab_plan (jsonb → text). Same dual-write pattern.';
COMMENT ON COLUMN consultations.discharge_summary_enc IS
  'pgp_sym_encrypt of discharge_summary (jsonb → text). Same dual-write pattern.';

-- The encryption key lives in Vercel env as ACC_PHI_ENCRYPTION_KEY. NOT stored
-- in the DB. Rotating requires re-encrypting all rows — separate operation.

-- Convenience RPCs so the app layer doesn't have to inline pgp_sym_encrypt
-- in every write path. The passphrase is passed in from the Node side each
-- call (from Vercel env), so the DB never has the key.
CREATE OR REPLACE FUNCTION encrypt_phi_text(p_plaintext text, p_passphrase text)
RETURNS bytea LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_plaintext IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(p_plaintext, p_passphrase);
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_phi_text(p_cipher bytea, p_passphrase text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_cipher IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_cipher, p_passphrase);
EXCEPTION WHEN OTHERS THEN
  -- Wrong key / corrupt data → return NULL so callers can fall back.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION encrypt_phi_text(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION decrypt_phi_text(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION encrypt_phi_text(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_phi_text(bytea, text) TO service_role;
