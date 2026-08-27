// Single Vercel serverless function — lazy-loads only the requested handler
// bodyParser disabled so multipart streams reach _transcribe.js intact via formidable
export const config = { api: { bodyParser: false } }

// Staging env aliasing — Preview branch deploys read _STAGING variants so no
// individual endpoint has to know about the split. Runs once per cold start
// before any endpoint module is imported. Falls through to prod values if
// staging vars aren't defined (safe default for local dev + Production).
if (process.env.VERCEL_ENV === 'preview') {
  if (process.env.VITE_SUPABASE_URL_STAGING)         process.env.VITE_SUPABASE_URL         = process.env.VITE_SUPABASE_URL_STAGING
  if (process.env.VITE_SUPABASE_ANON_KEY_STAGING)    process.env.VITE_SUPABASE_ANON_KEY    = process.env.VITE_SUPABASE_ANON_KEY_STAGING
  if (process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING) process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING
}

// Routes that require an authenticated provider (Supabase JWT OR sessionStorage
// x-provider-id). Everything not in this set is either patient-facing (with its
// own guards inside the endpoint — token verification, column allowlist,
// rate-limit), a public info endpoint, a webhook (Stripe/Telnyx/ACC signature
// verified by the endpoint itself), or a cron (CRON_SECRET verified in the
// endpoint). If you add a new provider-only route to the ROUTES map below,
// add its key here too — otherwise anyone can hit it without signing in.
const AUTH_REQUIRED_ROUTES = new Set([
  // PHI reads/writes on consultations + related tables. create-consultation
  // is NOT here — patient triage / repeat-Rx flows call it before login;
  // security is enforced by the CREATE_REJECT allowlist inside the endpoint.
  // Same for patient-consult (patient updates own consult with PATIENT_ALLOWLIST).
  // Same for patients (action=create/lookup for anon triage; guarded inside).
  'consultations', 'prescriptions', 'providers',
  'get-queue', 'appointments',
  // Employer directory — writes affect who can get a free consult, so admin-gate
  'employers', 'employer-employees',
  // Validation subsystem (research data)
  //   validation-subjects — GET/POST are anon (patient self-enrolls); guarded inline
  //   validation-readings — GET/POST are anon; PATCH (provider corrections) guarded inline
  //   model-version — also anon so an unauth /vitals-validate scan auto-persists
  //     the trained BP model without requiring a clinician sign-in on the device
  //     that ran the training
  'flags',
  // Provider clinical work
  'convert-to-acc', 'acc-claims',
  'generate-notes', 'generate-med-cert', 'generate-prescription-pdf', 'generate-referral-pdf',
  'generate-supervision-plan',
  'drug-interactions', 'dismiss-patient',
  'create-room',
  'initiate-call', 'make-call', 'ring-timeout', 'mark-no-show',
  // Provider admin surfaces (task C migrations)
  'audit-log', 'radiology-referrals', 'radiology-reports', 'clinic-schedule',
  'supervision',
  // Imaging result peer-review (retrospective QI)
  'imaging-reviews', 'imaging-review',
  // Patient documents (provider-uploaded lab results / referral letters / etc.)
  'patient-documents',
  // Structured patient history — allergens, medications, conditions (task #223)
  'patient-allergens', 'patient-medications', 'patient-conditions',
  // Provider MFA — enroll / verify / disable own TOTP (2026-08-04)
  'provider-mfa',
  // Internal Tere Chat (provider/admin team channel, 2026-08-05)
  'team-messages',
  // NOT here:
  //   patients         — action=create/lookup are anon triage; guarded inside
  //   spo2-calibrations — GET is public, POST guards inside (VitalsValidate)
  //   push-subscribe   — anon patient/provider subscription; upsert-only
  //   job-listings     — GET is public (Careers page); writes guarded inside
  //   job-applications — POST is anon submit; other verbs guarded inside
  // NOT auth-required (patient-side callers, own guards inside):
  //   assess-acc      — patient triage AI classifies ACC eligibility
  //   verify-acc      — patient triage verifies ACC injury details
  //   translate       — patient-side i18n (Te Reo triage translation)
  //   hpi-search      — patient uses to look up pharmacy in triage
  //   join-room       — patient joins the video call (has consultationId gate)
  //   messages        — dual-mode: patient AND provider chat inserts (server
  //                     forces sender=patient|provider based on presence of
  //                     provider credentials, so no spoofing risk)
  // Provider comms
  'send-email', 'send-to-gp', 'send-waitlist-email', 'notify-waitlist', 'sms',
  // Schedule + availability
  'schedule', 'set-availability',
  // Approvals + admin
  'approve-draft', 'admin-patch', 'audit', 'payroll',
  'incidents', 'complaints', 'breach', 'handover', 'patient-flags',
  // Data integrations (provider-triggered)
  'pms-data',
  // HL7 inbox filing (assign message to patient chart)
  'hl7-file',
  // Provider-only payment capture. Requires provider auth + ownership check
  // (see api/_capture-payment.js). Cancel-payment stays anon because the
  // patient can abandon during triage — it has its own consult-existence
  // check to prevent random paymentIntentId spam.
  'capture-payment',
  // Provider practice-mode sandbox seed / reset
  'practice-seed', 'practice-reset',
  // Te Whatu Ora HPI FHIR proxy (admin-only, PII lookup on clinicians/facilities)
  'hpi',
  // Windcave money-movement — only providers/admin may capture or refund
  'windcave-complete', 'windcave-refund',
])

// ── Rate limiting (in-memory, per instance) ──────────────────────────────────
const RATE_WINDOWS = new Map() // key → { count, reset }
const PAYMENT_ROUTES = new Set(['create-payment-intent', 'capture-payment', 'cancel-payment', 'windcave-create-session', 'windcave-query', 'windcave-complete', 'windcave-refund'])

function checkRateLimit(key, maxReqs, windowMs) {
  const now = Date.now()
  const entry = RATE_WINDOWS.get(key)
  if (!entry || now > entry.reset) {
    RATE_WINDOWS.set(key, { count: 1, reset: now + windowMs })
    return false // not limited
  }
  entry.count++
  return entry.count > maxReqs
}

// ── Auth failure tracking (for alert emails) ──────────────────────────────────
//
// Two layers of failure tracking:
//   1. In-memory (per-instance) — fires an immediate email at ≥10 fails/hour.
//      Fast, but state is per-lambda and resets on cold start.
//   2. Persistent — every failure is written to security_events. The nightly
//      /api/cron-security-anomalies job aggregates across all instances and
//      alerts on brute-force patterns the in-memory layer missed.
const AUTH_FAILURES = { count: 0, windowStart: Date.now(), alertSent: false }
const AUTH_FAIL_WINDOW_MS = 60 * 60 * 1000 // 1 hour

async function trackAuthFailure(ip, userAgent) {
  // Layer 2: persist every failure. Fire-and-forget.
  try {
    const { recordSecurityEvent } = await import('./_security-events.js')
    recordSecurityEvent({
      event_type: 'auth_failure',
      severity: 'info',
      ip,
      user_agent: userAgent,
    })
  } catch {}

  // Layer 1: in-memory immediate-alert threshold.
  const now = Date.now()
  if (now - AUTH_FAILURES.windowStart > AUTH_FAIL_WINDOW_MS) {
    AUTH_FAILURES.count = 0
    AUTH_FAILURES.windowStart = now
    AUTH_FAILURES.alertSent = false
  }
  AUTH_FAILURES.count++
  if (AUTH_FAILURES.count >= 10 && !AUTH_FAILURES.alertSent) {
    AUTH_FAILURES.alertSent = true
    try {
      const { sendEmail } = await import('./_email-client.js')
      await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: 'terehealthnz@gmail.com',
        subject: '[ALERT] 10+ failed auth attempts in the last hour',
        text: `Security alert: ${AUTH_FAILURES.count} failed provider auth attempts from IPs including ${ip} in the last hour. Please review access logs.`,
      })
      // Also mark the burst in security_events so the nightly summary
      // records that the immediate email was already sent (dedupe cue).
      try {
        const { recordSecurityEvent } = await import('./_security-events.js')
        recordSecurityEvent({
          event_type: 'auth_failure_burst',
          severity: 'alert',
          ip,
          metadata: { count_in_window: AUTH_FAILURES.count, window_ms: AUTH_FAIL_WINDOW_MS },
        })
      } catch {}
    } catch {}
  }
}

// ── Security headers ──────────────────────────────────────────────────────────
//
// CSP script-src:
//   Dev  → includes 'unsafe-eval' (Vite's dev-server HMR needs it)
//   Prod → drops 'unsafe-eval' so an XSS-injected script can't eval()
//          arbitrary strings back to code execution
function setSecurityHeaders(res) {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co wss://*.livekit.cloud https://api.daily.co https://cdn.jsdelivr.net https://storage.googleapis.com https://ipapi.co",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  )
}

const ROUTES = {
  'assess-acc':                () => import('./_assess-acc.js'),
  'approve-draft':             () => import('./_approve-draft.js'),
  'convert-to-acc':            () => import('./_convert-to-acc.js'),
  'change-password':           () => import('./_change-password.js'),
  'cancel-payment':            () => import('./_cancel-payment.js'),
  'capture-payment':           () => import('./_capture-payment.js'),
  'create-payment-intent':     () => import('./_create-payment-intent.js'),
  'windcave-create-session':   () => import('./_windcave-create-session.js'),
  'windcave-query':            () => import('./_windcave-query.js'),
  'windcave-complete':         () => import('./_windcave-complete.js'),
  'windcave-refund':           () => import('./_windcave-refund.js'),
  'windcave-fprn':             () => import('./_windcave-fprn.js'),
  'create-room':               () => import('./_create-room.js'),
  'employer-check':            () => import('./_employer-check.js'),
  'generate-med-cert':         () => import('./_generate-med-cert.js'),
  'generate-notes':            () => import('./_generate-notes.js'),
  'generate-prescription-pdf': () => import('./_generate-prescription-pdf.js'),
  'generate-referral-pdf':     () => import('./_generate-referral-pdf.js'),
  'generate-supervision-plan': () => import('./_generate-supervision-plan.js'),
  'generate-insurance-receipt':() => import('./_generate-insurance-receipt.js'),
  'redirect-prescription':     () => import('./_redirect-prescription.js'),
  'live-translate':            () => import('./_live-translate.js'),
  'transcribe-token':          () => import('./_transcribe-token.js'),
  'supervision':               () => import('./_supervision.js'),
  'hpi-search':                () => import('./_hpi-search.js'),
  'nhi-lookup':                () => import('./_nhi-lookup.js'),
  'hpi':                       () => import('./_hpi.js'),
  'pharmacy-contacts':         () => import('./_pharmacy-contacts.js'),
  'patient-heartbeat':         () => import('./_patient-heartbeat.js'),
  'encounter-action':          () => import('./_encounter-action.js'),
  'patient-documents':         () => import('./_patient-documents.js'),
  'patient-upload':            () => import('./_patient-upload.js'),
  'patient-allergens':         () => import('./_patient-allergens.js'),
  'patient-medications':       () => import('./_patient-medications.js'),
  'patient-conditions':        () => import('./_patient-conditions.js'),
  'provider-mfa':              () => import('./_provider-mfa.js'),
  'team-messages':             () => import('./_team-messages.js'),
  'join-room':                 () => import('./_join-room.js'),
  'notify-waitlist':           () => import('./_notify-waitlist.js'),
  'send-waitlist-email':       () => import('./_send-waitlist-email.js'),
  'push-subscribe':            () => import('./_push-subscribe.js'),
  'push-notify':               () => import('./_push-notify.js'),
  'provider-auth':             () => import('./_provider-auth.js'),
  'provider-list':             () => import('./_provider-list.js'),
  'provider-licenses':         () => import('./_provider-licenses.js'),
  'cron-expire-licenses':      () => import('./_cron-expire-licenses.js'),
  'cron-security-anomalies':   () => import('./_cron-security-anomalies.js'),
  'hl7-inbound':               () => import('./_hl7-inbound.js'),
  'hl7-file':                  () => import('./_hl7-file.js'),
  'provider-inbox':            () => import('./_provider-inbox.js'),
  'practice-seed':             () => import('./_practice-seed.js'),
  'practice-reset':            () => import('./_practice-reset.js'),
  'cron-unlock-reminders':     () => import('./_cron-unlock-reminders.js'),
  'geo-check':                 () => import('./_geo-check.js'),
  'provider-reset-request':    () => import('./_provider-reset-request.js'),
  'provider-reset-complete':   () => import('./_provider-reset-complete.js'),
  'send-email':                () => import('./_send-email.js'),
  'waitlist-signup':           () => import('./_waitlist-signup.js'),
  'au-waitlist':               () => import('./_au-waitlist.js'),
  'send-to-gp':                () => import('./_send-to-gp.js'),
  'transcribe':                () => import('./_transcribe.js'),
  'translate':                 () => import('./_translate.js'),
  'verify-acc':                () => import('./_verify-acc.js'),
  'schedule':                  () => import('./_schedule.js'),
  'cron-availability':         () => import('./_cron-availability.js'),
  'payroll':                   () => import('./_payroll.js'),
  'sms':                       () => import('./_sms.js'),
  'appointments':              () => import('./_appointments.js'),
  'audit':                     () => import('./_audit.js'),
  'dismiss-patient':           () => import('./_dismiss-patient.js'),
  'drug-interactions':         () => import('./_drug-interactions.js'),
  'incidents':                 () => import('./_incidents.js'),
  'consents':                  () => import('./_consents.js'),
  'bookings':                  () => import('./_bookings.js'),
  'complaints':                () => import('./_complaints.js'),
  'breach':                    () => import('./_breach.js'),
  'handover':                  () => import('./_handover.js'),
  'patient-flags':             () => import('./_patient-flags.js'),
  'consultation-token':        () => import('./_consultation-token.js'),
  'analytics-events':          () => import('./_analytics-events.js'),
  'set-availability':          () => import('./_set-availability.js'),
  'get-queue':                 () => import('./_get-queue.js'),
  'get-availability':          () => import('./_get-availability.js'),
  'confirm-waiting':           () => import('./_confirm-waiting.js'),
  'async-consult':             () => import('./_async-consult.js'),
  'admin-patch':               () => import('./_admin-patch.js'),
  'initiate-call':             () => import('./_initiate-call.js'),
  'ring-timeout':              () => import('./_ring-timeout.js'),
  'mark-no-show':              () => import('./_mark-no-show.js'),
  'make-call':                 () => import('./_make-call.js'),
  'acc-claims':                () => import('./_acc-claims.js'),
  'acc-webhook':               () => import('./_acc-webhook.js'),
  'pms-data':                  () => import('./_pms-data.js'),
  'validation-subjects':       () => import('./_validation-subjects.js'),
  'validation-readings':       () => import('./_validation-readings.js'),
  'model-version':             () => import('./_model-version.js'),
  'consultations':             () => import('./_consultations.js'),
  'create-consultation':       () => import('./_create-consultation.js'),
  'patient-consult':            () => import('./_patient-consult.js'),
  'patients':                  () => import('./_patients.js'),
  'prescriptions':             () => import('./_prescriptions.js'),
  'providers':                 () => import('./_providers.js'),
  'flags':                     () => import('./_flags.js'),
  'employers':                 () => import('./_employers.js'),
  'employer-employees':        () => import('./_employer-employees.js'),
  'audit-log':                 () => import('./_audit-log.js'),
  'radiology-referrals':       () => import('./_radiology-referrals.js'),
  'radiology-reports':         () => import('./_radiology-reports.js'),
  'telnyx-inbound-fax':        () => import('./_telnyx-inbound-fax.js'),
  'imaging-reviews':           () => import('./_imaging-reviews.js'),
  'imaging-review':            () => import('./_imaging-review.js'),
  'job-listings':              () => import('./_job-listings.js'),
  'clinic-schedule':           () => import('./_clinic-schedule.js'),
  'messages':                  () => import('./_messages.js'),
  'patients':                  () => import('./_patients.js'),
  'spo2-calibrations':         () => import('./_spo2-calibrations.js'),
  'job-applications':          () => import('./_job-applications.js'),
  'interview-join':            () => import('./_interview-join.js'),
  'patient-support':           () => import('./_patient-support.js'),
  'provider-notifications':    () => import('./_provider-notifications.js'),
}

export default async function handler(req, res) {
  const segments = req.query.route
  const route = Array.isArray(segments) ? segments[0] || segments.join('/') : segments
  // Client IP resolution — Cloudflare fronts the app on all three zones,
  // so prefer `cf-connecting-ip` (single, trusted, added by Cloudflare
  // after they see the true TCP peer). Fall back to XFF; when using XFF,
  // take the LAST entry, not the first: proxies append and clients can
  // spoof the leading value to bypass per-IP rate limits.
  const cfIp = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || null
  const xff = String(req.headers['x-forwarded-for'] || '')
  const ip = (
    (typeof cfIp === 'string' && cfIp) ||
    (xff && xff.split(',').map(s => s.trim()).filter(Boolean).slice(-1)[0]) ||
    req.socket?.remoteAddress ||
    'unknown'
  )

  setSecurityHeaders(res)

  // Parse JSON bodies manually (bodyParser is disabled globally to allow raw audio/multipart streams).
  // Also preserve the raw request bytes on req.rawBody so webhook endpoints
  // (ACC, Stripe, etc.) can verify HMAC signatures against the exact bytes
  // the sender signed. JSON.stringify(req.body) is NOT byte-identical to the
  // sender's payload (key ordering, whitespace, escaping all differ) so it
  // cannot be substituted. Pen-test P2 deferred item #316.
  //
  // Body-size cap (pen-test #315-F11). Most routes expect small payloads;
  // patient-upload / patient-documents pass their own base64-encoded files
  // which the endpoint caps separately. Streaming abort at 4 MB defeats
  // memory-DoS via a huge JSON body pointed at e.g. /api/waitlist-signup.
  const BODY_MAX_BYTES = 4 * 1024 * 1024
  const ct = req.headers['content-type'] || ''
  if (req.method !== 'GET' && !ct.startsWith('multipart/form-data') && !ct.startsWith('audio/')) {
    const parsed = await new Promise((resolve, reject) => {
      const chunks = []
      let total = 0
      let over = false
      req.on('data', c => {
        if (over) return
        total += c.length
        if (total > BODY_MAX_BYTES) {
          over = true
          req.destroy()
          reject(new Error('BODY_TOO_LARGE'))
          return
        }
        chunks.push(c)
      })
      req.on('end', () => {
        if (over) return
        const raw = Buffer.concat(chunks).toString('utf-8')
        req.rawBody = raw
        if (!raw) return resolve({})
        if (ct.includes('application/json')) {
          try { resolve(JSON.parse(raw)) } catch { resolve({}) }
        } else {
          resolve(raw)
        }
      })
      req.on('error', reject)
    }).catch(err => {
      if (err?.message === 'BODY_TOO_LARGE') {
        res.status(413).json({ error: 'Request body exceeds 4MB limit' })
        return null
      }
      throw err
    })
    if (parsed === null) return  // 413 already sent
    req.body = parsed
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  // Provider-only routes get guardProvider (Supabase JWT OR x-provider-id from
  // sessionStorage) applied at the router. Public patient-facing routes,
  // Stripe/Telnyx/ACC webhooks, cron jobs, and login endpoints are omitted.
  //
  // The old x-tere-api-key check is gone — it was a shared secret baked into
  // the client bundle, so it never provided real protection. Real security is
  // now per-endpoint: guardProvider (for provider work), token verification
  // (for /api/consultation-token patient view), CRON_SECRET (for cron routes),
  // Telnyx/Stripe signature verification (for webhooks), and rate-limits + a
  // narrow column allowlist for the anonymous patient flow endpoints.
  if (AUTH_REQUIRED_ROUTES.has(route)) {
    const { guardProvider } = await import('./_auth.js')
    const auth = await guardProvider(req, res)
    if (!auth) return
    req.auth = auth
  }

  // ── Rate limiting ───────────────────────────────────────────────────────────
  // Three buckets keyed per-IP so a NAT'd household or corporate edge doesn't
  // trip everyone at once, and provider-authed traffic isn't clamped by anon-
  // burst limits.
  //   pay:  50/hr        — card-testing prevention on payment routes
  //   auth: 1200/15min   — provider-authed routes (we know who they are; SPA
  //                        hydration + realtime polling burns fast)
  //   gen:  400/15min    — anon routes (triage, consent, pharmacies etc.);
  //                        was 100 which failed real patients on NAT'd IPs
  const isPayment = PAYMENT_ROUTES.has(route)
  const isAuthed  = AUTH_REQUIRED_ROUTES.has(route)
  const limited = isPayment
    ? checkRateLimit(`pay:${ip}`, 50, 60 * 60 * 1000)
    : isAuthed
      ? checkRateLimit(`auth:${ip}`, 1200, 15 * 60 * 1000)
      : checkRateLimit(`gen:${ip}`, 400, 15 * 60 * 1000)
  if (limited) {
    logRequest(ip, route, 429, 'rate_limited')
    res.setHeader('Retry-After', isPayment ? '3600' : '900')
    return res.status(429).json({ error: 'Too many requests' })
  }

  const loader = ROUTES[route]
  if (!loader) {
    logRequest(ip, route, 404)
    return res.status(404).json({ error: 'Not found', route })
  }

  try {
    const mod = await loader()
    const fn = typeof mod.default === 'function' ? mod.default : mod
    // Wrap res to capture status for logging
    const originalJson = res.json.bind(res)
    const originalStatus = res.status.bind(res)
    let statusCode = 200
    res.status = (code) => { statusCode = code; return originalStatus(code) }
    res.json = (body) => {
      logRequest(ip, route, statusCode)
      // Track provider auth failures
      if (route === 'provider-auth' && statusCode === 401) {
        trackAuthFailure(ip, req.headers['user-agent'])
      }
      return originalJson(body)
    }
    return await fn(req, res)
  } catch (e) {
    logRequest(ip, route, 500, e.message)
    console.error(`[${route}]`, e)
    return res.status(500).json({ error: 'Server error' })
  }
}

function logRequest(ip, route, status, note) {
  const entry = { ts: new Date().toISOString(), ip, route, status }
  if (note) entry.note = note
  // Never log PHI — only structural metadata
  console.log(JSON.stringify(entry))
}
