-- Intake geo gate — record IP-country + patient attestation at consult start
-- so we can prove the patient was in NZ at the time of the medical service.
-- MCNZ Telehealth Standards (Aug 2023) require the doctor be satisfied the
-- patient is physically located in NZ; IP + attestation together satisfies.
--
-- ip_hash rather than raw IP so we don't hold PII we don't need. Hash =
-- sha256(ip + salt). Enough to prove uniqueness / detect fraud patterns
-- without storing the address itself.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS intake_ip_country     text,       -- ISO-3166 alpha-2 from ipapi.co
  ADD COLUMN IF NOT EXISTS intake_ip_hash        text,       -- sha256(ip + salt), for audit
  ADD COLUMN IF NOT EXISTS intake_attested_nz    boolean,    -- patient ticked 'I'm in NZ'
  ADD COLUMN IF NOT EXISTS intake_attested_at    timestamptz;

CREATE INDEX IF NOT EXISTS idx_consultations_intake_country
  ON consultations (intake_ip_country)
  WHERE intake_ip_country IS NOT NULL AND intake_ip_country <> 'NZ';
