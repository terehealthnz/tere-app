# ARC (Aged Residential Care) Build - Operator Notes

Last updated: 2026-11-05

This doc covers what the ARC feature needs in Vercel env + SES/SNS console
before the wave 8 pipeline (monthly report + bounce webhook) can run end to
end. Code is already shipped behind `employers.org_type='aged_care'` so
non-ARC flows are unaffected.

## Vercel env vars

Required for the SES bounce webhook (`/api/ses-bounce-webhook`):

- `SES_SNS_SUBSCRIPTION_TOPIC_ARN` -- the SNS topic ARN SES publishes
  bounce/complaint events to. The webhook refuses any message whose
  `TopicArn` doesn't match this value even when the SNS signature is
  valid, so a different SNS topic can't post forged events into our
  endpoint.

Already in place (verified during earlier cutovers, listed here for
completeness):

- `CRON_SECRET` -- authenticates the monthly cron fan-out (same secret
  used by every `/api/cron-*` job).
- `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` -- SES
  v2 send (via `_email-client.js`). Defaulted `ap-southeast-2` in code.
- `EMAIL_PROVIDER=ses` -- flip to `ses` in prod per the 2026-08-29 cutover
  memory; the webhook only pages if `hasEmailProvider()` returns true.
- `VITE_APP_URL` -- used by `_cron-arc-monthly-report.js` to call the
  per-facility endpoint over HTTP. Defaults to `https://terehealth.co.nz`.

Not needed, listed only to avoid confusion:

- `NOTIFY_TRIGGER_SECRET` is NOT used by the ARC pipeline (reuses
  `CRON_SECRET` for both cron auth and in-cron fan-out).

## SNS subscription setup

1. In the SES console for the verified sending identity (same one used
   for outbound hello@terehealth.co.nz), enable bounce + complaint
   notifications and point them at an SNS topic in `ap-southeast-2`.
2. Create a subscription on that SNS topic with:
   - Protocol: `HTTPS`
   - Endpoint: `https://terehealth.co.nz/api/ses-bounce-webhook`
3. SNS posts a `SubscriptionConfirmation` message to the endpoint on
   create. Our handler verifies the SNS signature + topic ARN, then
   GETs the `SubscribeURL` to complete the handshake. If the
   subscription stays in `Pending confirmation`, check Vercel logs for
   `[ses-bounce]` warnings (the common failure modes are a cert URL
   outside `sns.*.amazonaws.com` or a topic ARN mismatch).
4. Set `SES_SNS_SUBSCRIPTION_TOPIC_ARN` in Vercel to the ARN of the
   same topic.
5. (Optional) Send a test bounce via `success@simulator.amazonses.com`
   (SES mailbox simulator permanent-bounce address) to confirm the end
   to end flow flips `employers.delivery_status='bounced'` for a dummy
   facility row.

## Cron

`vercel.json` adds `0 20 7 * *` = day 7 of each month, 20:00 UTC =
09:00 NZDT. Runs `/api/cron-arc-monthly-report` which fans out to
`/api/arc-monthly-report` per facility. Admins can press "Send report
now" on any ARC facility row to fire the same pipeline on demand;
reports blocked by `delivery_status='bounced'` surface a 409 with
`code=DELIVERY_BOUNCED` and the admin must press "Mark resolved" on
the panel before sends resume.

## Smoke test checklist (prod)

1. Admin -> Organisations -> + New organisation -> Aged residential
   care. Fill with two distinct named humans for clinical + backup
   (shared-mailbox addresses are rejected server-side).
2. Upload the ARC CSV template (admin-row -> CSV template). Edit at
   least one row to carry `facility_resident_id`, `resus_status=nfr`,
   `transfer_to_hospital=false`, `acp_summary`, and an EPOA block.
3. Upload the CSV -> confirm "N added, 0 updated, 0 removed" in the
   banner. Re-upload the same CSV with one row removed -> confirm it
   shows "0 added, N updated, 1 removed from active roster".
4. Browse `/work/<slug>/intake` in an incognito window. Enter the
   roster'd resident's name + DOB. Confirm:
   - "Calling on behalf" defaults on (nurse pattern)
   - ACP banner renders (red for NFR, with the ACP summary)
   - EPOA override dropdown is rejected unless the resident carries
     `epoa_type=personal_care_welfare` + `epoa_activated=true`
   - Facility-vitals tab stores values separately from the WAND scan
5. Complete a dummy consult. Confirm the "Rest home disposition"
   dropdown is required to Finalise.
6. Press "Send report now" on the facility row -> confirm the email
   lands at both clinical + backup contacts with the PDF attached and
   no clinical content in the body.
