-- Bookings table for scheduled appointments with reservation fee
-- Run in Supabase SQL editor
CREATE TABLE IF NOT EXISTS bookings (
  id                              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_name                    TEXT NOT NULL,
  patient_dob                     DATE,
  patient_phone                   TEXT NOT NULL,
  patient_email                   TEXT,
  patient_returning               BOOLEAN DEFAULT false,
  provider_id                     UUID,
  provider_name                   TEXT,
  appointment_date                DATE NOT NULL,
  appointment_time                TEXT NOT NULL,
  appointment_datetime            TIMESTAMPTZ NOT NULL,
  consultation_type               TEXT NOT NULL DEFAULT 'video',
  reason                          TEXT,
  reservation_fee_payment_intent_id TEXT,
  reservation_fee_paid            BOOLEAN DEFAULT false,
  reservation_fee_refunded        BOOLEAN DEFAULT false,
  status                          TEXT NOT NULL DEFAULT 'confirmed',
  cancellation_reason             TEXT,
  cancelled_at                    TIMESTAMPTZ,
  cancelled_by                    TEXT,
  provider_change_notified_at     TIMESTAMPTZ,
  patient_response                TEXT,
  reminder_24h_sent               BOOLEAN DEFAULT false,
  reminder_1h_sent                BOOLEAN DEFAULT false,
  reschedule_of                   UUID,
  created_at                      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_date_idx     ON bookings(appointment_date);
CREATE INDEX IF NOT EXISTS bookings_provider_idx ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx   ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_datetime_idx ON bookings(appointment_datetime);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Service role bypass (API always uses service role)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON bookings USING (true) WITH CHECK (true);
  END IF;
END $$;
