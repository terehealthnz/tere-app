#!/usr/bin/env bash
# Copies src/contracts/*.json → api/_contracts/*.json so the server-side
# PDF renderer (api/_contract-pdf-render.js) can guarantee bundling
# under Vercel. Client (ContractRenderer.jsx) still imports from
# src/contracts/ — this script keeps the two locations aligned.
#
# Run after editing any src/contracts/*.json before committing.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "syncing src/contracts/ → api/_contracts/"
mkdir -p api/_contracts
cp src/contracts/*.json api/_contracts/

echo "diff (should be empty):"
diff -q src/contracts/ api/_contracts/ | grep -v "^Common subdirectories" || echo "  ✓ in sync"
