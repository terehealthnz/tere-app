import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { providerId, subscription } = req.body || {}
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' })

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    await supabase.from('push_subscriptions').upsert({
      provider_id:  providerId || null,
      endpoint:     subscription.endpoint,
      subscription,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'endpoint' })

    res.json({ ok: true })
  } catch (e) {
    console.error('push-subscribe error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
