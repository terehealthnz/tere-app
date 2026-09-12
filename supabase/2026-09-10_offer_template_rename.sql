-- Rename the two built-in offer templates so their DB name matches the
-- Send-contract modal labels. Patrick clicked "Doctor" but the NP contract
-- was emailed — cause is a mismatch somewhere between name / contract_version.
--
-- Fix: force the name to match the routing key. Routing is driven by
-- contract_version (Admin.jsx SendContractModal → sendContractToProvider →
-- job_offers.contract_version → ContractRenderer REGISTRY), so we lock the
-- name to what the version key actually renders.
--
-- Safe to re-run: matches on contract_version, no dependency on IDs.

UPDATE offer_templates
   SET name = 'Doctor'
 WHERE contract_version = 'v8.1';

UPDATE offer_templates
   SET name = 'NP'
 WHERE contract_version = 'v8.1-np';
