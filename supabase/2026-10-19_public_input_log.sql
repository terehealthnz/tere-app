-- Public-input quarantine for /vitals-validate anonymous submissions.
--
-- Threat model: a random on the internet typing SBP 300 + scanning their
-- face poisons the BP regression training set. Server-side source tag
-- gates every submission; nothing feeds training until a human admin
-- flips review_decision='promoted'. Clients cannot set source — it's
-- derived server-side from provider auth presence.
--
-- Backfill is pending-review for every historical anon-* row (Patrick
-- 2026-10-19). Training set shrinks by ~70 subjects immediately; manual
-- review clears the backlog. Alternative (grandfather) was rejected
-- because the whole point is "I don't want bad players messing with our
-- data" and we have no retrospective way to tell a legitimate NZ 56y
-- female volunteer from an attacker.
--
-- source + review_decision live on validation_subjects (not readings)
-- because every reading joins through subject_id. One subject may
-- accumulate multiple readings over a scan session; promoting once
-- clears the whole subject.

alter table validation_subjects
  add column if not exists source           text not null default 'authenticated',
  add column if not exists review_decision  text,
  add column if not exists reviewed_at      timestamptz,
  add column if not exists reviewed_by      uuid references providers(id),
  add column if not exists rejection_reason text,
  add column if not exists submitted_ip     text,
  add column if not exists submitted_ua     text;

-- Narrow the shape of what the column can carry — prevents typos in
-- the endpoint from silently classifying rows as something new.
alter table validation_subjects
  drop constraint if exists validation_subjects_source_check;
alter table validation_subjects
  add constraint validation_subjects_source_check
    check (source in ('authenticated', 'public_anonymous'));

alter table validation_subjects
  drop constraint if exists validation_subjects_review_decision_check;
alter table validation_subjects
  add constraint validation_subjects_review_decision_check
    check (review_decision is null or review_decision in ('promoted', 'rejected'));

-- Backfill: every anon-prefixed row is reclassified as public_anonymous
-- with review_decision=NULL (pending). Non-anon rows stay 'authenticated'
-- by the column default. We can't tell apart the ~70 historical anons
-- that happen to be legit volunteers from potential attackers; manual
-- review is the only correct answer.
update validation_subjects
   set source = 'public_anonymous'
 where first_name like 'anon-%'
   and source = 'authenticated';

-- Hot index for the Public Inbox tab query: "show me unreviewed public
-- submissions." Partial index so it stays tiny (only pending rows).
create index if not exists validation_subjects_pending_review_idx
  on validation_subjects(created_at desc)
  where source = 'public_anonymous' and review_decision is null;

comment on column validation_subjects.source is
  'Where the subject row came from. ''authenticated'' = created by a logged-in '
  'Tere provider (clinic / staff self-test); feeds training automatically. '
  '''public_anonymous'' = created via unauthenticated /vitals-validate; '
  'quarantined until admin promotes.';

comment on column validation_subjects.review_decision is
  'For source=public_anonymous rows: NULL = pending review, ''promoted'' = '
  'admin cleared for training inclusion, ''rejected'' = admin marked as bad '
  'data (kept in table for log/audit but excluded from training queries).';
