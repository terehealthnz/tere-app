-- Add weight_data column so trained BP model weights can travel to any browser.
-- Run this in Supabase Studio → SQL editor before deploying the new bpModel.js.
--
-- v9 weights base64-encode to ~15 KB, well within a text column limit.
-- model_topology + weight_specs columns already exist (currently null) — this
-- migration just fills the missing weight_data slot.

ALTER TABLE model_versions
  ADD COLUMN IF NOT EXISTS weight_data_base64 text;

COMMENT ON COLUMN model_versions.weight_data_base64 IS
  'Base64-encoded TF.js weight ArrayBuffer. Paired with model_topology + weight_specs to fully restore the trained model on any browser.';
