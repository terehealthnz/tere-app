-- Ensure model_versions.trained_at always has a value.
--
-- The API endpoint at api/_model-version.js inserts a row without
-- explicitly setting trained_at, relying on the column default. If the
-- column has no default, the row lands with trained_at=NULL, which then
-- gets pulled back by loadModelFromSupabase() and clobbers the
-- freshly-stamped local META_KEY.trainedAt with null — breaking the
-- "Last trained: X min ago" display on the dashboard.
--
-- Safe to run repeatedly; ALTER COLUMN SET DEFAULT is idempotent, and
-- the UPDATE only fills nulls if any exist.

ALTER TABLE model_versions
  ALTER COLUMN trained_at SET DEFAULT now();

-- Backfill any historical NULL trained_at rows using their created_at
-- (or now() if created_at is also null). Prevents old rows from
-- continuing to poison loadModelFromSupabase() reads.
UPDATE model_versions
   SET trained_at = COALESCE(created_at, now())
 WHERE trained_at IS NULL;
