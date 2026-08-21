# NZ Patient Flow — Back-Button Audit Before Payment

**Date:** 2026-08-21
**Scope:** Task #248. Behaviour of the browser back button at each step in the NZ patient intake flow, from Landing through Payment.

## Flow map

```
/                     Landing / PwaRoot
  ↓
/start                TereIntro
                        → createConsultation(status='pre_triage')
                        → sessionStorage.setItem('consultation_id', pt.id)
  ↓
/consent              ConsentPage
  ↓
/triage               AITriage
                        → init effect: if 'consultationId' exists + status active,
                          redirect forward based on status
                        → on complete: createConsultation(with triage data)
                        → sessionStorage.setItem('consultationId', consultation.id)
                        → migrate consents from 'consultation_id' → 'consultationId'
  ↓
/consultation-type    ConsultationType
  ↓
/payment              Payment
                        → confirmCardPayment(clientSecret)
                        → sessionStorage.setItem('paymentIntentId', ...)
                        → patientUpdateConsultation(status='waiting')
  ↓
/vitals/:id           VitalsCapture
  ↓
/waiting/:id          WaitingRoom
```

## Findings

### Fixed in this pass

**F1 — Payment page had no back-button guard (critical, double-charge risk)**
- **Before:** if the patient hit browser back from `/vitals/:id` to `/payment` after payment was already captured, the Stripe form was rendered again with the same `consultationId`. Nothing checked whether `paymentIntentId` was already set. Re-submit would create a second payment intent.
- **Fix:** Payment.jsx now checks `sessionStorage.paymentIntentId` on mount. If present, redirects forward to `/vitals/:id` (or `/message-sent` for async) with `replace: true` so the form is never re-rendered.

**F2 — TereIntro created an orphan pre-triage row on every back+re-accept (moderate, DB spam)**
- **Before:** hitting back from `/consent` to `/start` and re-accepting the geo dialog created another `pre_triage` consultation row without checking for an existing one. Patients bouncing between steps could produce 3-5 orphan rows.
- **Fix:** TereIntro checks `sessionStorage.consultation_id` (or `consultationId`) before creating; reuses the existing row if present.

### Documented, not fixed in this pass

**F3 — Dual-consultation architecture (architectural)**
- TereIntro creates a `pre_triage` consultation stored under sessionStorage key `consultation_id` (with underscore).
- AITriage later creates a **second** consultation on triage complete, stored under `consultationId` (camelCase).
- AITriage migrates consents from the first row to the second (see `preTriageId` block ~line 746), then removes the underscore key.
- The first `pre_triage` row is left in place. Intentional as drop-off telemetry, but the two-row model is fragile — every patient session leaves one orphan row, and the two sessionStorage keys are one string typo away from writing to the wrong consultation.
- **Recommendation:** either (a) collapse to a single row and let AITriage UPDATE the pre_triage row rather than create a new one, or (b) formalise the two-row pattern with clear naming (`shell_consultation_id` vs `active_consultation_id`) and document the migration explicitly.

**F4 — SessionStorage key inconsistency (`consultation_id` vs `consultationId`)**
- Same string, two conventions. Guarded in F2 fix by falling back to both keys, but the underlying inconsistency remains. Low urgency because only AITriage reads both — but any future reader that only checks one key will silently work with the wrong consultation.
- **Recommendation:** pick one convention (camelCase to match `paymentIntentId`, `consultationType`, `patientLanguage`) and rewrite all reads/writes in one sweep.

**F5 — AITriage back-recovery incomplete for `vitals_requested` status**
- AITriage.jsx line 262-278 handles: `in_progress`/`ready` → `/call`, `vitals_complete`/`waitlisted` → `/waiting`, `waiting` + paymentIntent → `/vitals`, else → `/consultation-type`.
- `vitals_requested` (patient is mid-scan) falls through to the `else` branch and gets sent back to `/consultation-type`. Confusing UX — patient was on `/vitals`, hits back, ends up further back than they were.
- **Recommendation:** add explicit handler: `vitals_requested` → `/vitals/:id` (replace).

## What passed

- **`/triage` → `/consent` back** — consent state persists in sessionStorage; re-forward through `/triage` is caught by AITriage's init redirect. No duplication.
- **`/consultation-type` → `/triage-review` back** — no consultation mutation, safe.
- **`/payment` → `/consultation-type` back (in-app arrow)** — explicit UI back button, safe.
- **Post-payment `/vitals/:id` → `/waiting/:id` forward** — no back-affecting side effects.

## Testing notes

- Test scenarios worth adding to the Playwright hardening suite:
  - Back from `/vitals/:id` to `/payment` should not render payment form (F1 regression check).
  - Back from `/consent` to `/start` + re-accept geo dialog should reuse the pre_triage row (F2 regression check — query DB row count after 3 back+forward cycles).
  - Back from `/consultation-type` to `/triage` should redirect forward via AITriage init effect, not re-run triage.

## Commits

- Payment page back-guard: `src/components/patient/Payment.jsx`
- TereIntro reuse-existing guard: `src/components/patient/TereIntro.jsx`
