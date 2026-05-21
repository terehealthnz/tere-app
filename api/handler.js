// Single Vercel serverless function — lazy-loads only the requested handler
const ROUTES = {
  'approve-draft':             () => import('./_approve-draft.js'),
  'cancel-payment':            () => import('./_cancel-payment.js'),
  'capture-payment':           () => import('./_capture-payment.js'),
  'create-payment-intent':     () => import('./_create-payment-intent.js'),
  'create-room':               () => import('./_create-room.js'),
  'employer-check':            () => import('./_employer-check.js'),
  'generate-notes':            () => import('./_generate-notes.js'),
  'generate-prescription-pdf': () => import('./_generate-prescription-pdf.js'),
  'generate-referral-pdf':     () => import('./_generate-referral-pdf.js'),
  'hpi-search':                () => import('./_hpi-search.js'),
  'join-room':                 () => import('./_join-room.js'),
  'notify-waitlist':           () => import('./_notify-waitlist.js'),
  'provider-auth':             () => import('./_provider-auth.js'),
  'send-email':                () => import('./_send-email.js'),
  'send-to-gp':                () => import('./_send-to-gp.js'),
  'transcribe':                () => import('./_transcribe.js'),
  'translate':                 () => import('./_translate.js'),
  'verify-acc':                () => import('./_verify-acc.js'),
}

export default async function handler(req, res) {
  const segments = req.query.route
  const route = Array.isArray(segments) ? segments[0] || segments.join('/') : segments
  const loader = ROUTES[route]
  if (!loader) return res.status(404).json({ error: 'Not found', route })
  try {
    const mod = await loader()
    const fn = typeof mod.default === 'function' ? mod.default : mod
    return await fn(req, res)
  } catch (e) {
    console.error(`[${route}]`, e)
    return res.status(500).json({ error: e.message })
  }
}
