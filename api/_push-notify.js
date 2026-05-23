import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  'mailto:terehealthnz@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const NOTIFICATION_TYPES = {
  new_patient:           (d) => ({ title: `New patient — ${d.patientName}`, body: d.chiefComplaint + (d.accEligible ? ' · ACC likely' : ''), requireInteraction: true,  url: '/provider', tag: `new-${d.consultationId}` }),
  vitals_ready:          (d) => ({ title: `Vitals ready — ${d.patientName}`,     body: d.vitals || 'Patient has completed vitals scan',                                   requireInteraction: false, url: `/provider/consult/${d.consultationId}`, tag: `vitals-${d.consultationId}` }),
  prescription_approval: (d) => ({ title: 'Prescription approval needed',         body: `${d.drug} for ${d.patientName}`,                                                 requireInteraction: true,  url: '/admin', tag: `rx-${d.draftId}` }),
  new_message:           (d) => ({ title: `New message — ${d.patientName}`,       body: d.chiefComplaint,                                                                 requireInteraction: false, url: '/provider', tag: `msg-${d.consultationId}` }),
  waitlist_open:         (d) => ({ title: 'Clinic opened — waitlist notified',    body: `${d.count} patient${d.count !== 1 ? 's' : ''} emailed`,                          requireInteraction: false, url: '/admin', tag: 'waitlist-open' }),
  new_employer_enquiry:  (d) => ({ title: `New employer enquiry — ${d.company}`,  body: d.contact ? `From ${d.contact}` : 'Check the employers tab',                      requireInteraction: true,  url: '/admin', tag: `employer-${d.company}` }),
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { type = 'new_patient', providerId, ...data } = req.body || {}

  const buildPayload = NOTIFICATION_TYPES[type]
  if (!buildPayload) return res.status(400).json({ error: 'Unknown notification type' })

  const notification = buildPayload(data)

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Get subscriptions — target specific provider or all available providers
    let query = supabase.from('push_subscriptions').select('endpoint, subscription')
    if (providerId) query = query.eq('provider_id', providerId)

    const { data: subs } = await query
    if (!subs?.length) return res.json({ ok: true, sent: 0 })

    const payload = JSON.stringify(notification)
    const dead = []
    let sent = 0

    await Promise.allSettled(
      subs.map(async ({ endpoint, subscription }) => {
        try {
          await webpush.sendNotification(subscription, payload)
          sent++
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) dead.push(endpoint)
        }
      })
    )

    // Clean up expired subscriptions
    if (dead.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', dead)
    }

    res.json({ ok: true, sent })
  } catch (e) {
    console.error('push-notify error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
