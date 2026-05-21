-- Employer payment bypass migration

CREATE TABLE IF NOT EXISTS employers (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name  text NOT NULL,
  contact_email text,
  monthly_rate_per_employee numeric(10,2),
  contract_start date,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employer_employees (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id uuid REFERENCES employers(id) ON DELETE CASCADE,
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  dob         date,
  employee_id text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS employer_paid  boolean DEFAULT false;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS employer_id    uuid REFERENCES employers(id);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS employer_name  text;

ALTER TABLE employers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_employees ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employers' AND policyname='open_access') THEN
    CREATE POLICY "open_access" ON employers FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employer_employees' AND policyname='open_access') THEN
    CREATE POLICY "open_access" ON employer_employees FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
