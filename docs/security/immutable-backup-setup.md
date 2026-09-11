# Immutable Supabase backup — setup runbook

**Purpose:** anti-ransomware backup. Even if the Tere Supabase project and the primary Tere AWS account are both compromised, an attacker cannot delete or shorten the retention on these dumps. When the fire happens, we restore and refuse to pay.

**Architecture:** Nightly GitHub Actions cron runs `pg_dump` against Supabase, uploads the gzipped dump to an S3 bucket in a *separate* AWS account, with **Object Lock in Compliance mode, 7-year retention**. Object Lock in Compliance mode is unbreakable — even the AWS root account cannot shorten or delete a locked object until retention expires.

**Related files:**
- Workflow: `.github/workflows/supabase-immutable-backup.yml`
- Task: #508

---

## Step 1 — Create a separate AWS account for backups

**Why separate:** blast radius. If the primary Tere AWS account is compromised (root, or a full-admin IAM user), an attacker can pivot to KMS, S3, everything. A second account with its own root, its own MFA, and no cross-account roles into it is a clean firewall.

1. Sign into the primary Tere AWS account as root.
2. **AWS Organizations → Add an AWS account → Create AWS account**
   - Account name: `tere-backup-vault`
   - Email address: use a dedicated alias, e.g. `aws-backup@terehealth.co.nz` (must be an inbox you actually receive — this is the root email for the account).
   - IAM role name (default): `OrganizationAccountAccessRole` — leave as-is.
3. Wait ~2 minutes for provisioning. You'll receive a welcome email at the alias.
4. Complete root MFA setup on the new account:
   - Log out of primary. Log in via the alias → "Forgot password" flow to set a strong root password (25+ chars, password-manager generated).
   - **Enable hardware MFA (YubiKey) as the root MFA device.** No SMS. No app-based TOTP if you can help it — this is the highest-value target you own.
   - Delete the root access keys if any were auto-generated (there shouldn't be, but check).
5. Store the root credentials in your password vault. This account should be logged into ~4× per year (audits, quarterly restore drills).

## Step 2 — Create the Object-Lock bucket

**Critical:** Object Lock **must be enabled at bucket creation**. It cannot be turned on later.

In the new `tere-backup-vault` account:

1. Create an IAM admin user for setup work (don't use root):
   - IAM → Users → Create user → `admin-setup` → attach `AdministratorAccess`.
   - Enable YubiKey MFA immediately.
2. Sign in as `admin-setup`.
3. **S3 → Create bucket:**
   - Name: `tere-supabase-backup-<random-suffix>` (bucket names global; suffix so it's not guessable).
   - Region: **ap-southeast-2** (Sydney — same region as production for lower egress cost when restoring).
   - Object Ownership: ACLs disabled.
   - Block Public Access: **all four checkboxes ticked** (this is the default; confirm).
   - Bucket Versioning: **Enable** (required for Object Lock).
   - **Advanced settings → Object Lock: Enable.** ← this is the irreversible switch.
   - Default encryption: SSE-S3 (AES-256) — the workflow uploads with `--server-side-encryption AES256` explicitly, this is belt-and-braces.
   - Click **Create bucket**.
4. **Set default Object Lock retention** (S3 → bucket → Properties → Object Lock):
   - Default retention: **Enable**
   - Mode: **Compliance**
   - Retention period: **2555 days** (7 years)
   - This is a safety net: even if the workflow forgets to set retention, uploads still get locked.

## Step 3 — Add lifecycle rules for tiered storage

Reduces cost by transitioning old dumps to cheaper storage classes. Object Lock persists through every transition.

S3 → bucket → **Management → Lifecycle rules → Create lifecycle rule**:

- Rule name: `tier-old-dumps`
- Scope: apply to all objects
- Actions:
  - Transition current versions to **Glacier Instant Retrieval** after **30 days**
  - Transition current versions to **Glacier Deep Archive** after **90 days**
  - Do NOT enable "expire current versions" — Object Lock prevents deletion anyway; expiration would just fail silently.

## Step 4 — Create the write-only IAM user

GitHub Actions needs credentials to upload. Least-privilege: **PutObject-only, no read, no delete.**

1. IAM → Users → **Create user** → `github-actions-backup-writer`
2. Do NOT give it console access.
3. Skip the "add to group" step. Instead, attach an inline policy:

```json
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
      "Resource": "arn:aws:s3:::tere-supabase-backup-<your-suffix>/supabase/*"
    },
    {
      "Sid": "VerifyOwnUploads",
      "Effect": "Allow",
      "Action": [
        "s3:GetObjectRetention",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::tere-supabase-backup-<your-suffix>/supabase/*"
    }
  ]
}
```

Note the intentional absences: no `s3:DeleteObject`, no `s3:PutBucketPolicy`, no `s3:PutObjectLockConfiguration`. Even if this key leaks, an attacker can only *add* new objects — never delete or shorten retention on existing ones.

4. Create an access key for programmatic access → download the CSV.

## Step 5 — Get the Supabase direct DB URL

pg_dump needs a direct connection, not the pooler.

1. Supabase Dashboard → Project Settings → **Database** → Connection string
2. Select **URI** tab, **Session mode** (NOT Transaction mode — pg_dump does long-running work).
3. The URL looks like: `postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres`

⚠️ **Preferred:** create a dedicated read-only role for backups so a leaked key can't rewrite the DB:

```sql
-- Run in Supabase SQL Editor as postgres
CREATE ROLE backup_reader WITH LOGIN PASSWORD '<generate-strong-password>';
GRANT pg_read_all_data TO backup_reader;
GRANT USAGE ON SCHEMA public TO backup_reader;
```

Then the URL becomes:
`postgresql://backup_reader:<password>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres`

## Step 6 — Add GitHub Actions secrets

GitHub → tere-app repo → **Settings → Secrets and variables → Actions → New repository secret**. Add all four:

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | The `postgresql://backup_reader:...` URL from step 5 |
| `BACKUP_AWS_ACCESS_KEY_ID` | Access key ID from step 4 |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | Secret access key from step 4 |
| `BACKUP_S3_BUCKET` | e.g. `tere-supabase-backup-a7f3c2` |

## Step 7 — First run

1. GitHub → tere-app → Actions tab → **"Supabase immutable backup"** in the sidebar → **Run workflow → Run workflow** (uses `main` branch).
2. Watch the run. Expected steps: install PG17 client → pg_dump (~1-5 min depending on DB size) → upload → verify retention.
3. Confirm the S3 bucket has the object at `supabase/YYYY/MM/DD/dump-*.pgc.gz`.
4. Confirm the object shows **Retention until: [date 7 years from now]** in S3 Console → Object properties.

## Step 8 — Prove restore works

The backup is worthless if we can't restore. Do this within a week of first run, and quarterly thereafter.

```bash
# On any Linux/macOS with docker + AWS CLI configured for the backup account:
aws s3 cp s3://<bucket>/supabase/YYYY/MM/DD/dump-*.pgc.gz ./test-restore.pgc.gz
gunzip test-restore.pgc.gz

# Spin up a scratch Postgres 17:
docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=x -p 15432:5432 postgres:17

# Restore:
pg_restore --dbname='postgres://postgres:x@localhost:15432/postgres' \
  --no-owner --no-privileges --verbose test-restore.pgc

# Smoke check:
psql 'postgres://postgres:x@localhost:15432/postgres' -c '
  SELECT COUNT(*) AS providers FROM providers;
  SELECT COUNT(*) AS consultations FROM consultations;
  SELECT COUNT(*) AS patients FROM patients;
'

docker rm -f pg-restore-test
```

Row counts should be within 24h of production. If they diverge wildly, the dump is broken — fix before relying on it.

## Cost estimate

For a 1 GB compressed dump growing linearly:
- Days 0-30 (Standard-IA): 30 × 1GB × $0.0125/GB/mo → **~$0.40/mo**
- Days 30-90 (Glacier Instant): 60 × 1GB × $0.004/GB/mo → **~$0.24/mo**
- Days 90-2555 (Glacier Deep): 2465 × 1GB × $0.00099/GB/mo → **~$2.44/mo**
- **Total steady-state:** ~$3-4/month once fully warmed up (after year 1). Well under a coffee.

## Restore-drill schedule

- **Q1 each year:** full restore drill (step 8) — verify most recent dump restores cleanly.
- **Q3 each year:** old-dump drill — pull a random 6-month-old dump and restore it, catches lifecycle-transition problems early.

---

## What to do when it happens

If ransomware / data destruction hits production:

1. **Do not panic. Do not pay.** You have 7 years of untamperable backups.
2. Contact CERT NZ (0800 CERT NZ / cert.govt.nz) — report the incident.
3. Isolate production: rotate all Vercel/Supabase creds, revoke IAM keys, force logout all providers.
4. Spin up a fresh Supabase project.
5. Pull the most recent clean dump from the backup bucket (verify against known-good row counts if any pre-attack were captured).
6. Restore into the fresh project. Update Vercel env vars to point at it.
7. Deploy from a known-good git SHA (verify against GitHub — the repo is untouched by DB compromise).
8. Notify affected patients per the Privacy Act 2020 breach notification runbook (`docs/incident-response-plan.md`).

RTO target: <8 hours from decision to restore start → back online.
