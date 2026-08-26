-- Pen-test P2 #F4 — atomic per-email rate limit for patient support intake.
--
-- Previous flow (api/_patient-support.js):
--   1. SELECT count(*) FROM patient_support_requests WHERE email = $1 AND created_at >= now() - 1h
--   2. If count < 3 → INSERT
--
-- TOCTOU: N concurrent submits for the same email each read count < 3,
-- then all insert. Under sustained abuse an attacker can blast dozens of
-- Resend autoresponders at a victim's inbox before any single request's
-- INSERT lands in the next request's SELECT.
--
-- Fix: single-statement RPC that takes an xact-scoped advisory lock keyed
-- on the lowercased email hash, re-reads the count under the lock, and
-- either INSERTs or reports rate_limited=true. Concurrent submits for the
-- SAME email serialize on the lock. Different emails do not contend.
--
-- Advisory lock namespace 8801 chosen arbitrarily — no other RPC in this
-- schema uses it. hashtext() returns int4; two-arg pg_advisory_xact_lock
-- takes (int4, int4) so this maps cleanly.

CREATE OR REPLACE FUNCTION public.patient_support_insert_rate_limited(
  p_category         text,
  p_message          text,
  p_patient_name     text,
  p_patient_email    text,
  p_patient_phone    text,
  p_consultation_id  uuid,
  p_source           text,
  p_max_per_window   int,
  p_window_hours     int
) RETURNS TABLE (id uuid, rate_limited boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    text := lower(coalesce(p_patient_email, ''));
  v_count    int;
  v_new_id   uuid;
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'patient_email is required';
  END IF;

  PERFORM pg_advisory_xact_lock(8801, hashtext(v_email));

  SELECT count(*) INTO v_count
    FROM patient_support_requests
   WHERE patient_email = v_email
     AND created_at >= now() - (p_window_hours || ' hours')::interval;

  IF v_count >= p_max_per_window THEN
    RETURN QUERY SELECT NULL::uuid, true;
    RETURN;
  END IF;

  INSERT INTO patient_support_requests (
    category, message, patient_name, patient_email, patient_phone,
    consultation_id, source, status
  ) VALUES (
    p_category, p_message, p_patient_name, v_email, p_patient_phone,
    p_consultation_id, p_source, 'new'
  )
  RETURNING patient_support_requests.id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.patient_support_insert_rate_limited(
  text, text, text, text, text, uuid, text, int, int
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_support_insert_rate_limited(
  text, text, text, text, text, uuid, text, int, int
) FROM anon;
REVOKE ALL ON FUNCTION public.patient_support_insert_rate_limited(
  text, text, text, text, text, uuid, text, int, int
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.patient_support_insert_rate_limited(
  text, text, text, text, text, uuid, text, int, int
) TO service_role;
