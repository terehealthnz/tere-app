# Tere Vitals — Software Lifecycle File

**Document version:** 1.0
**Date:** 2026-08-14
**Owner:** Dr Patrick Herling (Software Release Approver)
**Review cadence:** Every twelve months, or immediately following any change to the software safety classification, deployment architecture, or SDLC tooling
**Standard alignment:** IEC 62304:2006/A1:2015 (Medical device software — Software life-cycle processes)
**Companion documents:** [`quality-management-system.md`](./quality-management-system.md), [`risk-management-file.md`](./risk-management-file.md), [`rollback-runbook.md`](./rollback-runbook.md), [`incident-response-plan.md`](./incident-response-plan.md), [`security-compliance.md`](./security-compliance.md)

---

## 1. Scope and software safety classification

This file documents the software life-cycle processes for **Tere Vitals** (WAND `260729-WAND-786DQ9`, GMDN 57960, Class IIa medical device) and the surrounding Tere Health clinical platform on which it depends.

### 1.1 Software safety class (IEC 62304 §4.3)

Per IEC 62304 §4.3, software safety classes are:

- **Class A** — No injury or damage to health is possible.
- **Class B** — Non-serious injury is possible.
- **Class C** — Death or serious injury is possible.

**Tere Vitals is classified as Class B.** Justification:

- The device is an **adjunct** to clinical triage; the registered clinician remains the decision-maker for every action.
- The most-severe realistic outcome from an incorrect reading is a **delayed clinical escalation** (e.g., missed hypoxia leading to delayed transfer), which meets ISO 14971's "non-serious injury" threshold when residual risk controls in [`risk-management-file.md`](./risk-management-file.md) are applied.
- The device is not standalone diagnostic; it does not administer therapy; it does not control life-supporting equipment; it is not marketed for critical-care use.
- Death or serious injury is not a reasonably foreseeable consequence of a single erroneous reading given the adjunct-only intended purpose and the clinician-in-the-loop workflow.

This classification is reviewed whenever the intended purpose, algorithm, or workflow changes. Any expansion to standalone-diagnostic use, continuous monitoring, or critical-care settings would upgrade the class to C and require a re-baselined SDLC.

### 1.2 Scope of this document

This file covers:

1. Tere Vitals (rPPG estimation module + calibration + display)
2. The clinical delivery platform on which Tere Vitals is embedded (the `tere-app` codebase — patient triage, provider queue, consultation UI, PDFs, integrations)
3. All server-side APIs handling PHI or affecting clinical output

## 2. Software development plan

Tere Health's SDLC operates on a single Git-based trunk model with the following elements:

| Process | Tooling | Artefact |
|---|---|---|
| Requirements capture | GitHub issues, `docs/` markdown, ad-hoc conversation logs | Git commit messages describe the change driver |
| Architectural design | `docs/` markdown, code comments in landing files (`api/handler.js`, `src/App.jsx`) | Committed to `main` |
| Detailed design | Code + inline comments; SQL migrations under `supabase/` | Committed |
| Implementation | Local development against `.env.local`; PR-less trunk-based with self-review | Git commit |
| Unit + integration testing | Vitest + Playwright (E2E on prod) | `npm run test:e2e` results; CI logs |
| System testing | Manual test plans documented per feature (see `docs/*` per feature); Playwright smoke suites | Recorded in git commit messages + `docs/` |
| Release | Vercel auto-deploy from `main` branch push; feature flags via Supabase `flags` table | Vercel deploy record + git tag |
| Post-release verification | Prod curl smoke, canary uptime (planned), Sentry error monitoring | Sentry event stream + `audit_logs` |
| Configuration management | Git (source), Vercel (secrets), Supabase (schema) | Git history + Vercel deploy history + Supabase PITR |
| Change control | Every deploy is one or more commits; feature flags gate risky changes; rollback ≤ 30s via redeploy of previous good commit | Git log + `rollback-runbook.md` |
| Problem resolution | GitHub issues + `incidents` Supabase table | Traceable incident → root cause → commit → verification |
| Software maintenance | Same SDLC applies to maintenance releases (bug fixes) as to new features | Git commit |

### 2.1 Roles and responsibilities

- **Software Release Approver** — Patrick Herling (Chief Medical Officer). No commit reaches production without Patrick's review — either as the commit author or as the reviewer of a contracted developer's work.
- **Clinical Reviewer for material changes** — Rachel Thomas (Medical Director) for any change affecting clinical output, intended purpose, or safety-critical algorithm.
- **Contracted developers** — sign a Data Access Agreement; no default access to production PHI; access granted only for specific issues with a documented reason.

## 3. Software requirements analysis (IEC 62304 §5.2)

Requirements are captured across three tiers:

1. **Regulatory / clinical requirements** — derived from the WAND intended purpose (fixed), MCNZ Statement on Telehealth (August 2023), HDC Code of Rights, HIPC 2020, ACC contract terms, and MedSafe essential principles. Documented in this file's Companion documents.
2. **Product requirements** — documented per feature in `docs/` and referenced in git commit messages.
3. **Detailed requirements** — captured as code comments and API contracts (see `api/handler.js` ROUTES map for the authoritative endpoint catalogue).

Every requirement for a safety-relevant capability is traceable to (a) the risk-management-file hazard it mitigates or (b) the intended-purpose statement it fulfils.

## 4. Software architectural design (§5.3)

### 4.1 Top-level architecture

- **Client** — React SPA (Vite build) served by Vercel; browser-based patient triage + provider workflow + admin dashboard.
- **API** — single Vercel serverless function (`api/handler.js`) routing to per-endpoint modules (`api/_*.js`). Auth gate at router level via `AUTH_REQUIRED_ROUTES` set. Rate-limit + CSP + security headers applied uniformly.
- **Database** — Supabase Postgres (Singapore region, migrating to Sydney per DR plan) with RLS enabled; server-side writes use service_role via handler.js.
- **AI inference** — AWS Bedrock (Sydney, under BAA). No AI inference for safety-critical paths (Tere Vitals rPPG runs client-side); Bedrock used only for triage assist + clinical note structuring.
- **Media transport** — LiveKit Cloud (Sydney) for video/audio; ephemeral, not stored.
- **Storage** — Supabase Storage for PDFs, HL7 attachments, patient uploads. Signed-URL access, 5-minute default expiry.

### 4.2 Segregation of software items

- **Safety-relevant items** (rPPG estimator, calibration loader, SpO₂ display gating, RR algorithm, prescription generator, clinical PDFs) are held to Class B verification requirements: unit tests where practical; system-level verification against reference standards; feature flags for staged rollout; explicit documented review at release.
- **Supporting items** (marketing pages, patient support flow UI polish, admin analytics dashboards) are held to Class A discipline: change-controlled but not requiring the same level of pre-release verification.
- The boundary between the two is enforced at the code layer by API endpoint categorisation (see `AUTH_REQUIRED_ROUTES` in `api/handler.js`) and by feature-flag scoping.

### 4.3 Third-party / SOUP components

"Software of Unknown Provenance" per IEC 62304 §5.3.3. Our safety-relevant SOUP includes:

| Component | Function | Risk mitigation |
|---|---|---|
| React 18 | UI framework | Widely-used, actively maintained; upgrades reviewed for breaking changes |
| Vite | Build tool | Build artefacts hash-verified after deploy |
| Supabase JS client | DB access | Server-side only for PHI writes |
| @supabase/supabase-js | Server-side DB access | Pinned version; upgrades reviewed |
| MediaPipe FaceLandmarker | Face detection for rPPG ROI | Google-maintained; ONNX runtime; migrated from face_mesh 2026-08 |
| AWS SDK for Bedrock | AI inference | AWS-maintained; under BAA |
| Stripe.js | Payment intent | Stripe-maintained; PCI-DSS L1 |
| PDFKit | PDF generation | Widely-used; deterministic output verified |
| LiveKit client | WebRTC transport | LiveKit-maintained; ephemeral use only |

SOUP components are pinned in `package.json` and `package-lock.json`. Upgrades are reviewed for changelog + security advisory before merging.

## 5. Software detailed design (§5.4)

Detailed design is captured in code + inline comments. The convention documented in `CLAUDE.md` (and enforced in review) is: **comments explain the "why", not the "what"** — a hidden constraint, an invariant, a workaround for a specific bug. Well-named identifiers do the "what" work.

Design decisions with safety implications are additionally documented in the risk management file (as the mitigation column of the hazard analysis) and in `docs/` markdown where the design affects clinician or patient workflow.

## 6. Software unit implementation and verification (§5.5)

- Unit test coverage is targeted at safety-relevant modules: rPPG signal processing, SpO₂ calibration loader, NHI format validator, clinical PDF builders, audit-log write paths.
- Non-safety-relevant modules (marketing pages, cosmetic UI) may ship without unit tests where system-level verification is sufficient.
- Every commit that touches a safety-relevant module is reviewed by the Software Release Approver before merge (or, in trunk-based workflow, before push to `main`).

## 7. Software integration and integration testing (§5.6)

Integration verification is performed through:

- **Playwright E2E suites** exercising the golden patient-through-consultation-through-notes path, run periodically against staging + prod.
- **Smoke curls** hitting critical endpoints (`/api/status`, `/api/get-queue`, `/api/hpi?action=ping`) after every deploy.
- **Manual verification** for UX changes documented in the commit message.

Integration test evidence is captured in commit messages and (where a full E2E run was executed) in git tags or PR descriptions.

## 8. Software system testing (§5.7)

System-level verification for Tere Vitals specifically:

- **Reference-standard accuracy validation** against multi-parameter monitor data — the VitalsValidate observational study (see [`vitals-validate-participant-information-sheet.md`](./vitals-validate-participant-information-sheet.md) and [`neac-2019-compliance-vitals-validate.md`](./neac-2019-compliance-vitals-validate.md)).
- **Signal-quality gate verification** — synthetic low-signal test cases confirm the display hides low-confidence readings.
- **Feature-flag verification** — every safety-relevant flag has a documented on/off test in `docs/rollback-runbook.md`.
- **BP-disabled verification** — automated post-deploy check that BP is not rendered in the intake path (task added in commit hooking WAND to production).

For platform-level system testing:

- HPI FHIR compliance pack (5/5 PASS, evidence PDF in `docs/regulatory/`)
- Windcave payment certification (completed 2026-07)
- No-show flow E2E (task #132)
- Bilingual triage E2E (task #131)

## 9. Software release (§5.8)

Every release goes through:

1. **Commit message documents the driver** for the change (regulatory, feature, bug, refactor).
2. **`npm run build`** locally to confirm compilation.
3. **Software Release Approver reviews** the diff (either as author or reviewer).
4. **Push to `main`** triggers Vercel auto-deploy.
5. **Post-deploy smoke curl** on the affected endpoints.
6. **Feature flag** kept OFF for the first cohort of releases affecting clinical output, ramped after monitoring shows no anomalies.
7. **Release note captured in git** (commit message + tag if the change is material).

Rollback: `rollback-runbook.md` documents the ≤ 30-second Vercel redeploy of the previous good commit, plus the Supabase PITR window (7 days) for schema/data rollbacks.

## 10. Software configuration management (§8)

- **Source** — Git (`terehealthnz/tere-app` on GitHub). Every change is a commit.
- **Configuration** — Vercel environment variables (encrypted at rest). Env-var changes are logged in the Vercel dashboard.
- **Secrets** — Vercel encrypted env; never committed to Git (enforced via `.gitignore`).
- **Schema** — Supabase migrations under `supabase/*.sql`. Every migration filename is prefixed with the date it was run.
- **Feature flags** — Supabase `flags` table + `/api/flags` endpoint.
- **Versioning** — Git commit SHA is the effective version. Semantic tags applied for material releases.

## 11. Software problem resolution process (§9)

Problem intake:

- **Internal detection** — Sentry error stream, availability canary (planned), audit-log completeness review.
- **Clinician report** — via internal Tere Chat DM or direct-to-Patrick.
- **Patient report** — via `/api/patient-support` ticket, routed by the ticket system into Messages tab / queue / admin.
- **Sub-processor notification** — AWS, Supabase, Vercel, LiveKit; monitored channel.

Triage: each problem is classified by (a) safety impact (Class A/B/C hazard mapping to risk file) and (b) urgency (P0–P3, matches IR plan). A P0/P1 safety problem triggers the incident response plan immediately.

Resolution: fix committed to git; deployed under normal SDLC (§9 above); verification confirmed; incident row closed; if root-cause reveals a class of issue, a preventive control is added.

Traceability: every problem is linked to (a) the commit that fixed it, (b) the incident row (if raised), (c) any risk-file hazard it exposes or reinforces.

## 12. Software maintenance process (§6)

Maintenance releases (bug fixes, security patches, dependency upgrades) follow the same SDLC as new-feature releases: git commit + review + build + deploy + verify.

Dependencies are monitored via `npm audit` and GitHub Dependabot; security patches are prioritised by CVSS + exposure surface.

Substantive maintenance changes affecting a safety-relevant capability trigger a risk-file review to confirm the hazard controls remain effective.

## 13. Traceability

The following traceability chains are maintained:

- **Requirement → design** — `docs/` markdown + git commit message
- **Requirement → test** — commit message references the test evidence
- **Hazard → risk control → verification** — risk-management-file §10 hazard row cites the code / config / doc control, and §11 (post-market surveillance) tracks the ongoing effectiveness signal
- **Deploy → commit → test** — Vercel deploy record → git commit → commit message + smoke evidence

## 14. Cybersecurity within the SDLC

- Threat modelling: informal, revisited when a material architectural change is proposed.
- Secure coding: server-side allowlists on all clinical writes; RLS + service_role separation; MFA on admin surfaces; encrypted env vars; sub-processors under BAA/DPA (see QMS §5.2).
- Dependency hygiene: `npm audit` + Dependabot.
- Incident response for security events: [`incident-response-plan.md`](./incident-response-plan.md).
- Compliance: HIPC 2020, ISO 27001 (via inherited sub-processor certifications), AWS BAA for Bedrock inference.

## Appendix — Change history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-08-14 | Patrick Herling | Initial issue documenting IEC 62304-aligned SDLC processes for Tere Vitals (Class B) and the surrounding Tere Health clinical platform. |
