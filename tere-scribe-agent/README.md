# tere-scribe-agent

Server-side scribe for Tere Health. Joins LiveKit consult rooms when dispatched, pipes audio to Deepgram, writes transcript to consultations.transcript.

## Why this exists

Client-side MediaRecorder is broken on iOS Safari. WebKit silently produces 0-byte audio from remote WebRTC tracks routed through AudioContext.createMediaStreamSource(). 3 providers hit it. Moving capture to the server removes the browser from the pipeline.

## Deploy

### Prereqs
- fly CLI logged in to the Tere org (same as tere-hl7-mtls)
- Supabase migration already applied: supabase/2026-10-30_scribe_agent.sql
- Vercel API changes shipped (agentDispatch wiring in /api/_initiate-call.js)

### First-time launch
```
cd tere-scribe-agent
fly launch --no-deploy --copy-config
fly secrets set \
  LIVEKIT_URL=... \
  LIVEKIT_API_KEY=... \
  LIVEKIT_API_SECRET=... \
  DEEPGRAM_API_KEY=... \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=...
fly deploy
```

### Verify
```
fly logs
# Expect: "registered worker" and "agent ready" lines
```

Then do a test consult on prod with the `scribe_agent_enabled` feature flag OFF (so client-scribe still runs). You should see a `job assigned` log line but transcript_source stays null (client-scribe wrote it). Then flip the flag ON via Admin > Feature Flags and do another test consult: this time transcript_source should be 'agent'.

### Kill switch
Flip feature flag `scribe_agent_enabled = false` in Admin. New consults won't dispatch to the agent (Vercel-side gate); client-scribe takes over again without a redeploy.

## Env vars (secrets)
- `LIVEKIT_URL` wss://... (same as Vercel)
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` same as Vercel
- `DEEPGRAM_API_KEY` same as Vercel
- `SUPABASE_URL` https://xxx.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY` service_role, NOT anon

## Operation

- One Fly machine, 512MB. Scales to multiple machines if we hit concurrent-call limits.
- Each dispatched room runs as a `Job` inside the agent process.
- Agent connects to LiveKit Cloud as a registered worker (agentName='tere-scribe'), waits for dispatches.
- Dispatches are triggered by /api/_initiate-call.js via agentDispatch.createDispatch(roomName, 'tere-scribe', JSON.stringify({ consultId })).
- Logs: `fly logs -a tere-scribe-agent`. Look for `consultId` in shutdown summary line.
