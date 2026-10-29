-- promo_codes: admin-issued discount codes with date windows + usage caps.
-- Admins create codes in the Admin > Promo Codes tab. Patients enter a code
-- on /payment and the server re-validates + discounts the Windcave auth
-- amount. Full audit trail of redemptions in promo_code_redemptions so
-- finance can tie a discount back to a specific consultation.
create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                       -- uppercase, e.g. 'SPRING50'
  description text,                                -- admin note, patient never sees
  discount_type text not null check (discount_type in ('percent','fixed','zero')),
  discount_value numeric not null check (discount_value >= 0),  -- percent 0-100, fixed in NZD, zero ignored
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  max_uses int,                                    -- null = unlimited
  current_uses int not null default 0,
  applies_to_country text not null default 'both' check (applies_to_country in ('nz','international','both')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references providers(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_promo_codes_code on promo_codes(code);
create index if not exists idx_promo_codes_active on promo_codes(active, valid_from, valid_to);

-- Audit trail of redemptions. Immutable from the app's POV (no update/delete
-- surfaced); writes happen only via the server-side redeem() helper after a
-- consultation is paid.
create table if not exists promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references promo_codes(id) on delete restrict,
  consultation_id uuid references consultations(id) on delete set null,
  patient_id uuid references patients(id) on delete set null,
  discount_applied_cents int not null,
  original_amount_cents int not null,
  final_amount_cents int not null,
  redeemed_at timestamptz not null default now()
);
create index if not exists idx_promo_redemptions_code on promo_code_redemptions(promo_code_id);
create index if not exists idx_promo_redemptions_consult on promo_code_redemptions(consultation_id);

-- Hook consultations to the applied promo so reporting + refund flows have
-- the context. promo_discount_cents stays denormalised on the row so finance
-- queries do not need to join promo_code_redemptions for every consult.
alter table consultations add column if not exists promo_code_id uuid references promo_codes(id);
alter table consultations add column if not exists promo_discount_cents int not null default 0;

-- RLS: admins read/write promo_codes, authenticated patients can only read
-- via the server endpoint. No public policies, all access goes through the
-- /api/promo-codes endpoint under the service-role key.
alter table promo_codes enable row level security;
alter table promo_code_redemptions enable row level security;
