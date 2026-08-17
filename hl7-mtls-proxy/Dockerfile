FROM node:20-alpine

# acme.sh prerequisites: bash (acme.sh is a bash script), curl (HTTP), openssl
# (cert inspection), busybox-suid (crond).
RUN apk add --no-cache bash curl openssl busybox-suid

# Install acme.sh into the image. Runs as root; state (account key, issued
# certs) will live under /root/.acme.sh but we point --home at /certs at
# runtime so it persists across container restarts on the Fly volume.
RUN curl -sSL https://get.acme.sh | sh -s email=terehealthnz@gmail.com

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js entrypoint.sh demo-client-chain-g3.pem ./
RUN chmod +x entrypoint.sh

EXPOSE 8443
CMD ["./entrypoint.sh"]
