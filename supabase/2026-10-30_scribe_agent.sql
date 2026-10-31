-- Server-side scribe via LiveKit Agent. Replaces the iOS-Safari-broken
-- client-side MediaRecorder pipeline. See [[project-tere-scribe-agent]] /
-- tere-scribe-agent/README.md.

-- Track which pipeline wrote the transcript so we can monitor the rollout
-- and compare quality agent-vs-client during the feature-flag window.
alter table consultations
  add column if not exists transcript_source text
  check (transcript_source in ('agent', 'client') or transcript_source is null);

comment on column consultations.transcript_source is
  'Which scribe pipeline produced consultations.transcript: ''agent'' = LiveKit Agent + Deepgram (tere-scribe-agent Fly service), ''client'' = legacy browser MediaRecorder + /api/transcribe. NULL = no transcript (triage-only, no-show, etc).';

-- Feature flag. Stays OFF until the Fly service is deployed and smoke-tested.
-- Flip to true in Admin > Feature Flags once agent is proven. If agent
-- misbehaves in prod, flip back to false and client-scribe takes over without
-- a code deploy (ProviderConsult.jsx checks this flag at startScribe time).
insert into feature_flags (key, enabled, description)
values (
  'scribe_agent_enabled',
  false,
  'Server-side scribe via LiveKit Agent (tere-scribe-agent on Fly). When true: client-scribe stays dormant, agent handles capture + Deepgram streaming + transcript write. When false: legacy client-scribe runs. Kill switch for the agent pipeline.'
)
on conflict (key) do nothing;
