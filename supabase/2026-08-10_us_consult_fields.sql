-- Add columns needed for US (Tere Care) consultations.
-- Run in Supabase SQL Editor (production).
--
--   patient_state       — 2-letter USPS code captured at US intake.
--                         NULL for NZ consults (they don't have states).
--   licensed_states     — providers.licensed_states is a per-provider allowlist
--                         of USPS codes the provider is licensed in. NULL means
--                         no US licensing (NZ-only provider). Populated for
--                         Patrick with {'WA','CA','MO','TX','UT','ID'}.
--
-- Both are nullable + additive: no impact on existing NZ flow.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS patient_state text;

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS licensed_states text[];

-- Patrick — the only US-licensed provider — gets his six states.
-- Match on his MCNZ number to avoid depending on the display name.
UPDATE providers
   SET licensed_states = ARRAY['WA','CA','MO','TX','UT','ID']
 WHERE mcnz_number = '99529'
   AND (licensed_states IS NULL OR array_length(licensed_states, 1) IS NULL);
