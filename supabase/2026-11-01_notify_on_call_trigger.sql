-- Postgres-level guarantee that /api/notify-on-call-trigger fires whenever
-- in_waiting_room transitions false→true on a consultation. The DB itself
-- is the source of truth; the trigger runs regardless of whether the HTTP
-- handler that did the UPDATE completed cleanly, whether the patient's
-- browser was still open, or whether a Vercel lambda was frozen mid-await.
--
-- Three layers of notification guarantee, highest-latency last:
--   1. /api/patient-consult handler calls notifyOnCallProviders() with await
--      — fastest when the handler survives to completion.
--   2. This trigger calls pg_net.http_post to /api/notify-on-call-trigger
--      — sub-second guarantee, independent of handler lifecycle.
--   3. /api/cron-notify-on-call-sweep every 2 min picks up anything still
--      unclaimed — belt-and-braces for network/trigger failures.
--
-- All three paths funnel into notifyOnCallProviders() which does an atomic
-- claim on consultations.on_call_sms_sent_at — whichever path wins the
-- UPDATE first sends the SMS; the others see the claim and bail safely.
--
-- MANUAL SETUP after applying this migration (one-time):
--   -- 1. Enable pg_net in Supabase UI: Database → Extensions → pg_net
--   -- 2. Store the Vercel URL + shared secret as database settings:
--   ALTER DATABASE postgres SET app.notify_url = 'https://terehealth.co.nz/api/notify-on-call-trigger';
--   ALTER DATABASE postgres SET app.notify_secret = '<SAME_VALUE_AS_VERCEL_NOTIFY_TRIGGER_SECRET>';
--   -- 3. Set the matching env var on Vercel: NOTIFY_TRIGGER_SECRET
--   -- 4. SELECT pg_reload_conf();  -- so new sessions pick up the GUCs
-- Until steps 1-3 are done, the trigger will log a notice and no-op
-- (safe to deploy early; sweep cron is the fallback).

CREATE OR REPLACE FUNCTION notify_on_call_waiting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  -- Only fire on the specific false→true transition. Also skip practice
  -- consults — they're allowed to notify from the handler path (test wiring)
  -- but we don't want the trigger adding noise too.
  IF NEW.in_waiting_room IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF OLD.in_waiting_room IS TRUE THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_practice, FALSE) IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Pull config. If missing, no-op (the sweep cron is the fallback).
  v_url    := current_setting('app.notify_url', TRUE);
  v_secret := current_setting('app.notify_secret', TRUE);
  IF v_url IS NULL OR v_secret IS NULL OR v_url = '' OR v_secret = '' THEN
    RAISE NOTICE 'notify_on_call_waiting: app.notify_url or app.notify_secret not set; relying on sweep cron';
    RETURN NEW;
  END IF;

  -- pg_net is async by design — the HTTP call does not block the UPDATE.
  -- If pg_net is not installed, this will raise and roll back the UPDATE,
  -- which is BAD (would break patient waiting-room entry). Wrap in a
  -- separate exception block so the trigger always succeeds.
  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object('consultationId', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_on_call_waiting: pg_net call failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_call_waiting_tr ON consultations;

CREATE TRIGGER notify_on_call_waiting_tr
AFTER UPDATE OF in_waiting_room ON consultations
FOR EACH ROW
WHEN (NEW.in_waiting_room IS DISTINCT FROM OLD.in_waiting_room)
EXECUTE FUNCTION notify_on_call_waiting();

COMMENT ON FUNCTION notify_on_call_waiting IS
  'Fires /api/notify-on-call-trigger when a consult enters the waiting room. See supabase/2026-11-01_notify_on_call_trigger.sql for setup. Belt-and-braces layer alongside the handler-await path and the /api/cron-notify-on-call-sweep cron.';
