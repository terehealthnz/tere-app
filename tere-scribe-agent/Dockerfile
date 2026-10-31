FROM node:20-slim

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
