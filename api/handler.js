// Single Vercel serverless function — lazy-loads only the requested handler

// ── Rate limiting (in-memory, per instance) ──────────────────────────────────
const RATE_WINDOWS = new Map() // key → { count, reset }
const PAYMENT_ROUTES = new Set(['create-payment-intent', 'capture-payment', 'cancel-payment'])

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
        from: 'security@terehealth.co.nz',
        to: 'admin@terehealth.co.nz',
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
      "connect-src 'self' https://*.supabase.co wss://*.livekit.cloud https://api.daily.co https://api.anthropic.com",
      "frame-src 'none'",
      "object-src 'none'",
    ].join('; ')
  )
}

const ROUTES = {
  'approve-draft':             () => import('./_approve-draft.js'),
  'change-password':           () => import('./_change-password.js'),
  'cancel-payment':            () => import('./_cancel-payment.js'),
  'capture-payment':           () => import('./_capture-payment.js'),
  'create-payment-intent':     () => import('./_create-payment-intent.js'),
  'create-room':               () => import('./_create-room.js'),
  'employer-check':            () => import('./_employer-check.js'),
  'generate-med-cert':         () => import('./_generate-med-cert.js'),
  'generate-notes':            () => import('./_generate-notes.js'),
  'generate-prescription-pdf': () => import('./_generate-prescription-pdf.js'),
  'generate-referral-pdf':     () => import('./_generate-referral-pdf.js'),
  'hpi-search':                () => import('./_hpi-search.js'),
  'join-room':                 () => import('./_join-room.js'),
  'notify-waitlist':           () => import('./_notify-waitlist.js'),
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
  'drug-interactions':         () => import('./_drug-interactions.js'),
  'incidents':                 () => import('./_incidents.js'),
  'consents':                  () => import('./_consents.js'),
  'complaints':                () => import('./_complaints.js'),
  'breach':                    () => import('./_breach.js'),
  'handover':                  () => import('./_handover.js'),
  'patient-flags':             () => import('./_patient-flags.js'),
  'consultation-token':        () => import('./_consultation-token.js'),
  'analytics-events':          () => import('./_analytics-events.js'),
  'status':                    () => import('./_status.js'),
}

export default async function handler(req, res) {
  const segments = req.query.route
  const route = Array.isArray(segments) ? segments[0] || segments.join('/') : segments
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()

  setSecurityHeaders(res)

  // ── API key check (cron-availability uses its own auth) ─────────────────────
  const expectedKey = process.env.TERE_API_KEY
  const providedKey = req.headers['x-tere-api-key']
  if (route !== 'cron-availability' && expectedKey && providedKey !== expectedKey) {
    logRequest(ip, route, 401, 'api_key_invalid')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // ── Rate limiting ───────────────────────────────────────────────────────────
  const isPayment = PAYMENT_ROUTES.has(route)
  const limited = isPayment
    ? checkRateLimit(`pay:${ip}`, 10, 60 * 60 * 1000)          // 10/hr per IP
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
