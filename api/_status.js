import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const checks = await Promise.allSettled([
    // Database
    (async () => {
      const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { error } = await supabase.from('consultations').select('id').limit(1)
      return { name: 'database', ok: !error, detail: error?.message }
    })(),
    // AI (AWS Bedrock, BAA-covered)
    (async () => {
      const ok = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
      return { name: 'ai', ok, detail: ok ? null : 'Bedrock credentials not configured' }
    })(),
    // Payments (Stripe)
    (async () => {
      const key = process.env.STRIPE_SECRET_KEY
      return { name: 'payments', ok: !!key, detail: key ? null : 'Not configured' }
    })(),
    // Email (Resend)
    (async () => {
      const key = process.env.RESEND_API_KEY
      return { name: 'email', ok: !!key, detail: key ? null : 'Not configured' }
    })(),
  ])

  const services = checks.map(r => r.status === 'fulfilled' ? r.value : { name: 'unknown', ok: false, detail: r.reason?.message })
  const allOk = services.every(s => s.ok)

  res.setHeader('Cache-Control', 'no-store')
  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'operational' : 'degraded',
    services,
    checked_at: new Date().toISOString(),
  })
}
