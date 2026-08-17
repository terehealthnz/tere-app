# HL7 mTLS termination proxy (Fly.io)

Small Node.js service that terminates mTLS from Medical-Objects Capricorn
Cloud and forwards the raw HL7 v2 body to Vercel's `/api/hl7-inbound`.

Vercel serverless functions do not do mTLS on Hobby/Pro tiers. This proxy
lives on Fly.io in Sydney (~$5/month), validates the Capricorn client cert
against Medical-Objects' G3 test chain, then POSTs the raw body to Vercel
with a shared secret header (`X-Tere-Bridge-Secret`). The HL7 ACK from
Vercel is returned to Capricorn unchanged.

**Case #1058382** — Tony Cruice at MO Helpdesk is the coordinating contact.

## Test-network parameters

| What | Value |
|---|---|
| Client cert CN (pin) | `hd.d5ddb385-8b7c-460f-a887-0dcaddf48b0e-guid.id.test.medical-objects.com.au` |
| CA chain (validates client cert) | `demo-client-chain-g3.pem` (root + intermediate, in this folder) |
| Return-ACK URL (MO's listener) | `https://hd-d5ddb385-8b7c-460f-a887-0dcaddf48b0e-guid.test.medical-objects.com.au` |
| MSH-6 variants MO will send | `DEMO Tere Heal (G11238-E)`, `DEMO Tere Health (G11238-E)`, `G11238-E` |
| MSA-1 values MO uses | `CA` / `CE` / `CR` (2.4-compatible; parser at `api/_hl7-inbound.js` already accepts these) |

Prod will use a different CA chain and CN — MO will supply when we go live.

## Env vars

Set via `fly secrets set` (not committed):

| Var | Purpose | Default |
|---|---|---|
| `HL7_BRIDGE_SECRET` | Shared secret with Vercel `/api/hl7-inbound` — must match the Vercel env var of the same name | required |
| `UPSTREAM_URL` | Where to forward validated messages | `https://terehealth.co.nz/api/hl7-inbound` |
| `CA_PATH` | CA chain to trust for client cert validation | `/certs/demo-client-chain-g3.pem` |
| `SERVER_CERT_PATH` | Our server cert (what Capricorn validates when connecting) | `/certs/server.pem` |
| `SERVER_KEY_PATH` | Our server private key | `/certs/server.key` |
| `ALLOWED_CNS` | Comma-separated CN allowlist (case-insensitive). Empty = accept any cert the CA trusts (do NOT ship prod like that). | required — pin test CN above |

## Server-cert bootstrap (public CA required — confirmed with Tony 2026-08-17)

`fly.toml` uses `handlers = ['tls_passthrough']`, so **we serve TLS ourselves**
(Fly's edge does not terminate TLS on this app — it can't, because Fly's edge
doesn't do mTLS). Tony Cruice confirmed Medical-Objects requires a
**public-CA cert** (Let's Encrypt or DigiCert). Self-signed is not accepted.

**Standard path:**

1. Add DNS `hl7.tere.co.nz` A + AAAA records pointing at the Fly app IPs
   (`fly ips list` after `fly launch`).
2. `fly certs create hl7.tere.co.nz` — Fly does HTTP-01 or DNS-01 challenge
   and issues a Let's Encrypt cert.
3. Because we're on `tls_passthrough`, Fly's built-in TLS termination isn't
   used. Download the issued cert + key from Fly's cert storage and upload
   them to the app volume as `/certs/server.pem` + `/certs/server.key`.
4. Renewal every 90 days is manual for now — automate with acme.sh in the
   container later (task follow-up).

**ACK routing (confirmed with Tony 2026-08-17):** our current handler at
`/api/hl7-inbound` fully parses + matches + persists BEFORE returning the
HTTP response, so the inline body IS the final ACK. Option (a) inline-only.
No async POST-back needed unless we later move processing behind a queue.

Until the cert is uploaded, `fly deploy` will start the app but the TLS
listener will fail to bind and Capricorn's test POSTs will connection-reset.

## First deploy (test network)

```bash
brew install flyctl                             # once
cd hl7-mtls-proxy
fly launch --name tere-hl7-mtls --region syd --no-deploy

fly volumes create hl7certs --region syd --size 1

# Upload the CA chain to the volume (via one-off machine).
fly machine run -v hl7certs:/certs alpine sh -c "cat > /certs/demo-client-chain-g3.pem" \
  < demo-client-chain-g3.pem

# Also upload server.pem + server.key (see bootstrap section above).
# fly machine run -v hl7certs:/certs alpine sh -c "cat > /certs/server.pem" < your-server-cert.pem
# fly machine run -v hl7certs:/certs alpine sh -c "cat > /certs/server.key" < your-server-cert.key

# Secrets
fly secrets set \
  HL7_BRIDGE_SECRET="$(openssl rand -hex 32)" \
  UPSTREAM_URL="https://terehealth.co.nz/api/hl7-inbound" \
  ALLOWED_CNS="hd.d5ddb385-8b7c-460f-a887-0dcaddf48b0e-guid.id.test.medical-objects.com.au"

fly deploy
```

**Copy the same `HL7_BRIDGE_SECRET` into Vercel env** as `HL7_BRIDGE_SECRET` so
both ends agree. Vercel is authoritative for the app; if the secret is missing
there, `/api/hl7-inbound` silently rejects with an HL7 CR ack (see
`api/_hl7-inbound.js` line ~325).

## Smoke test after deploy

```bash
# 1. Health check (no client cert required)
curl https://tere-hl7-mtls.fly.dev/health

# 2. mTLS reachability (should reject without cert)
openssl s_client -connect tere-hl7-mtls.fly.dev:443 -showcerts </dev/null 2>&1 | head -30

# 3. Full round-trip with MO's Postman collection
#    (CustomerHL7InboundIntegration NZ.postman_collection.json — ask Tony)
#    pointed at https://tere-hl7-mtls.fly.dev/hl7/
```

## Going to prod

1. Get prod CA chain + client cert CN from Tony (fresh case or continuation of #1058382).
2. Upload new CA to `/certs/prod-chain.pem`; keep the demo chain on the volume for regression tests.
3. `fly secrets set CA_PATH=/certs/prod-chain.pem ALLOWED_CNS="<prod cn>,hd.d5ddb385-...-test.medical-objects.com.au"` (leave test CN in the allowlist during cut-over week).
4. Provision a real cert for whatever hostname MO connects to (`hl7.tere.co.nz` is the obvious pick — bind it via `fly certs create hl7.tere.co.nz` for DNS validation + upload the cert bundle to the volume).
5. Remove test CN from `ALLOWED_CNS` once prod is stable.
