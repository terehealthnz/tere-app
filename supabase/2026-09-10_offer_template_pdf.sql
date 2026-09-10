-- Attach the executed contractor agreement as a proper PDF instead of
-- rendering the 50k-char body inline in the offer PDF. The wrapper
-- "Letter of Offer" PDF stays short and clean; the attached agreement
-- (e.g. v8.1 from Heather Collins) preserves its own formatting,
-- numbered clauses, and Schedule tables.
--
-- `contract_terms` stays on the row for backwards compatibility with
-- text-only templates (older offers, quick informal roles). New
-- templates supply a PDF and use `contract_terms` only as a short
-- summary paragraph rendered in the wrapper.

ALTER TABLE offer_templates
  ADD COLUMN IF NOT EXISTS contract_pdf_key  text,
  ADD COLUMN IF NOT EXISTS contract_pdf_name text;

-- Snapshot the exact PDF used at offer-send time. If the template PDF
-- is later replaced (v8.1 → v9), historical offers continue to
-- reference the exact file the applicant signed against.
ALTER TABLE job_offers
  ADD COLUMN IF NOT EXISTS contract_pdf_key  text,
  ADD COLUMN IF NOT EXISTS contract_pdf_name text,
  ADD COLUMN IF NOT EXISTS applicant_acknowledged_contract_at timestamptz;

-- Private storage bucket for contract PDFs. Service key uploads; signed
-- URLs (1hr TTL) issued to admins + the applicant on their offer page.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('offer-contracts', 'offer-contracts', false)
  ON CONFLICT (id) DO NOTHING;
