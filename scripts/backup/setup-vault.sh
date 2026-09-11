#!/usr/bin/env bash
# Sets up the immutable Supabase backup infrastructure in the
# tere-backup-vault AWS account:
#
#   - S3 bucket with Object Lock enabled at creation (irreversible)
#   - Default Object Lock retention: 7 years, Compliance mode
#   - Public-access blocked, SSE-S3 encryption
#   - Lifecycle: Standard-IA → Glacier IR (30d) → Deep Archive (90d)
#   - IAM writer user with PutObject-only permissions
#   - Access key generated for GitHub Actions
#
# Runs against the `tere-backup-vault` AWS CLI profile.
# Idempotent-ish: existing IAM user is detected and skipped.
# Bucket name gets a random 6-char suffix so re-runs create a fresh one.

set -euo pipefail

PROFILE="tere-backup-vault"
REGION="ap-southeast-2"
EXPECTED_ACCOUNT="992868470289"
BUCKET_PREFIX="tere-supabase-backup"
WRITER_USER="github-actions-backup-writer"
RETAIN_DAYS=2555   # 7 years

# ── 1. Verify identity ───────────────────────────────────────────────────
echo "→ Verifying AWS identity"
CALLER=$(aws sts get-caller-identity --profile "$PROFILE" --output text --query Account)
if [ "$CALLER" != "$EXPECTED_ACCOUNT" ]; then
  echo "ERROR: expected account $EXPECTED_ACCOUNT, got $CALLER"
  echo "Are you sure the CLI profile points at tere-backup-vault?"
  exit 1
fi
echo "  in account $CALLER ✓"

# ── 2. Create bucket with Object Lock at creation ────────────────────────
BUCKET_SUFFIX=$(openssl rand -hex 3)
BUCKET="${BUCKET_PREFIX}-${BUCKET_SUFFIX}"
echo "→ Creating bucket $BUCKET in $REGION"
aws s3api create-bucket \
  --profile "$PROFILE" \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration "LocationConstraint=$REGION" \
  --object-lock-enabled-for-bucket >/dev/null
echo "  ✓"

# ── 3. Block public access ───────────────────────────────────────────────
echo "→ Blocking public access"
aws s3api put-public-access-block \
  --profile "$PROFILE" \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
echo "  ✓"

# ── 4. Default encryption (SSE-S3) ───────────────────────────────────────
echo "→ Setting default encryption (SSE-S3, AES-256)"
aws s3api put-bucket-encryption \
  --profile "$PROFILE" \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
echo "  ✓"

# ── 5. Default Object Lock retention (Compliance, 7y) ────────────────────
# Every uploaded object automatically gets this retention unless it specifies
# its own longer one. The workflow specifies its own to be explicit; this is
# the belt-and-braces default.
echo "→ Setting default Object Lock retention: Compliance, ${RETAIN_DAYS} days (7 years)"
aws s3api put-object-lock-configuration \
  --profile "$PROFILE" \
  --bucket "$BUCKET" \
  --object-lock-configuration \
    "{\"ObjectLockEnabled\":\"Enabled\",\"Rule\":{\"DefaultRetention\":{\"Mode\":\"COMPLIANCE\",\"Days\":${RETAIN_DAYS}}}}"
echo "  ✓"

# ── 6. Lifecycle: tiered storage ─────────────────────────────────────────
# Object Lock retention persists through storage class transitions.
echo "→ Setting lifecycle rules (Standard-IA at upload → Glacier IR @ 30d → Deep Archive @ 90d)"
aws s3api put-bucket-lifecycle-configuration \
  --profile "$PROFILE" \
  --bucket "$BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "tier-old-dumps",
        "Status": "Enabled",
        "Filter": {"Prefix": "supabase/"},
        "Transitions": [
          {"Days": 30,  "StorageClass": "GLACIER_IR"},
          {"Days": 120, "StorageClass": "DEEP_ARCHIVE"}
        ]
      }
    ]
  }'
echo "  ✓"

# ── 7. Create IAM writer user ────────────────────────────────────────────
echo "→ Creating IAM user $WRITER_USER"
if aws iam get-user --profile "$PROFILE" --user-name "$WRITER_USER" >/dev/null 2>&1; then
  echo "  user already exists, skipping create"
else
  aws iam create-user --profile "$PROFILE" --user-name "$WRITER_USER" >/dev/null
  echo "  ✓"
fi

# ── 8. Least-privilege inline policy ─────────────────────────────────────
# Intentional absences: no DeleteObject, no PutBucketPolicy, no
# PutObjectLockConfiguration. Even if these keys leak, an attacker can
# only add new objects — never delete or shorten retention on existing.
echo "→ Attaching inline policy: PutObject + PutObjectRetention only, scoped to supabase/*"
POLICY_JSON=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PutBackupsOnly",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectRetention"
      ],
      "Resource": "arn:aws:s3:::${BUCKET}/supabase/*"
    },
    {
      "Sid": "VerifyOwnUploads",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectRetention"
      ],
      "Resource": "arn:aws:s3:::${BUCKET}/supabase/*"
    }
  ]
}
EOF
)
aws iam put-user-policy \
  --profile "$PROFILE" \
  --user-name "$WRITER_USER" \
  --policy-name "s3-immutable-backup-writer" \
  --policy-document "$POLICY_JSON"
echo "  ✓"

# ── 9. Generate access key for GHA ───────────────────────────────────────
echo "→ Generating access key for $WRITER_USER"
KEY_JSON=$(aws iam create-access-key --profile "$PROFILE" --user-name "$WRITER_USER" --output json)
ACCESS_KEY_ID=$(echo "$KEY_JSON" | awk -F'"' '/"AccessKeyId"/ {print $4}')
SECRET_KEY=$(echo "$KEY_JSON"    | awk -F'"' '/"SecretAccessKey"/ {print $4}')

# ── 10. Summary ──────────────────────────────────────────────────────────
cat <<EOF

═══════════════════════════════════════════════════════════════════════
                    SETUP COMPLETE
═══════════════════════════════════════════════════════════════════════

Add these to GitHub → tere-app → Settings → Secrets and variables →
Actions → New repository secret:

  BACKUP_S3_BUCKET             = ${BUCKET}
  BACKUP_AWS_ACCESS_KEY_ID     = ${ACCESS_KEY_ID}
  BACKUP_AWS_SECRET_ACCESS_KEY = ${SECRET_KEY}

Also needed (create separately per runbook step 5):
  SUPABASE_DB_URL              = postgresql://backup_reader:...
                                 (create backup_reader role in Supabase SQL editor:
                                    CREATE ROLE backup_reader WITH LOGIN PASSWORD '...';
                                    GRANT pg_read_all_data TO backup_reader;
                                    GRANT USAGE ON SCHEMA public TO backup_reader;)

═══════════════════════════════════════════════════════════════════════
IMPORTANT: The SecretAccessKey above is shown ONCE. Copy it into the
GitHub secret NOW. AWS will not show it again.
═══════════════════════════════════════════════════════════════════════

Next steps:
  1. Add all 4 GitHub secrets above.
  2. GitHub → tere-app → Actions → "Supabase immutable backup" →
     "Run workflow" → verify it succeeds.
  3. Check the bucket for a fresh dump with 7-year retention lock:
       aws s3 ls s3://${BUCKET}/supabase/ --recursive --profile ${PROFILE}
  4. Run the restore-drill (docs/security/immutable-backup-setup.md step 8)
     within a week to prove the pipeline actually restores.

EOF
