# Change Management Policy

**Version:** v1.0 · **Date:** 3 September 2026 · **Owner:** Patrick Herling
**Aligned to:** ISO 27001:2022 A.12.1, A.8.32; HISO 10029:2022 Domain 10.

How production changes get proposed, reviewed, deployed, monitored, and (if necessary) rolled back at Tere Health.

---

## 1. Scope

Any change to:
- Application code (frontend, backend, cron jobs)
- Database schema (migrations)
- Infrastructure config (Vercel env, Cloudflare rules, Supabase settings, DNS)
- Third-party integrations (endpoints, credentials, sub-processors)
- Clinical decision-support (AI models, prompts, thresholds)
- Consent language or patient-facing copy

## 2. Change categories

### 2.1 Standard changes
- Pre-approved, low risk, well-understood.
- Examples: content updates on marketing page, adding a new provider account, updating a non-load-bearing UI label.
- **Process**: PR + self-merge + auto-deploy.

### 2.2 Normal changes
- Most feature work + bug fixes.
- **Process**: PR → review by Patrick (or Rachel for clinical logic) → merge → auto-deploy → smoke test.

### 2.3 Major changes
- Anything that touches PHI schema, encryption, auth, billing, or clinical decision support.
- Anything scoped for > 500 lines of diff.
- Anything requiring a migration on prod data.
- **Process**: Design note in an issue → PR → review → migration dry-run → maintenance-window announcement (if breaking) → deploy → post-deploy smoke → rollback plan documented BEFORE deploy.

### 2.4 Emergency changes
- Production incident requiring immediate fix.
- **Process**: Fix + minimal-viable review + deploy → post-incident retrospective within 48 hours.

## 3. Standard flow (normal + major changes)

### 3.1 Propose
- Open a task in the task tracker (or Notion doc, or memory).
- Describe: WHAT + WHY + risk assessment + rollback plan.

### 3.2 Implement
- Feature branch, atomic commits, descriptive commit messages.
- No secrets in commits.
- Migrations use `IF NOT EXISTS` guards, are idempotent, tested locally.

### 3.3 Review
- **Code review**: Patrick reviews all code (Rachel for clinical-logic changes).
- **Migration review**: SQL walked line-by-line, tested against a scratch DB.
- **Security review**: pen-test-style thinking for any change touching auth or PHI.

### 3.4 Deploy
- Merge to `main` triggers Vercel auto-deploy.
- Migration applied via Supabase SQL editor (manual, admin-verified).
- Env vars set in Vercel dashboard (never in code).
- Cache warmup on critical paths.

### 3.5 Smoke test
- Patient triage flow end-to-end
- Provider queue + open a chart
- Admin surfaces load without error
- New feature works
- Watch security_events + Sentry for 30 min post-deploy

### 3.6 Announce
- Notes in commit + PR description
- Slack/team channel (once we have >2 staff)
- Patient-visible changes announced via patient portal or email

## 4. Rollback

- Every major change has a documented rollback plan BEFORE deploy.
- Rollback options:
  - **Code**: revert commit + redeploy
  - **Schema**: schema is additive by convention (add col, don't drop); rollback = ignore the col + revert code that reads/writes it. Actual DROP requires downtime.
  - **Env vars**: revert Vercel setting + redeploy
  - **Data**: Supabase PITR to timestamp before the change

## 5. Emergency changes

- Announce the incident before/during deploy.
- Minimum viable review: another person (Rachel or a trusted colleague) eyeballs the change even if just for 5 min.
- Deploy.
- Watch closely.
- Post-incident review within 48 hours — was it truly emergency? Could we have caught it in normal flow?

## 6. Migration discipline

- Every migration in `supabase/YYYY-MM-DD_short_name.sql`.
- Applied to Supabase manually by Patrick (never auto-applied).
- Commit message references the migration file.
- Add `IF NOT EXISTS` / `IF EXISTS` guards so re-runs are safe.
- Dual-write for schema evolutions that change existing columns (see pgcrypto pattern, task #381).

## 7. Config change discipline

- **Vercel env vars** — treated as code. Change → redeploy → verify.
- **Cloudflare rules** — captured in commit note; Cloudflare UI history retained.
- **Supabase policies** — RLS + policy changes go via migration; never edited in the UI without a matching migration.

## 8. Records

- Every deploy logged in Vercel + git history.
- Every migration in `supabase/` + version-controlled.
- Every emergency change captured in an incident doc (`docs/incidents/YYYY-MM-DD.md`).

## 9. Governance

- Reviewed annually.
- Amended after any incident where change management contributed.

## Change log

- 2026-09-03 — v1.0 initial policy. Formalises current practice.
