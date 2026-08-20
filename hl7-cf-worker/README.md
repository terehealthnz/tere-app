# Tere HL7 mTLS Receive — Cloudflare Worker

Migrates the Medical-Objects Capricorn → Vercel HL7 receive pipeline from Fly.io (`hl7-mtls-proxy/`) to a Cloudflare Worker.

## Why the migration

2026-08-19 test burst from Tony (Medical-Objects) lost 9 of 13 messages. Root causes on the old Fly.io stack:
- Fly edge dropping TCP connections mid-body (`unexpected end of file` from client-side reads in proxy logs)
- Proxy code had no `req.on('error')` handler → silent request discards
- No per-request logging → couldn't distinguish "message never arrived" from "message arrived but insert failed"
- Persistent HTTP keep-alive with no `Connection: close` → one bad connection poisoned subsequent messages on the same socket

Cloudflare Worker fixes all four by design: CF handles TLS + mTLS at edge with proper observability, Workers runtime has structured error propagation, every request logged with a correlation ID.

## Architecture

```
Medical-Objects Capricorn
        │
        │  HTTPS POST hl7/, client cert presented
        ▼
Cloudflare edge  (validates client cert against uploaded CA)
        │
        │  request.cf.tlsClientAuth populated
        ▼
Worker: tere-hl7-mtls  (src/worker.js)
        │  - checks CN allowlist
        │  - reads raw body
        │  - forwards to Vercel with X-Tere-Bridge-Secret
        ▼
Vercel: terehealth.co.nz/api/hl7-inbound  (unchanged)
        │  - shared-secret auth
        │  - persist to inbound_hl7_messages
        │  - build HL7 ACK
        │  - return ACK verbatim
        ▲
        │  ACK → upstream response → back to MO
```

DNS is already on Cloudflare (`leo.ns.cloudflare.com`, `bella.ns.cloudflare.com` for terehealth.co.nz).

## One-time Cloudflare dashboard setup (needed before first deploy)

1. **Enable mTLS on the zone.** Cloudflare dashboard → your `terehealth.co.nz` zone → SSL/TLS → Client Certificates. If this section is missing, it's under Zero Trust → Access → Service Auth → Mutual TLS on some plans.
2. **Upload the CA chain.** Click **Add mTLS certificate** → paste the contents of `../hl7-mtls-proxy/demo-client-chain-g3.pem` (the Medical-Objects demo intermediate + root chain). Name it e.g. `medical-objects-demo-2026`.
3. **Enforce mTLS on the hostname.** In the same section, under **Hosts requiring mTLS**, add `hl7.terehealth.co.nz`. This tells Cloudflare "for any request to this hostname, require a client cert that chains to one of the uploaded CAs."
4. **Verify DNS.** In DNS settings, ensure `hl7.terehealth.co.nz` has a record (any type — the Worker route will intercept before origin lookup). Simplest: `AAAA hl7 100::` (a placeholder null address) with proxy status **on** (orange cloud). The Worker route pattern in `wrangler.toml` will intercept all requests to this hostname before any origin fetch.

## Deploy the Worker

```bash
cd hl7-cf-worker
npm install                            # first time only
npx wrangler login                     # opens browser to authenticate
npx wrangler secret put HL7_BRIDGE_SECRET
  # paste the value used by Vercel /api/hl7-inbound
  # (same value that hl7-mtls-proxy on Fly.io uses)
npx wrangler deploy
```

After deploy Wrangler prints something like:
```
Uploaded tere-hl7-mtls (X.XX sec)
Deployed tere-hl7-mtls to hl7.terehealth.co.nz/*
Current Version ID: <uuid>
```

## Test it

**Health check (no client cert required):**
```bash
curl -v https://hl7.terehealth.co.nz/health
# → 200 ok
```

**mTLS check (should reject without cert):**
```bash
curl -v https://hl7.terehealth.co.nz/hl7 -X POST -d "test"
# → 400 (Cloudflare rejects at edge because no client cert presented)
```

**End-to-end with client cert:**
Ask Tony (Medical-Objects) to send a single test message. Watch live logs:
```bash
npx wrangler tail --format pretty
```
Expected log sequence per successful message:
```
{"rid":"a1b2c3d4","phase":"received","bytes":532,"cn":"hd.d5ddb385-...","cf_ray":"...","cf_ipcountry":"AU"}
{"rid":"a1b2c3d4","phase":"forwarded","ms":420,"upstream_status":200,"response_bytes":112}
```

## Cutover from Fly.io

Once the Worker is deployed and one test message from Tony is confirmed round-trip:

1. **Update Fly.io app to stop accepting traffic** (or delete it entirely — but keep the code + `demo-client-chain-g3.pem` in the repo for reference).
2. **No change needed on Medical-Objects side** — they already POST to `https://hl7.terehealth.co.nz/hl7`. DNS + Worker route handle the rest.
3. **Update the memory note** `~/.claude/projects/-Users-patrickherling/memory/` — flag the Fly.io HL7 bridge as retired, note the CF Worker as the current path.

## Rollback

If the Worker misbehaves and needs to revert to Fly.io:
1. Cloudflare dashboard → Workers Routes → delete the `hl7.terehealth.co.nz/*` route
2. DNS record for `hl7.terehealth.co.nz` → point back to Fly's IP (was `169.155.49.110`) with proxy status off (grey cloud) so Fly gets the raw TCP connection
3. Fly.io app already exists (`tere-hl7-mtls` in Sydney) — just needs to be still running

## Observability

- **Live tail:** `npx wrangler tail --format pretty`
- **Analytics:** Cloudflare dashboard → Workers → `tere-hl7-mtls` → Analytics tab
- **Logpush** (optional, for long-term audit trail): configure in dashboard → Analytics → Logpush. Sends JSON logs to R2, S3, or another logstore. Useful for HDC-audit-grade retention of receive events.

## Environment variables

Managed via `wrangler.toml` (non-secret) or `wrangler secret put NAME` (secret):

| Var | Type | Where set | Purpose |
|---|---|---|---|
| `UPSTREAM_URL` | var | wrangler.toml | Vercel HL7 receive endpoint |
| `TERE_ENV` | var | wrangler.toml | `nz-prod` / `nz-test` — stamped on outbound X-Tere-Env header |
| `ALLOWED_CNS` | var | wrangler.toml | Comma-separated CN allowlist |
| `HL7_BRIDGE_SECRET` | **secret** | `wrangler secret put` | Shared secret with Vercel /api/hl7-inbound |
