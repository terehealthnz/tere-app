FROM node:22-slim

# node:22-slim ships without CA roots. The native rtc-node binding can't
# verify LiveKit's TLS cert without them, so Room.connect() fails with
# "no native root CA certificates found" and the job crashes before
# subscribing to audio.
#
# Node 22 (not 20) is required because @supabase/supabase-js constructs
# a RealtimeClient on createClient() which needs native WebSocket. Node
# 20 throws "no native WebSocket support" from the shutdown callback,
# which drops the transcript write silently (process exits mid-write).
# First real patient affected: Alexandra Rankin 2026-11-02.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY agent.js ./

# Patch the LiveKit Agents SDK to surface the error that cli.js:76 swallows
# with `catch {}`. Without this patch, worker crashes print only
# "closing worker due to error." with no stack trace.
RUN sed -i 's|} catch {|} catch (e) { console.error("[CLI runServer catch]", e);|' \
    /app/node_modules/@livekit/agents/dist/cli.js

CMD ["node", "agent.js", "start"]
