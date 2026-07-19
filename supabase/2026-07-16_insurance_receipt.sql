-- Two-tier receipt system for consultations:
--   1) basic_receipt_sent_at   — the free plain HTML receipt auto-emailed at
--      sign-off time. Timestamp used as an idempotency guard so we never
--      double-send if a provider re-finalises the notes.
--   2) insurance_receipt_purchased_at — when the patient paid the $10 upsell
--      for the itemised insurance-formatted PDF receipt.
--   3) insurance_receipt_url  — Supabase Storage URL for the emailed PDF, so
--      the patient can re-download it from ConsultationSummary later without
--      us having to regenerate + re-email.
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS basic_receipt_sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_receipt_purchased_at timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_receipt_url          text;
