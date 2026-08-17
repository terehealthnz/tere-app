-- Add missing updated_at column to providers.
-- /api/providers PATCH sets patch.updated_at = now() on every save. If the
-- column doesn't exist, every provider edit 500s with:
--   column "updated_at" of relation "providers" does not exist
--
-- Safe to run against a live table — no locking risk, defaults to now() for
-- existing rows so the backfill is atomic.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows so ORDER BY updated_at doesn't have NULL surprises.
UPDATE providers SET updated_at = COALESCE(updated_at, created_at, now())
 WHERE updated_at IS NULL;
