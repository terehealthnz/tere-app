-- Fix 3 pharmacy_contacts rows whose IDs don't match the Medsafe register
-- IDs used by pharmacies.json — meaning the JOIN was missing and providers
-- saw "No dispensary email on file" for these pharmacies even though the
-- email had been seeded correctly.
--
-- The mismatch happened because the manual seed's ID slug generator used
-- a slightly different region string than the register builder. All three
-- rows already exist in prod with the wrong ID; we UPDATE the id in place
-- so we don't lose the crowdsource state that may have accreted on the
-- (correctly-keyed) row over time.
--
-- If an entry with the correct id already exists (someone hit the
-- crowdsource form for it since seed), the UPDATE is skipped safely
-- and the wrong-id row is deleted so the correct one wins.
--
-- Column note: the pharmacy_contacts primary key is pharmacy_id (not id).
-- Earlier draft of this migration used `id` and 500'd — see the original
-- CREATE TABLE in 2026-07-05_pharmacy_contacts.sql.

DO $$
BEGIN
  -- 1. Northcote Family Pharmacy: seed said 'auckland', register says 'waitemat'
  IF EXISTS (SELECT 1 FROM pharmacy_contacts WHERE pharmacy_id = 'northcote-family-pharmacy-auckland') THEN
    IF EXISTS (SELECT 1 FROM pharmacy_contacts WHERE pharmacy_id = 'northcote-family-pharmacy-waitemat') THEN
      DELETE FROM pharmacy_contacts WHERE pharmacy_id = 'northcote-family-pharmacy-auckland';
    ELSE
      UPDATE pharmacy_contacts
        SET pharmacy_id = 'northcote-family-pharmacy-waitemat'
        WHERE pharmacy_id = 'northcote-family-pharmacy-auckland';
    END IF;
  END IF;

  -- 2. Unichem Olsens Pharmacy: seed said 'olsen-s' (apostrophe → -s-), register 'olsens'
  IF EXISTS (SELECT 1 FROM pharmacy_contacts WHERE pharmacy_id = 'unichem-olsen-s-pharmacy-west-coast') THEN
    IF EXISTS (SELECT 1 FROM pharmacy_contacts WHERE pharmacy_id = 'unichem-olsens-pharmacy-west-coast') THEN
      DELETE FROM pharmacy_contacts WHERE pharmacy_id = 'unichem-olsen-s-pharmacy-west-coast';
    ELSE
      UPDATE pharmacy_contacts
        SET pharmacy_id = 'unichem-olsens-pharmacy-west-coast'
        WHERE pharmacy_id = 'unichem-olsen-s-pharmacy-west-coast';
    END IF;
  END IF;

  -- 3. Chemist Warehouse Blenheim Square: register mislabels this
  -- Riccarton/Christchurch store as "Nelson Marlborough" (register data
  -- bug — the store is on Blenheim Road, Riccarton, NOT in Blenheim,
  -- Marlborough). Seed used 'canterbury' from the address; register drives
  -- the ID, so we mirror the register's slug so JOIN succeeds.
  IF EXISTS (SELECT 1 FROM pharmacy_contacts WHERE pharmacy_id = 'chemist-warehouse-blenheim-square-canterbury') THEN
    IF EXISTS (SELECT 1 FROM pharmacy_contacts WHERE pharmacy_id = 'chemist-warehouse-blenheim-square-nelson-marlborough') THEN
      DELETE FROM pharmacy_contacts WHERE pharmacy_id = 'chemist-warehouse-blenheim-square-canterbury';
    ELSE
      UPDATE pharmacy_contacts
        SET pharmacy_id = 'chemist-warehouse-blenheim-square-nelson-marlborough'
        WHERE pharmacy_id = 'chemist-warehouse-blenheim-square-canterbury';
    END IF;
  END IF;
END $$;

-- Sanity check — should return 3 rows after the migration lands.
-- SELECT pharmacy_id, premises_name, dispensary_email FROM pharmacy_contacts
-- WHERE pharmacy_id IN (
--   'northcote-family-pharmacy-waitemat',
--   'unichem-olsens-pharmacy-west-coast',
--   'chemist-warehouse-blenheim-square-nelson-marlborough'
-- );
