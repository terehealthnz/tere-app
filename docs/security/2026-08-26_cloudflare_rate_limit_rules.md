# Cloudflare rate-limit rules — Tere Health

**Purpose:** close pen-test finding F8/B4b (per-instance in-memory rate
limits leak across Vercel lambdas). Cloudflare sees every request before
any lambda spins, so CF-level rules give true cross-instance enforcement.

**Task:** #295 — "Cloudflare rate limiting rules on PHI endpoints."

**Time:** ~10 min in the CF dashboard once. No code changes.

**Zones covered:** all zones fronted by CF — `terehealth.co.nz`,
`tere.co.nz`, `terecare.com`. Add each rule to each zone (CF now supports
rule bundles via the Rules > Rate limiting rules panel).

---

## Global posture

Before adding per-route rules, turn on the following zone-wide settings
(each zone → **Security** section):

| Setting                              | Value                              | Why                                                                                          |
|--------------------------------------|------------------------------------|----------------------------------------------------------------------------------------------|
| Bot Fight Mode                       | On                                 | Blocks known attack tooling (nmap, sqlmap, python-requests without UA, etc.)                 |
| Security Level                       | Medium                             | Default JS challenge on high-threat-score requests                                           |
| Browser Integrity Check              | On                                 | Rejects obviously-forged UA + missing headers                                                |
| Challenge Passage                    | 30 minutes                         | After passing a challenge, don't re-challenge same session for 30 min                        |
| HTTP DDoS attack protection         | High sensitivity                   | Free/Pro plans get this automatically; verify it's not overridden                           |

---

## Rate-limit rules

Cloudflare rate-limit rules match an **expression**, then throttle by
**characteristic** (IP is default), **threshold**, and **period**. Action
is one of `block`, `managed_challenge`, `js_challenge`, `log`.

Add these in order — CF evaluates top-down, first match wins.

### 1. Payment routes — 10 / minute / IP → block 1 hour

Card-testing prevention. Legitimate users hit these ~3 times per consult
max (create → capture, or cancel). 10/min tolerates form re-submits.

```
Expression: (http.request.uri.path in {"/api/create-payment-intent" "/api/capture-payment" "/api/cancel-payment"})
Characteristics: IP
Requests: 10
Period: 1 minute
Action: Block
Duration: 1 hour
```

### 2. Auth surfaces — 20 / minute / IP → managed challenge 15 min

Provider login + password reset + MFA verify. Blocks credential stuffing
without breaking legitimate typos on a home NAT.

```
Expression: (http.request.uri.path in {"/api/auth" "/api/provider-reset-request" "/api/provider-reset-complete" "/api/change-password"} and http.request.method eq "POST")
Characteristics: IP
Requests: 20
Period: 1 minute
Action: Managed Challenge
Duration: 15 minutes
```

### 3. Anon patient intake — 30 / minute / IP → block 15 min

Support ticket / waitlist / AU-waitlist POSTs. Legit patients submit
these ≤5 times per session; 30/min catches spam bursts without hurting
NAT'd households.

```
Expression: (http.request.uri.path in {"/api/patient-support" "/api/waitlist-signup" "/api/au-waitlist" "/api/complaints" "/api/breach"} and http.request.method eq "POST")
Characteristics: IP
Requests: 30
Period: 1 minute
Action: Block
Duration: 15 minutes
```

### 4. Bedrock-backed AI routes — 60 / minute / IP → block 15 min

These fan out to AWS Bedrock (real spend). Legitimate patient triage
hits `/api/ai` roughly once per user turn — 60/min tolerates a 12-turn
conversation over 12 minutes with headroom.

```
Expression: (http.request.uri.path in {"/api/ai" "/api/assess-acc" "/api/live-translate" "/api/generate-notes"})
Characteristics: IP
Requests: 60
Period: 1 minute
Action: Block
Duration: 15 minutes
```

### 5. HL7 receive endpoint — IP allowlist (drop everything else)

`/api/hl7-file` (Medical-Objects → Fly.io mTLS bridge → this endpoint)
should only accept from the MO Fly.io egress. Use a **WAF Custom Rule**
(not a rate limit — a hard block):

```
Expression: (http.request.uri.path eq "/api/hl7-file" and not ip.src in {<MO_FLY_EGRESS_IPS>})
Action: Block
```

The Fly.io app's egress IPs are listed at `fly.io/docs/reference/regions/`
under region SYD (Sydney). Grab from `fly ips list -a <app-name>` or CF
should suggest them after ~1 day of traffic learning. Update this rule
when Fly rotates.

### 6. Cron endpoints — reject non-Vercel origins

Vercel's cron scheduler hits `/api/cron-*`. These carry `CRON_SECRET` in
the app but adding CF-level defence is cheap:

```
Expression: (starts_with(http.request.uri.path, "/api/cron-") and not ip.src in {<VERCEL_CRON_IPS>})
Action: Block
```

Vercel cron egress IPs: `vercel.com/docs/edge-network/regions` — grab
the region hosting your deployment. If Vercel rotates without notice,
the app-side `CRON_SECRET` header check remains authoritative.

### 7. Global anon fallback — 300 / minute / IP → managed challenge

Catch-all so no un-listed route escapes limits. Applies after the
per-route rules above.

```
Expression: (starts_with(http.request.uri.path, "/api/"))
Characteristics: IP
Requests: 300
Period: 1 minute
Action: Managed Challenge
Duration: 5 minutes
```

---

## What this leaves for the app-side limiter in `handler.js`

Keep the in-memory limiter as a **fast-fail fallback**. It:
- Fires 429 immediately if CF misses (rare — CF is authoritative)
- Provides a per-instance safety net if a lambda gets hammered before CF's rules propagate
- Preserves current logs (`logRequest(..., 429, 'rate_limited')`) for observability

No code change needed — CF rules are strictly additive.

---

## Verification

After adding rules, hit each family with `hey` or `wrk` from a single IP:

```bash
# Payment route — should 429 after 10 in a minute
hey -n 30 -c 3 -m POST https://terehealth.co.nz/api/create-payment-intent

# AI route — should 429 after 60 in a minute
hey -n 100 -c 5 -m POST https://terehealth.co.nz/api/ai
```

Watch the `cf-ray` and `cf-cache-status` headers — a CF-level block
returns `403` with a challenge page HTML rather than the app's JSON
`{ "error": "Too many requests" }`. Both are correct outcomes.

If you see the app's JSON 429 (not CF's), the request slipped past CF
and the in-memory limiter caught it — usually because you're testing
from a warm connection CF is passing through, or your test client uses
a CF-cached path.

---

## Rollback

Cloudflare rules can be disabled in-place (toggle off) without deploy.
If a rule breaks legitimate traffic, disable, iterate, re-enable. No
rollback deploy needed for any of this.
