# HL7 mTLS termination proxy (Fly.io)

Small Node.js service that terminates mTLS from Medical-Objects Capricorn
Cloud and forwards the raw HL7 v2 body to Vercel's `/api/hl7-inbound`.

Vercel serverless functions do not do mTLS on Hobby/Pro tiers. This proxy
lives on Fly.io (~$5/month), validates the Capricorn client cert against
Medical-Objects' intermediate CA, then POSTs the raw body to Vercel with a
shared secret header (`X-Tere-Bridge-Secret`). The HL7 acknowledgement from
Vercel is returned to Capricorn unchanged.

## Quick start

```
brew install flyctl
cd hl7-mtls-proxy
fly launch --name tere-hl7-mtls --region syd --no-deploy
fly volumes create hl7certs --region syd --size 1
fly secrets set \
  HL7_BRIDGE_SECRET="$(openssl rand -hex 32)" \
  UPSTREAM_URL="https://terehealth.co.nz/api/hl7-inbound" \
  ALLOWED_CN="MedicalObjectsCapricorn"
fly deploy
```

Copy `HL7_BRIDGE_SECRET` and paste into Vercel env as `HL7_BRIDGE_SECRET`
so both ends agree.

Ask Medical-Objects (Tony Cruice, case #1058382) for:
- The client certificate they will present when POSTing to us (or their
  intermediate CA so we can accept any cert issued by it).
- Their upstream IP allowlist if we want to double-lock at the Fly.io firewall.

Store the intermediate CA at `/certs/medobjects-intermediate.pem` on the
Fly.io volume, then set `CA_PATH=/certs/medobjects-intermediate.pem` in
`fly secrets set`.

## Testing

Once deployed and Medical-Objects has issued the client cert:

```
fly ssh console -C 'openssl s_client -connect tere-hl7-mtls.fly.dev:443 -cert client.pem -key client.key'
```

Then run their Postman collection (`CustomerHL7InboundIntegration NZ.postman_collection.json`)
pointed at `https://tere-hl7-mtls.fly.dev/hl7/`.
