-- PHO rural GP coverage — phase 1 MVP.
--
-- Patrick + Kimi Hauora Wairau 2026-11-10 verbal commit: Tere provides
-- scheduled telehealth GP coverage for rural practices under the PHO.
-- Beta practices Renwick Medical Centre + Havelock. Model:
--
--   PHO (Kimi Hauora Wairau) contracts Tere for coverage
--     ↓
--   Rural practices (Renwick, Havelock, …) under the PHO are the
--   bookable units — each has its own patient roster + enrolled GP
--   that Tere's note goes back to
--     ↓
--   Triple O GP self-rosters shifts: "I'll cover Renwick Tue 10-12
--   in 15-min slots." That shift row encodes BOTH availability AND
--   PHO allocation — no separate layer.
--     ↓
--   Patient / PHO coordinator / practice staff book into available
--   slots via /gp/[slug] or a coordinator dashboard. Consult then
--   flows through the normal Tere pipeline (triage → vitals → call
--   → notes → auto GP letter to the enrolled GP).
--
-- Design calls baked in here:
-- * Shifts are provider-self-serve (not admin-managed). GP picks when
--   they want to work, PHO coordinator books into those slots.
-- * Slot length is per-shift (15 / 20 / 30 min), so a provider can
--   run a morning of short follow-ups + an afternoon of new-patient
--   slots on the same day.
-- * UNIQUE (assigned_provider_id, scheduled_for) prevents double-
--   booking at DB level — race-safe without application lock.
-- * Booking horizon enforced in the app layer (4 weeks), not here.
-- * All new tables are server-mediated (RLS OFF-by-default, service
--   role only), matching the pattern of payroll_periods, employers,
--   job_applications, etc. (task #66 + #550).

-- ── PHO contracts ─────────────────────────────────────────────────────────
-- One row per PHO Tere contracts with. One for now (Kimi Hauora Wairau).
-- Expand as other PHOs come on.
CREATE TABLE IF NOT EXISTS pho_contracts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,           -- URL + login path ref
  invoicing_email  TEXT,                            -- where monthly BCTI goes
  per_consult_fee  NUMERIC(10,2),                   -- what Tere invoices PHO per completed scheduled consult
  active           BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT,                            -- MoU reference, rural funding stream, etc.
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN pho_contracts.slug IS
  'URL-safe PHO identifier used in /pho/[slug] routes + PHO coordinator scope key. e.g. "kimi-hauora-wairau".';
COMMENT ON COLUMN pho_contracts.per_consult_fee IS
  'What Tere invoices the PHO per completed scheduled consult. Separate from provider base_rate — Tere margin = PHO fee minus provider rate.';

-- ── Rural practices ───────────────────────────────────────────────────────
-- Practices under a PHO. Each has its own slug (/gp/[slug]) + enrolled-GP
-- email where Tere notes flow back for continuity of care. Per-practice
-- phone + address exist so the booking page can show the right details.
CREATE TABLE IF NOT EXISTS rural_practices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pho_contract_id  UUID NOT NULL REFERENCES pho_contracts(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  gp_email         TEXT,                            -- destination for auto GP letter (task #466)
  phone            TEXT,
  address          TEXT,
  booking_access_code TEXT,                         -- optional — practice staff use to book without login
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rural_practices_pho ON rural_practices(pho_contract_id);

COMMENT ON COLUMN rural_practices.gp_email IS
  'Destination inbox for the auto GP letter after a scheduled consult completes. Reuses task #466 GP-letter loop; address is derived from here when booking_type="scheduled".';
COMMENT ON COLUMN rural_practices.booking_access_code IS
  'Optional shared secret for practice front-desk staff to book an appointment on behalf of a patient without a full login. If NULL, practice must use admin/PHO coordinator route.';

-- ── Provider rural shifts ─────────────────────────────────────────────────
-- A provider self-rosters themselves into a practice for a time window.
-- Each shift encodes a (provider, practice, start/end, slot_minutes) tuple.
-- Available-slot calc = generate_series over the shift minus any already-
-- booked consultations for the same provider at those times.
CREATE TABLE IF NOT EXISTS provider_rural_shifts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id       UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  rural_practice_id UUID NOT NULL REFERENCES rural_practices(id) ON DELETE RESTRICT,
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  slot_minutes      INTEGER NOT NULL CHECK (slot_minutes IN (15, 20, 30)),
  cancelled_at      TIMESTAMPTZ,                    -- soft-cancel; don't delete to preserve audit of previously-bookable windows
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CHECK (EXTRACT(EPOCH FROM (end_at - start_at)) >= slot_minutes * 60)
);

CREATE INDEX IF NOT EXISTS idx_rural_shifts_provider  ON provider_rural_shifts(provider_id, start_at);
CREATE INDEX IF NOT EXISTS idx_rural_shifts_practice  ON provider_rural_shifts(rural_practice_id, start_at)
  WHERE cancelled_at IS NULL;

COMMENT ON COLUMN provider_rural_shifts.cancelled_at IS
  'Soft-cancel — booking endpoint ignores these but audit queries can still see them. Hard-delete only on provider leaving the platform.';

-- ── Consultation extensions ───────────────────────────────────────────────
-- Scheduled consults ride the same consultations table as acute — share
-- vitals, triage, notes, call plumbing, payroll. Four new fields distinguish
-- them: scheduled_for (slot time), rural_practice_id (for GP letter +
-- billing roll-up), assigned_provider_id (pre-set at booking, not at call
-- pickup), booking_type ('acute' default, 'scheduled' for this flow).
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS scheduled_for       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rural_practice_id   UUID REFERENCES rural_practices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_type        TEXT NOT NULL DEFAULT 'acute' CHECK (booking_type IN ('acute', 'scheduled'));

-- Enforce no double-booking a provider at DB level — race-safe, no app lock.
-- Partial unique index ignores cancelled/abandoned rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_consult_provider_slot_unique
  ON consultations(assigned_provider_id, scheduled_for)
  WHERE booking_type = 'scheduled' AND status NOT IN ('cancelled', 'abandoned');

CREATE INDEX IF NOT EXISTS idx_consult_scheduled_for
  ON consultations(scheduled_for)
  WHERE scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consult_rural_practice
  ON consultations(rural_practice_id, scheduled_for)
  WHERE rural_practice_id IS NOT NULL;

COMMENT ON COLUMN consultations.booking_type IS
  'acute (default) = patient-initiated, enters open queue. scheduled = pre-booked via PHO rural GP flow, assigned_provider_id + scheduled_for are set at booking time, appears in provider queue only within the shift window.';

-- ── Provider role flag for PHO coordinator ────────────────────────────────
-- Scoped read/write role — can see shifts + book patients + view history
-- for ONE pho_contract_id. Not an admin; can't see acute queue, can't see
-- clinical notes. Role reuses the existing provider auth (email + PIN +
-- MFA); _auth.js gates sensitive routes on is_admin or role flags already.
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS is_pho_coordinator BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pho_contract_id    UUID REFERENCES pho_contracts(id) ON DELETE SET NULL;

COMMENT ON COLUMN providers.is_pho_coordinator IS
  'PHO front-desk / coordinator role. Can view shift grid across all practices in their pho_contract_id, book patients into available slots, see patient demographics + past consult history for continuity. Cannot see acute queue, clinical notes, prescriptions, or anything outside their PHO.';
COMMENT ON COLUMN providers.pho_contract_id IS
  'Scope key when is_pho_coordinator=true. All reads/writes gated by this value server-side so one PHO coord cannot see another PHO''s data.';

-- ── Seed Kimi Hauora Wairau + beta practices ──────────────────────────────
-- Patrick confirmed beta: Renwick Medical Centre + Havelock. Insert as
-- idempotent — safe to re-run.
INSERT INTO pho_contracts (name, slug, active, notes) VALUES
  ('Kimi Hauora Wairau', 'kimi-hauora-wairau', true, 'Marlborough PHO. Rural GP coverage pilot verbally confirmed 2026-11-10 pending MoU.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO rural_practices (pho_contract_id, name, slug, active) VALUES
  ((SELECT id FROM pho_contracts WHERE slug = 'kimi-hauora-wairau'), 'Renwick Medical Centre', 'renwick', true),
  ((SELECT id FROM pho_contracts WHERE slug = 'kimi-hauora-wairau'), 'Havelock Medical Centre',  'havelock', true)
ON CONFLICT (slug) DO NOTHING;
