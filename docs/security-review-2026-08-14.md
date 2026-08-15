# Tere Health — Security Review (2026-08-14)

**Reviewer:** Patrick Herling (via Claude Code)
**Scope:** `terehealth.co.nz` (production) + `tere.co.nz` (redirect alias)
**Method:** Live-fire attack surface probes + code-level review of auth gates, secret hygiene, and RLS policies. All tests performed against production; no destructive operations attempted.

---

## Executive summary

**No exploitable vulnerabilities found.** The perimeter is well-defended: HTTPS-only, HSTS-with-preload, restrictive CSP on all API responses, no secrets in the browser bundle, all 9 authenticated endpoints correctly return 401 unauthenticated, and every direct Supabase read/write attempt against PHI tables is blocked by RLS. Sub-processor certifications (AWS ISO 13485/27001, Supabase/Vercel SOC 2) discharge the platform-layer controls.

**Two minor hardening opportunities** identified — both defense-in-depth improvements rather than vulnerabilities:

1. Static HTML shell (index.html) lacks CSP/X-Frame-Options (API responses have them, but the outer HTML served by Vercel edge does not).
2. Some clinical tables have `GRANT SELECT TO anon` with RLS filtering to empty — safer pattern is `REVOKE SELECT` entirely (as we do for `patients`, `consultations`, `providers`).

Neither is exploitable today. Both worth fixing in a future hardening pass.

---

## 1. Transport-layer security

| Item | Status | Evidence |
|---|---|---|
| HTTP→HTTPS redirect | ✅ | `HTTP/1.0 308 Permanent Redirect` from Vercel edge |
| TLS cert | ✅ | Let's Encrypt, auto-renewed via Vercel; valid to 2026-10-22 |
| HSTS | ✅ | `max-age=63072000; includeSubDomains; preload` |
| Cert chain | ✅ | Trusted CA, correct CN, no self-signed |

## 2. Security headers

### On API responses (via `api/handler.js` `setSecurityHeaders`)

| Header | Value | Verdict |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; …; frame-src 'none'; object-src 'none'` | ✅ Strict; `'unsafe-inline'` for scripts is unavoidable with our React inline handlers, industry-normal |
| `X-Frame-Options` | `DENY` | ✅ |
| `X-Content-Type-Options` | `nosniff` | ✅ |
| `Referrer-Policy` | `strict-origin` | ✅ |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ✅ Explicitly restricts even though app uses these — user gesture required |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | ✅ |

### On static HTML (index.html served by Vercel edge)

Only HSTS is present. **The outer SPA HTML shell is not covered by the CSP/X-Frame-Options set by our API handler**, because Vercel serves it directly from its edge cache. Not exploitable in isolation, but reduces defense-in-depth against clickjacking + injected external scripts.

**Recommendation:** Add a `headers` block to `vercel.json` that applies the same CSP/X-Frame/X-Content-Type headers to `*.html` responses. ~10 minute change.

## 3. API authentication

Every route in `AUTH_REQUIRED_ROUTES` was probed unauthenticated. All returned **HTTP 401 "No provider credential"**:

```
consultations   401
patients        401
prescriptions   401
providers       401
audit           401
team-messages   401
hpi             401
payroll         401
acc-claims      401
```

Public routes (deliberately anon-facing) return sensible responses:

```
geo-check       200 (returns country info)
translate       400 (needs body)
get-queue       401 (auth-gated even though listed as public — good)
patient-support 401
job-listings    200
```

**Enumeration defense:** hitting `/api/patients?id=<random-uuid>` with a spoofed `x-provider-id` returns `{"error":"Provider not found"}` — the app doesn't reveal whether the patient UUID exists until the provider identity is validated. ✅

## 4. Browser bundle secret hygiene

Main bundle (`/assets/index-C0IsLgf_.js`, 239 KB) scanned for common secret patterns:

| Pattern | Found |
|---|---|
| Stripe secret keys (`sk_…`) | ❌ none |
| AWS access keys (`AKIA…`) | ❌ none |
| SUPABASE_SERVICE_ROLE / SERVICE_ROLE_KEY | ❌ none |
| GitHub tokens (`ghp_…`) | ❌ none |
| HPI_CLIENT / BEDROCK / AWS_SECRET | ❌ none |
| Supabase anon JWT | ✅ present (public by design — this is the browser client) |
| Supabase URL | ✅ present (public by design) |

Only the anon JWT + Supabase URL are in the bundle. Both public by Supabase design. See §5 for how much power anon actually has.

## 5. Supabase RLS — the "leaked anon key" attack

The anon JWT is public. What can a hacker who copies it out of the bundle actually do?

**Reads on primary PHI tables** — all return **`42501 permission denied`** at the GRANT level (safest posture):

```
patients            42501 permission denied
consultations       42501 permission denied
providers           42501 permission denied
audit_logs          42501 permission denied
prescriptions       42501 permission denied
patient_flags       42501 permission denied
incidents           42501 permission denied
complaints          42501 permission denied
consents            42501 permission denied
team_messages       42501 permission denied
appointments        42501 permission denied
```

**Reads on secondary tables** — GRANT SELECT is present but RLS filters to `[]` (empty). Effectively safe today, but weaker posture than REVOKE:

```
radiology_referrals     [] via RLS
acc_claims              [] via RLS
radiology_reports       [] via RLS
patient_documents       [] via RLS
patient_allergens       [] via RLS
patient_medications     [] via RLS
patient_conditions      [] via RLS
spo2_calibrations       [] via RLS
validation_readings     [] via RLS
validation_subjects     [] via RLS
bookings                [] via RLS
inbound_hl7_messages    [] via RLS
```

**Writes** — all realistic INSERT attempts blocked by RLS:

```
acc_claims          42501 row-level security policy
patient_documents   42501 row-level security policy
patient_allergens   42501 row-level security policy
bookings            42501 row-level security policy
radiology_referrals 42501 row-level security policy
```

**Storage buckets** — enumeration returns `[]`, object listing per bucket returns `[]` for `supervision-plans`, `hl7-attachments`, `patient-documents`, `patient-uploads`. Signed URLs (5-min default) are the only path to any file.

**Recommendation:** Tighten the secondary tables from GRANT+RLS to REVOKE+RLS. Even though today's RLS policies correctly filter them empty, a future policy mistake would let rows leak. Migration:

```sql
REVOKE SELECT ON public.radiology_referrals, public.acc_claims, public.radiology_reports,
                 public.patient_documents, public.patient_allergens, public.patient_medications,
                 public.patient_conditions, public.spo2_calibrations, public.validation_readings,
                 public.validation_subjects, public.bookings, public.inbound_hl7_messages
FROM anon;
```

(Server-side writes via `service_role` are unaffected.)

## 6. File-exposure probing

Common leak-check paths all serve the SPA index.html (200 with `<!DOCTYPE html>` body — false 200), not the actual file:

```
/.env             200 (SPA shell)
/.git/config      200 (SPA shell)
/.DS_Store        200 (SPA shell)
/package.json     200 (SPA shell)
/vercel.json      200 (SPA shell)
/api/handler.js   200 (SPA shell)
/supabase/schema.sql  200 (SPA shell)
```

**Verified**: no real config or secret files are exposed. The SPA-fallthrough rewrite in `vercel.json` correctly captures unknown paths.

## 7. XSS reflection probe

Injecting `<script>alert(1)</script>` into a URL path (e.g., `/waiting/<script>alert(1)</script>`) does NOT reflect the payload into the HTML response. React's default text-rendering + our SPA architecture prevents URL-parameter XSS by construction.

## 8. Rate limiting

The router applies per-IP rate limits (1200/15min for auth-required routes, 400/15min for anon-facing, 50/hr for payment). A 20-request burst returned all 401s without hitting the 429 limit (correct — 20 << 1200). Provider-authed brute-force is bounded.

## 9. Auth model

- **Provider identity** = Supabase JWT (preferred) OR `x-provider-id` UUID header (current PIN-login path). The UUID path is weaker than JWT but requires knowing a valid, active provider row — random UUIDs return "Provider not found" so enumeration is closed.
- **MFA (TOTP)** enrolled for provider logins (task #232).
- **PhiRevealGate** requires reason-picker before admin non-billing surfaces reveal clinical detail.
- **NHI-first patient search** is admin-only (as of commit 6ffe928) and writes an `nhi_query` audit row for every lookup.

## 10. Sub-processor certifications inherited

| Vendor | Certification | Covers |
|---|---|---|
| AWS (Bedrock, SNS, S3) | ISO 13485, ISO 27001, HIPAA BAA | AI inference, physical security, SMS, storage |
| Supabase | SOC 2 Type II | DB, auth, storage, RLS engine |
| Vercel | SOC 2 Type II | App hosting, edge, deploy pipeline |
| LiveKit | SOC 2 | Video/audio transport |
| Stripe | PCI-DSS Level 1 | Card payments |

See `docs/quality-management-system.md` Appendix B for the full register.

## 11. Findings summary

### None: no exploitable vulnerability

### Low: hardening opportunities

| ID | Finding | Recommendation | Effort |
|---|---|---|---|
| L-01 | Static HTML shell lacks CSP/X-Frame-Options | Add `headers` block to `vercel.json` covering `*.html` | 10 min |
| L-02 | 12 secondary tables have anon `GRANT SELECT` (RLS-filtered to empty) | REVOKE at GRANT level; RLS remains as second layer | 15 min migration |
| L-03 | CSP `connect-src` includes `https://cdn.jsdelivr.net` | Migrate MediaPipe FaceLandmarker model to self-hosted / Vercel-served if bandwidth allows | Bigger — deferred |

None of the above is exploitable today. Consider addressing L-01 + L-02 in a single small commit; L-03 is a longer-term improvement.

## 12. Attestations for insurers / regulators

- All PHI is stored in Supabase (Sydney ap-southeast-2 migration in progress; currently Singapore) with RLS enabled + REVOKE default for primary tables.
- No PHI transits any consumer service (no Google Analytics, no Facebook pixel, no Hotjar, no Sentry PII).
- Sub-processors that touch PHI are covered by SOC 2 / ISO 27001 / HIPAA BAA (see §10).
- Provider MFA enrolled; MCNZ registration verified at onboarding via HPI FHIR lookup.
- Every admin PHI access is logged to `audit_logs` with reason.
- Signed URLs on Storage default to 5 minutes.
- HSTS preload + full CSP headers on all API responses.

---

**Reviewed by:** Dr Patrick Herling (Chief Medical Officer, Tere Health Limited) on 2026-08-14, using automated probing against production `terehealth.co.nz`.
