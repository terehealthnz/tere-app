#!/bin/sh
# Container entrypoint — bootstraps LE cert via Cloudflare DNS-01 if missing,
# schedules renewal via cron, then execs the Node HTTPS proxy.
#
# State (acme.sh account key, issued certs) lives on the /certs volume so it
# survives container restarts and Fly machine hops.
set -e

DOMAIN="${DOMAIN:-hl7.terehealth.co.nz}"
CERT_PATH="/certs/server.pem"
KEY_PATH="/certs/server.key"
ACME_HOME="/certs/.acme.sh"

# acme.sh's Cloudflare provider looks for CF_Token. Map from Fly secret name.
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
  export CF_Token="$CLOUDFLARE_API_TOKEN"
fi

# Persist acme.sh state on the volume so the account key survives restarts.
mkdir -p "$ACME_HOME"

ACME="/root/.acme.sh/acme.sh --home $ACME_HOME"

# One-shot account registration with Let's Encrypt (idempotent — no-op after
# first run). Suppress "already registered" noise on restarts.
$ACME --register-account -m terehealthnz@gmail.com --server letsencrypt 2>/dev/null || true

# Copy bundled test-network CA chain to the volume on first boot so it's
# co-located with server.pem/key. Production will overwrite with the prod CA.
if [ ! -f /certs/demo-client-chain-g3.pem ] && [ -f /app/demo-client-chain-g3.pem ]; then
  cp /app/demo-client-chain-g3.pem /certs/demo-client-chain-g3.pem
fi

# Issue the first cert if we don't already have one on disk.
if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
  echo "[entrypoint] No cert on volume — issuing via Cloudflare DNS-01…"
  $ACME --issue --dns dns_cf -d "$DOMAIN" --keylength ec-256 --server letsencrypt
  $ACME --install-cert -d "$DOMAIN" --ecc \
    --fullchain-file "$CERT_PATH" \
    --key-file "$KEY_PATH" \
    --reloadcmd "kill 1"
  echo "[entrypoint] Initial cert installed at $CERT_PATH"
fi

# Force renewal on boot if <30 days from expiry (Fly restarts are rare; belt
# and braces on top of the daily cron below).
if ! openssl x509 -in "$CERT_PATH" -noout -checkend $((30 * 86400)); then
  echo "[entrypoint] Cert <30 days from expiry — renewing…"
  $ACME --renew -d "$DOMAIN" --ecc --force || echo "[entrypoint] Renewal failed; will retry via cron"
fi

# Daily renewal check at 03:00 UTC. acme.sh --cron only actually renews if
# cert is within 30 days of expiry. --reloadcmd (kill 1) triggers container
# restart so Node re-reads the new cert on next boot.
mkdir -p /etc/crontabs
echo "0 3 * * * /root/.acme.sh/acme.sh --cron --home $ACME_HOME > /var/log/acme-cron.log 2>&1" > /etc/crontabs/root
crond -b -L /var/log/crond.log

echo "[entrypoint] Starting Node HTTPS proxy…"
exec node index.js
