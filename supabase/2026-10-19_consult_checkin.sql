-- Admin-triggered follow-up to patients who abandoned a consult after
-- entering their contact details. Reaches people who got as far as the
-- payment page (or beyond) and then bailed — see if they still need help.
--
-- Three columns, idempotent-on-send: once check_in_sent_at is populated
-- the UI button flips to "✓ Sent" and the endpoint refuses re-send on
-- the same consultation to prevent accidental spam.
--
-- Not a cron. One-click admin action. Timing + wording stays human until
-- we see how patients react.

alter table consultations
  add column if not exists check_in_sent_at timestamptz,
  add column if not exists check_in_sent_by uuid references providers(id),
  add column if not exists check_in_channel text;

alter table consultations
  drop constraint if exists consultations_check_in_channel_check;
alter table consultations
  add constraint consultations_check_in_channel_check
    check (check_in_channel is null or check_in_channel in ('email', 'sms', 'email+sms'));

comment on column consultations.check_in_sent_at is
  'Timestamp of the admin-triggered "are you still OK?" check-in sent for an '
  'abandoned consult. NULL = never sent. Non-null blocks re-send from the '
  'Operations funnel UI.';
