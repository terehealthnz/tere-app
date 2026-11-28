-- Separate overnight on-call shift from the daytime queue-ping shift.
--
-- sms_on_call (existing, 2026-09-30) = daytime queue ping, provider
-- self-toggles via ProviderApp top-nav. All active providers with mobiles
-- and the flag on get pinged for daytime consults (08:00-20:00 NZT).
--
-- sms_on_call_overnight (new) = admin-assigned overnight ARC shift
-- (20:00-08:00 NZT, aged_care consults only). Only providers with THIS
-- flag get the SMS + wake-up voice call. Default false so nobody gets
-- pinged at 3am unless admin has explicitly rostered them for overnight.
-- Patrick solo for now; later a backup clinician can be flagged in too.
--
-- Incident 2026-11-27 23:43 NZT: a test consult fired SMS + voice calls
-- to all 4 sms_on_call providers (Rachel, Justin, Ian, Patrick) because
-- notifyOnCallProviders filtered only on sms_on_call. Separate column
-- prevents daytime rota from leaking into overnight.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS sms_on_call_overnight boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN providers.sms_on_call_overnight IS
  'Admin-assigned flag: provider is on the overnight ARC on-call shift (20:00-08:00 NZT, aged_care consults). Separate from sms_on_call which is the self-service daytime queue ping. Default false — must be explicitly rostered by admin so no provider gets woken up at 3am unexpectedly.';
