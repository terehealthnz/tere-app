# Tere Health — Contractor Onboarding

**Document version:** 1.0
**Date:** 2026-07-08
**Audience:** Anyone contributing code, content, or clinical work to Tere Health under a contractor arrangement.
**Not for:** Full-time employees (separate employee handbook) or one-off external reviewers (no repository access required).

Welcome to Tere Health. This document covers what you need to know about how we handle code, credentials, and communication. Read it in full before you make your first commit.

**Note on why this exists:** Tere Health handles New Zealand patient health information under the Health Information Privacy Code 2020. Every contributor is part of the security perimeter around that information. This document is the operational contract between Tere and you on how that perimeter is maintained. Nothing here is theoretical — every rule reflects either a legal requirement or a mitigation of an incident we have documented in `docs/incidents/`.

---

## 1. Repository access

- The Tere codebase is at `github.com/terehealthnz/tere-app` — private repository.
- Access is granted individually via GitHub. You will be added as a collaborator on your specific role (e.g., "read" for reviewers, "write" for contributors, "maintain" for engineering leads).
- You do not fork the repo publicly. Work in feature branches within the private repo.
- On the end of your engagement, your access is removed the same working day. If you need to reference code you wrote after that point, ask before you leave — we can provide a targeted export.

---

## 2. Branching and pull requests

- Never commit directly to `main`. Always work in a feature branch (`feat/`, `fix/`, `docs/`, etc.).
- Open a pull request when your branch is ready for review.
- Every PR requires at least one approving review before merge. If you are the only technical contributor available, the compliance owner (Patrick Herling) reviews.
- Squash-merge is the default; the PR title becomes the commit message on `main`, so make it descriptive.
- If your work touches PHI-handling code (anything in `api/` or reading from the `consultations`, `patients`, or `prescriptions` tables), flag this in the PR description so review can focus appropriately.

---

## 3. Secrets and credentials — the hard rules

**Absolute rules. Non-negotiable.**

### 3.1 Never commit secrets

Secrets include: AWS credentials, Supabase service-role keys, Stripe API keys, Twilio tokens, LiveKit keys, Sentry DSNs, Anthropic keys (historical — no longer used), Documo/Telnyx API keys, HealthLink credentials (future), digital certificates.

- These live in **Vercel environment variables** (Production, Preview, Development) or in your local `.env.local` file — never in git.
- `.env.local` is gitignored. If you create additional env variants (`.env.staging`, `.env.local.backup`, etc.) they are also gitignored under the `.env*` pattern.
- If you need a secret to run the app locally, you request it from the compliance owner and it is shared via a secure channel (1Password shared vault, encrypted email, or in-person). Never over Discord, Slack, Signal, iMessage, SMS, or standard email.

### 3.2 If you think you've committed a secret

**Stop. Do not push. Contact the compliance owner immediately.**

If you have pushed, the exposure clock is running. Even a private repo can leak — through your account being compromised, through a leaked repo mirror, through the commit being shared. Every minute matters.

The response process is:
1. You notify the compliance owner immediately (by phone, not by message).
2. The compliance owner deactivates the exposed credential.
3. A new credential is generated and rotated in Vercel.
4. The exposure is documented in `docs/incidents/`.
5. The commit history is cleaned only if there is time-and-value to do so; usually the more important action is the rotation.

You will not be reprimanded for reporting immediately. You will be reprimanded for not reporting or for delaying.

### 3.3 Pre-commit hook

This repo uses a pre-commit hook (`detect-secrets`) that scans your changes for credential patterns before allowing a commit.

Install it once per clone:

```bash
brew install pre-commit           # macOS — one-time per machine
pre-commit install                # one-time per clone
```

Regenerate the baseline of known-non-secrets after your first install:

```bash
detect-secrets scan --baseline .secrets.baseline
```

The hook is not optional. If your commit is blocked, treat it as the hook doing its job — review the flagged content and confirm it is not a secret before overriding.

### 3.4 Do not screenshot or copy code containing secrets

Screenshots of your terminal, your editor, or your browser dev tools may contain env variables in unexpected places. Before you screenshot, close terminals, redact env panels, and check your active browser tab.

If a screenshot is essential for debugging, blur any environment variable panel before sharing.

---

## 4. Public discussion of your work

You are welcome to talk about your Tere Health work publicly — in your portfolio, on LinkedIn, at meetups. What you can and cannot say:

**You can:**
- Say you are working on a New Zealand rural telehealth platform.
- Describe the architectural patterns you contributed to at a general level (e.g. "server-mediated Supabase writes with column allowlists", "React + Vite + Vercel").
- Discuss general problems you solved without exposing internal code paths.

**You cannot:**
- Share screenshots of the codebase, the admin dashboard, the patient triage flow, or any provider view.
- Share commit hashes, PR numbers, or issue numbers that expose our development process.
- Cross-post links to PR discussions on public forums (Discord servers, Reddit, Hacker News, personal blogs) — those forums may be indexed and searched by attackers looking for context.
- Discuss unresolved security or privacy concerns in public. Bring these to the compliance owner privately.
- Say anything about specific patients, providers, employers, or clinical scenarios — even hypothetically.

If in doubt, ask before you post.

---

## 5. Local development environment

- **Do not develop against production Supabase.** A staging environment is in development (Task #74); use that when it is live. Meanwhile, local Supabase or a personal Supabase project is acceptable for local dev.
- **Do not test AI endpoints against Bedrock without approval.** Each call costs money and appears in AWS billing under Tere's account.
- **Payments:** always use Stripe test mode locally. Never use a real card against your local dev.
- **Fax integration:** never test against Documo or Telnyx from a dev environment. Use the mock adapter.

---

## 6. Communication channels

- **Day-to-day technical work:** GitHub issues and PRs are the primary channel. This creates a documented history.
- **Time-sensitive:** Signal (encrypted) group for the technical team. Compliance owner will add you on engagement start.
- **Incidents:** Phone call to the compliance owner. Do not wait for an email response.
- **Non-technical business:** email (`terehealthnz@gmail.com`) with subject line prefixed by "[Tere]".
- **Never use:** Discord servers you don't control, public Slack workspaces, or SMS for anything work-related. If a real-time chat is required and Signal is unavailable, request an alternative before improvising.

---

## 7. Testing before push

- Run the Playwright tests relevant to your change locally before opening a PR:
  ```bash
  npx playwright test tests/e2e/<relevant-file>.spec.ts --project=chromium
  ```
- If your change touches AI endpoints, run:
  ```bash
  npx playwright test tests/e2e/bedrock-smoke.spec.ts --project=chromium
  ```
- If your change touches PHI reads/writes, run the browser E2E:
  ```bash
  npx playwright test tests/e2e/bedrock-provider-flow.spec.ts --project=chromium
  ```
- Report the test outcome in the PR description ("smoke tests pass locally as of commit XXXXX").

---

## 8. What happens if you break production

- Stay calm. Escalate immediately (phone the compliance owner).
- Do not attempt to "fix" without discussing the fix first — a bad fix is worse than the original break.
- Assist with the response as needed. Your PR will be reverted or a hotfix will be shipped by the compliance owner.
- Contribute to the post-incident review honestly. We do not blame contributors for honest mistakes; we blame ourselves for not having the controls that would have caught them.
- The post-incident review will identify durable changes to prevent recurrence. Your input is welcomed.

---

## 9. End of engagement

On the last working day of your engagement:

1. All open PRs are either merged or closed with a note.
2. Your GitHub access is removed from `terehealthnz/tere-app`.
3. Your Signal group access is removed.
4. Your Vercel access (if granted) is removed.
5. Any shared 1Password vaults you had access to are revoked.
6. You confirm you have no local copies of production secrets. Delete any `.env.local` or similar files that contain non-test credentials.

If you retain any code artifacts for your portfolio, they are limited to the general architectural patterns described in Section 4, with no Tere-specific credentials, patient information, or internal references.

---

## 10. Questions

Anything unclear? Ask before you do. The compliance owner is available at:

- Email: patrickherling@gmail.com (for anything with a paper trail)
- Phone: (via personal contact established during onboarding)
- Signal: (established during onboarding)

Every question you ask before doing something is preferable to every question we have to answer during an incident.

---

## Change history

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-08 | Patrick Herling | Initial contractor onboarding document. Drafted as durable-change action #3 from the 2026-07-08 incident tabletop debrief. |
