import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { providerId, userId, consultationId, subscription, token, platform } = req.body || {}

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    if (platform === 'ios' || platform === 'android') {
      // Native Capacitor push — store FCM/APNs token
      if (!token) return res.status(400).json({ error: 'Missing token' })
      const conflictCol = consultationId ? 'consultation_id,platform' : 'user_id,platform'
      await supabase.from('push_subscriptions').upsert({
        user_id:         userId || providerId || null,
        consultation_id: consultationId || null,
        provider_id:     providerId || null,
        token,
        platform,
        updated_at:      new Date().toISOString(),
      }, { onConflict: conflictCol })
    } else {
      // Web push — store VAPID subscription object
      if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' })
      await supabase.from('push_subscriptions').upsert({
        provider_id:     providerId || null,
        user_id:         userId || providerId || null,
        consultation_id: consultationId || null,
        endpoint:        subscription.endpoint,
        subscription,
        platform:        'web',
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'endpoint' })
    }

    res.json({ ok: true })
  } catch (e) {
    console.error('push-subscribe error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
