#!/usr/bin/env bash
# scripts/copy-vercel-env-to-au.sh
#
# One-shot: copies Production env vars from tere-app (NZ) to the newly-created
# tere-app-au Vercel project, swapping the 3 Supabase vars to point at the AU
# Supabase project (jkpyxyfqbscdeyxfpxnq in ap-southeast-2).
#
# ── Prereqs ───────────────────────────────────────────────────────────────
#
# 1. Create the tere-app-au Vercel project via the dashboard (import same repo)
#    Don't add env vars there yet — this script does that.
#
# 2. Create .env.au-secrets in this repo root (gitignored) containing:
#      AU_ANON_KEY="<paste from Supabase dashboard: AU project → Settings → API → anon public>"
#      AU_SERVICE_ROLE_KEY="<paste from Supabase dashboard: AU project → Settings → API → service_role secret>"
#
# 3. Have this repo linked to the NZ project first (default state usually).
#    Confirm by running: npx vercel project ls
#
# ── Run ───────────────────────────────────────────────────────────────────
#
#   bash scripts/copy-vercel-env-to-au.sh
#
# The script will:
#   a. Pull NZ Production env vars into .env.nz-copy
#   b. Pause + ask you to `npx vercel link` and pick tere-app-au
#   c. Loop through the pulled envs and add each to tere-app-au, with the
#      Supabase URL/anon/service_role swapped to AU values.
#
# Skipped automatically: VERCEL_* (Vercel auto-populates), *_AU suffixed
# vars (redundant on AU project), [SENSITIVE] placeholders (unpullable).

set -euo pipefail

# ── AU config ───────────────────────────────────────────────────────────
AU_SUPABASE_URL="https://jkpyxyfqbscdeyxfpxnq.supabase.co"

# ── Prereq checks ───────────────────────────────────────────────────────
if [ ! -f .env.au-secrets ]; then
  cat >&2 <<'EOF'
❌ Missing .env.au-secrets

Create it in the repo root with these two lines (paste values from Supabase
dashboard → AU project (jkpyxyfqbscdeyxfpxnq) → Settings → API):

  AU_ANON_KEY="ey..."
  AU_SERVICE_ROLE_KEY="ey..."

Then re-run this script. The file is gitignored — never commit it.
EOF
  exit 1
fi
# shellcheck disable=SC1091
source .env.au-secrets
if [ -z "${AU_ANON_KEY:-}" ] || [ -z "${AU_SERVICE_ROLE_KEY:-}" ]; then
  echo "❌ AU_ANON_KEY and AU_SERVICE_ROLE_KEY must be set in .env.au-secrets" >&2
  exit 1
fi

# ── Step 1: pull NZ envs ────────────────────────────────────────────────
echo "==> Step 1/3: pulling NZ env vars (assumes vercel is linked to tere-app)"
if ! npx vercel env pull .env.nz-copy --environment=production --yes >/dev/null 2>&1; then
  echo "❌ vercel env pull failed. Make sure you're in a repo linked to tere-app (NZ)." >&2
  echo "   Fix: rm -rf .vercel && npx vercel link  (pick tere-app)" >&2
  exit 1
fi
echo "    ✔ pulled to .env.nz-copy"

# ── Step 2: switch project link ─────────────────────────────────────────
cat <<'EOF'

==> Step 2/3: switch Vercel link to the tere-app-au project

    Run in a second terminal (or accept the prompt below):
      rm -rf .vercel
      npx vercel link

    When prompted, pick the tere-app-au project. Then press Enter here to
    continue.
EOF
read -r -p "Press Enter once you've linked to tere-app-au..."

# Verify link now points at tere-app-au
if ! grep -q '"projectName": *"tere-app-au"' .vercel/project.json 2>/dev/null; then
  # Fall back to check project name via vercel CLI
  CURRENT_PROJECT=$(npx vercel project ls --scope "$(cat .vercel/project.json 2>/dev/null | grep orgId | cut -d\" -f4)" 2>/dev/null || echo "")
  echo "⚠️  Warning: could not verify .vercel/project.json points at tere-app-au."
  echo "   Continuing anyway — abort with Ctrl+C if you're not sure."
  read -r -p "Press Enter to continue or Ctrl+C to abort..."
fi

# ── Step 3: push each var to AU ────────────────────────────────────────
echo ""
echo "==> Step 3/3: adding env vars to tere-app-au"
echo ""

ADDED=0
SKIPPED_MANAGED=0
SKIPPED_AU_SUFFIX=0
SKIPPED_SENSITIVE=0
SWAPPED=0

while IFS= read -r LINE; do
  # Only lines matching KEY=VALUE
  [[ "$LINE" =~ ^[A-Z][A-Z0-9_]*= ]] || continue
  KEY="${LINE%%=*}"
  VALUE="${LINE#*=}"
  # Strip surrounding quotes
  VALUE="${VALUE%\"}"
  VALUE="${VALUE#\"}"

  # Skip Vercel-injected vars (auto-populated per project)
  if [[ "$KEY" =~ ^(VERCEL_|NX_|TURBO_) ]]; then
    echo "  skip (vercel-managed):  $KEY"
    SKIPPED_MANAGED=$((SKIPPED_MANAGED+1))
    continue
  fi

  # Skip _AU suffixed vars — AU project uses base names, doesn't need copies
  if [[ "$KEY" == *_AU ]]; then
    echo "  skip (au-suffix):       $KEY"
    SKIPPED_AU_SUFFIX=$((SKIPPED_AU_SUFFIX+1))
    continue
  fi

  # Skip [SENSITIVE] placeholders — Vercel didn't give us the real value
  if [ "$VALUE" = "[SENSITIVE]" ]; then
    echo "  skip (sensitive):       $KEY  (add manually via dashboard)"
    SKIPPED_SENSITIVE=$((SKIPPED_SENSITIVE+1))
    continue
  fi

  # Swap Supabase vars → AU values
  case "$KEY" in
    VITE_SUPABASE_URL)
      VALUE="$AU_SUPABASE_URL"; SWAPPED=$((SWAPPED+1))
      echo "  swap (au):              $KEY"
      ;;
    VITE_SUPABASE_ANON_KEY)
      VALUE="$AU_ANON_KEY"; SWAPPED=$((SWAPPED+1))
      echo "  swap (au):              $KEY"
      ;;
    SUPABASE_SERVICE_ROLE_KEY)
      VALUE="$AU_SERVICE_ROLE_KEY"; SWAPPED=$((SWAPPED+1))
      echo "  swap (au):              $KEY  (sensitive)"
      ;;
    *)
      echo "  add:                    $KEY"
      ;;
  esac

  # Push. --sensitive for service role + anything with 'SECRET' in the name.
  SENSITIVE_FLAG=""
  if [[ "$KEY" == SUPABASE_SERVICE_ROLE_KEY ]] || [[ "$KEY" == *SECRET* ]] || [[ "$KEY" == *_KEY ]] && [[ "$KEY" != VITE_* ]]; then
    SENSITIVE_FLAG="--sensitive"
  fi

  printf '%s' "$VALUE" | npx vercel env add "$KEY" production $SENSITIVE_FLAG --force >/dev/null 2>&1 && \
    ADDED=$((ADDED+1)) || echo "    ⚠️  failed to add $KEY (continuing)"
done < .env.nz-copy

echo ""
echo "==> Done"
echo "    added:              $ADDED"
echo "    swapped (au):       $SWAPPED"
echo "    skipped (vercel):   $SKIPPED_MANAGED"
echo "    skipped (au-suffix):$SKIPPED_AU_SUFFIX"
echo "    skipped (sensitive):$SKIPPED_SENSITIVE  (add these manually in dashboard)"
echo ""
echo "Next steps:"
echo "  1. Check the AU project's env vars: Vercel dashboard → tere-app-au → Settings → Environment Variables"
echo "  2. If SKIPPED_SENSITIVE > 0, add those manually — they're server-only secrets that Vercel"
echo "     won't reveal via env pull. Look at the NZ project dashboard for values."
echo "  3. Trigger a fresh AU deploy: npx vercel --prod"
echo "  4. Move tere.co.nz domain: NZ project remove → AU project add"
echo ""
echo "Cleanup: rm -f .env.nz-copy .env.au-secrets  (both are gitignored, but tidy is good)"
