# Deploy runbook — HL7 mTLS test endpoint (`hl7-test.terehealth.co.nz`)

Response to MO helpdesk case #1058382 (Tony Cruice, 2026-08-17). Sets up a
fully-separate second mTLS receiver so test messages have their own DNS +
TLS identity and are physically prevented from touching prod message flows.

**Naming:** `<country>-<prod|test>` — reserves room for AU/US expansion
without another rename.

| App | Domain | TERE_ENV | Fly config |
|---|---|---|---|
| tere-hl7-mtls (existing) | hl7.terehealth.co.nz | `nz-prod` | `fly.toml` |
| tere-hl7-mtls-test (new) | hl7-test.terehealth.co.nz | `nz-test` | `fly.test.toml` |

Both proxy to the same Vercel `/api/hl7-inbound` endpoint. Every message is
tagged with `env` on `inbound_hl7_messages` — future auto-file logic must
filter to `env LIKE '%-prod'` before touching real patient records.

## Step 1 — Run the SQL migration (Supabase)

Run `supabase/2026-08-17_inbound_hl7_env.sql`. Adds the `env` column with
default `nz-prod` and backfills existing rows.

## Step 2 — Add the DNS record (Cloudflare)

Cloudflare dashboard → terehealth.co.nz → DNS → Add record:

- **Type:** A + AAAA (or CNAME to `tere-hl7-mtls-test.fly.dev` — either works)
- **Name:** `hl7-test`
- **IPs:** the Fly app's IPs (see step 4 output — `fly ips list -a tere-hl7-mtls-test`)
- **Proxy status:** DNS only (grey cloud) — Cloudflare's orange cloud breaks mTLS passthrough.

## Step 3 — Redeploy the prod app to pick up TERE_ENV=nz-prod

From `hl7-mtls-proxy/`:

```
fly deploy
```

No downtime — the machine restarts in place and picks up the new env var
+ the X-Tere-Env forwarding.

## Step 4 — Create and deploy the test app

From `hl7-mtls-proxy/`:

```
# One-time app creation
fly apps create tere-hl7-mtls-test --org <your-org>
fly volumes create hl7certs_test --size 1 --region syd -a tere-hl7-mtls-test

# Copy the secrets from prod (same bridge secret + Cloudflare token + allow-listed CNs)
fly secrets set -a tere-hl7-mtls-test \
  HL7_BRIDGE_SECRET="$(fly secrets list -a tere-hl7-mtls -j | jq -r '.[] | select(.Name=="HL7_BRIDGE_SECRET") | .Digest')" \
  CLOUDFLARE_API_TOKEN="<paste from Cloudflare - scoped: Zone → DNS → Edit>" \
  ALLOWED_CNS="hd.d5ddb385-8b7c-460f-a887-0dcaddf48b0e-guid.id.test.medical-objects.com.au"

# Deploy
fly deploy -c fly.test.toml
```

Note: HL7_BRIDGE_SECRET can't actually be exported from Fly — copy the
value you originally set (or roll a new secret; both apps just need to
share the same value for Vercel to accept forwards from either).

Provision an anycast IP:

```
fly ips allocate-v4 -a tere-hl7-mtls-test
fly ips allocate-v6 -a tere-hl7-mtls-test
```

Update Cloudflare DNS with those IPs (or use a CNAME to
`tere-hl7-mtls-test.fly.dev` — simpler if the Fly app supports it).

## Step 5 — Watch the first boot

```
fly logs -a tere-hl7-mtls-test
```

Expected log lines:

```
[entrypoint] No cert on volume — issuing via Cloudflare DNS-01…
[entrypoint] Initial cert installed at /certs/server.pem
hl7-mtls-proxy [nz-test] listening on :8443 → https://terehealth.co.nz/api/hl7-inbound
```

If the LE issuance fails (usually because Cloudflare API token is missing
or lacks DNS Edit on the zone) — fix the secret, run `fly deploy -c
fly.test.toml` again.

## Step 6 — Smoke test from your laptop

Using your own MO test client (or curl with a client cert):

```
curl --cert client.pem --key client.key \
     --cacert /certs/demo-client-chain-g3.pem \
     -H 'Content-Type: application/hl7-v2' \
     --data-binary @sample.hl7 \
     https://hl7-test.terehealth.co.nz/hl7/
```

Should return an HL7 ACK. Then check Supabase:

```sql
SELECT id, env, msh_10_control_id, ack_msa_1
FROM inbound_hl7_messages
ORDER BY received_at DESC
LIMIT 3;
```

The new row's `env` column should read `nz-test`.

## Step 7 — Reply to Tony

Draft: `docs/outreach/2026-08-17-tony-mo-test-endpoint-live.md`.
Give him the new URL and confirm test/prod separation.
