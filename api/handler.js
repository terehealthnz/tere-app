// Single Vercel serverless function — lazy-loads only the requested handler
// bodyParser disabled so multipart streams reach _transcribe.js intact via formidable
export const config = { api: { bodyParser: false } }

// Routes that require an authenticated provider (Supabase JWT OR sessionStorage
// x-provider-id). Everything not in this set is either patient-facing (with its
// own guards inside the endpoint — token verification, column allowlist,
// rate-limit), a public info endpoint, a webhook (Stripe/Twilio/ACC signature
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
  'audit-log', 'radiology-referrals', 'clinic-schedule',
  'supervision',
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
  'schedule', 'set-availability', 'set-provider-avail',
  // Approvals + admin
  'approve-draft', 'admin-patch', 'audit', 'payroll',
  'incidents', 'complaints', 'breach', 'handover', 'patient-flags',
  // Data integrations (provider-triggered)
  'pms-data',
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
const AUTH_FAILURES = { count: 0, windowStart: Date.now(), alertSent: false }
const AUTH_FAIL_WINDOW_MS = 60 * 60 * 1000 // 1 hour

async function trackAuthFailure(ip) {
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
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: 'terehealthnz@gmail.com',
        subject: '[ALERT] 10+ failed auth attempts in the last hour',
        text: `Security alert: ${AUTH_FAILURES.count} failed provider auth attempts from IPs including ${ip} in the last hour. Please review access logs.`,
      })
    } catch {}
  }
}

// ── Security headers ──────────────────────────────────────────────────────────
function setSecurityHeaders(res) {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co wss://*.livekit.cloud https://api.daily.co https://cdn.jsdelivr.net https://storage.googleapis.com",
      "frame-src 'none'",
      "object-src 'none'",
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
  'windcave-fprn':             () => import('./_windcave-fprn.js'),
  'windcave-query':            () => import('./_windcave-query.js'),
  'windcave-complete':         () => import('./_windcave-complete.js'),
  'windcave-refund':           () => import('./_windcave-refund.js'),
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
  'join-room':                 () => import('./_join-room.js'),
  'notify-waitlist':           () => import('./_notify-waitlist.js'),
  'send-waitlist-email':       () => import('./_send-waitlist-email.js'),
  'push-subscribe':            () => import('./_push-subscribe.js'),
  'push-notify':               () => import('./_push-notify.js'),
  'provider-auth':             () => import('./_provider-auth.js'),
  'send-email':                () => import('./_send-email.js'),
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
  'bedrock-test':              () => import('./_bedrock-test.js'),
  'set-availability':          () => import('./_set-availability.js'),
  'set-provider-avail':        () => import('./_set-provider-avail.js'),
  'get-queue':                 () => import('./_get-queue.js'),
  'get-availability':          () => import('./_get-availability.js'),
  'confirm-waiting':           () => import('./_confirm-waiting.js'),
  'async-consult':             () => import('./_async-consult.js'),
  'async-overdue':             () => import('./_async-overdue.js'),
  'admin-patch':               () => import('./_admin-patch.js'),
  'initiate-call':             () => import('./_initiate-call.js'),
  'ring-timeout':              () => import('./_ring-timeout.js'),
  'mark-no-show':              () => import('./_mark-no-show.js'),
  'make-call':                 () => import('./_make-call.js'),
  'twilio-connect':            () => import('./_twilio-connect.js'),
  'twilio-fallback':           () => import('./_twilio-fallback.js'),
  'twilio-status':             () => import('./_twilio-status.js'),
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
  'job-listings':              () => import('./_job-listings.js'),
  'clinic-schedule':           () => import('./_clinic-schedule.js'),
  'messages':                  () => import('./_messages.js'),
  'patients':                  () => import('./_patients.js'),
  'spo2-calibrations':         () => import('./_spo2-calibrations.js'),
  'job-applications':          () => import('./_job-applications.js'),
  'patient-support':           () => import('./_patient-support.js'),
  'provider-notifications':    () => import('./_provider-notifications.js'),
}

export default async function handler(req, res) {
  const segments = req.query.route
  const route = Array.isArray(segments) ? segments[0] || segments.join('/') : segments
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()

  setSecurityHeaders(res)

  // Parse JSON bodies manually (bodyParser is disabled globally to allow raw audio/multipart streams)
  const ct = req.headers['content-type'] || ''
  if (req.method !== 'GET' && !ct.startsWith('multipart/form-data') && !ct.startsWith('audio/')) {
    req.body = await new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        if (!raw) return resolve({})
        if (ct.includes('application/json')) {
          try { resolve(JSON.parse(raw)) } catch { resolve({}) }
        } else {
          resolve(raw)
        }
      })
      req.on('error', reject)
    })
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  // Provider-only routes get guardProvider (Supabase JWT OR x-provider-id from
  // sessionStorage) applied at the router. Public patient-facing routes,
  // Stripe/Twilio/ACC webhooks, cron jobs, and login endpoints are omitted.
  //
  // The old x-tere-api-key check is gone — it was a shared secret baked into
  // the client bundle, so it never provided real protection. Real security is
  // now per-endpoint: guardProvider (for provider work), token verification
  // (for /api/consultation-token patient view), CRON_SECRET (for cron routes),
  // Twilio/Stripe signature verification (for webhooks), and rate-limits + a
  // narrow column allowlist for the anonymous patient flow endpoints.
  if (AUTH_REQUIRED_ROUTES.has(route)) {
    // Windcave cert testing bypass — only for windcave-complete + windcave-refund.
    // Windcave certification requires running Complete/Refund tests against our
    // integration and uploading logs. Rather than share provider credentials,
    // we accept an X-Cert-Test-Key header matching WINDCAVE_CERT_TEST_KEY env
    // var (a random UUID). This bypass ships alongside the cert submission
    // and MUST be removed post-cert (see task queue).
    const CERT_ROUTES = new Set(['windcave-complete', 'windcave-refund'])
    const certKey = process.env.WINDCAVE_CERT_TEST_KEY
    const providedCertKey = req.headers['x-cert-test-key']
    const isCertBypass = CERT_ROUTES.has(route) && certKey && providedCertKey === certKey
    if (isCertBypass) {
      req.auth = { source: 'windcave-cert-test' }
    } else {
      const { guardProvider } = await import('./_auth.js')
      const auth = await guardProvider(req, res)
      if (!auth) return  // guardProvider already sent the 401/403
      req.auth = auth
    }
  }

  // ── Rate limiting ───────────────────────────────────────────────────────────
  const isPayment = PAYMENT_ROUTES.has(route)
  const limited = isPayment
    ? checkRateLimit(`pay:${ip}`, 50, 60 * 60 * 1000)          // 50/hr per IP — allows a NAT'd household + a few retries; still stops card-testing bots
    : checkRateLimit(`gen:${ip}`, 100, 15 * 60 * 1000)          // 100/15min per IP
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
        trackAuthFailure(ip)
      }
      return originalJson(body)
    }
    return await fn(req, res)
  } catch (e) {
    logRequest(ip, route, 500, e.message)
    console.error(`[${route}]`, e)
    return res.status(500).json({ error: e.message })
  }
}

function logRequest(ip, route, status, note) {
  const entry = { ts: new Date().toISOString(), ip, route, status }
  if (note) entry.note = note
  // Never log PHI — only structural metadata
  console.log(JSON.stringify(entry))
}
