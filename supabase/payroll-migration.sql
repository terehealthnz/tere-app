-- Tere Health — Payroll migration
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS payroll_periods (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  provider_id         UUID REFERENCES providers(id) ON DELETE SET NULL,
  consultation_count  INTEGER NOT NULL DEFAULT 0,
  base_rate           NUMERIC(10,2) NOT NULL DEFAULT 15.00,
  holiday_pay_rate    NUMERIC(5,4) NOT NULL DEFAULT 0.08,
  base_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  holiday_pay_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_provider ON payroll_periods(provider_id);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_period  ON payroll_periods(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status  ON payroll_periods(status);

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON payroll_periods;
CREATE POLICY "Service role full access" ON payroll_periods FOR ALL USING (true);

-- Add email to providers if not already present (optional — used for payroll emails)
ALTER TABLE providers ADD COLUMN IF NOT EXISTS email TEXT;
