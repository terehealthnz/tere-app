-- Practitioner's Supply Orders (PSO) + Standing Orders admin module.
--
-- Use case: Tere Health acts as Medical Director of record for third-party
-- organisations (schools, outdoor-ed, aged care, remote worksites). The MD
-- issues PSOs so the organisation's nominated pharmacy can dispense bulk
-- emergency medicines to the org without naming individual patients, and
-- Standing Orders so the org's trained staff can administer those medicines
-- under defined clinical criteria without a prescription per recipient.
--
-- Regulatory basis: NZ Medicines Act 1981 + Medicines Regulations 1984
-- (PSOs), Medicines (Standing Order) Regulations 2002 (Standing Orders).

CREATE TABLE IF NOT EXISTS pso_organisations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  base_location   text,
  contact_name    text,
  contact_email   text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS psos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pso_number        text UNIQUE,
  organisation_id   uuid NOT NULL REFERENCES pso_organisations(id) ON DELETE RESTRICT,
  prescriber_id     uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  items             jsonb NOT NULL,  -- [{name, strength, form, quantity}]
  purpose           text NOT NULL,
  storage_location  text,
  pharmacy_name     text NOT NULL,
  pharmacy_address  text,
  pharmacy_email    text NOT NULL,
  issue_date        date NOT NULL DEFAULT CURRENT_DATE,
  valid_until       date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 year'),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
  sent_at           timestamptz,
  sent_to_pharmacy  text,
  sent_cc           text,
  delivery_error    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS standing_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  so_number         text UNIQUE,
  organisation_id   uuid NOT NULL REFERENCES pso_organisations(id) ON DELETE RESTRICT,
  prescriber_id     uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  title             text NOT NULL,
  indication        text NOT NULL,
  inclusion         jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusion         jsonb NOT NULL DEFAULT '[]'::jsonb,
  dose              text NOT NULL,
  documentation     text,
  linked_pso_id     uuid REFERENCES psos(id) ON DELETE SET NULL,
  issue_date        date NOT NULL DEFAULT CURRENT_DATE,
  review_date       date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 year'),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
  sent_at           timestamptz,
  delivery_error    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS psos_org_idx ON psos (organisation_id);
CREATE INDEX IF NOT EXISTS psos_prescriber_idx ON psos (prescriber_id);
CREATE INDEX IF NOT EXISTS psos_valid_until_idx ON psos (valid_until) WHERE status = 'issued';
CREATE INDEX IF NOT EXISTS standing_orders_org_idx ON standing_orders (organisation_id);
CREATE INDEX IF NOT EXISTS standing_orders_review_date_idx ON standing_orders (review_date) WHERE status = 'issued';

-- Sequential PSO/SO numbers scoped per calendar year.
CREATE SEQUENCE IF NOT EXISTS pso_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS so_number_seq START 1;

-- Seed Outward Bound as the first organisation so the admin UI has a
-- recipient to pick on day one. Idempotent via UNIQUE(name).
INSERT INTO pso_organisations (name, base_location, contact_name, contact_email)
VALUES (
  'Outward Bound New Zealand',
  'Anakiwa, Marlborough Sounds',
  'Kevin Rowley',
  'krowley@outwardbound.co.nz'
) ON CONFLICT (name) DO NOTHING;
