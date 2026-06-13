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
  shift_started:         (d) => ({ title: 'Your shift has started — clinic open', body: d.providerNames ? `${d.providerNames.join(', ')} now available` : 'Clinic is now open', requireInteraction: false, url: '/provider', tag: 'shift-started' }),
  clinic_closed:         (d) => ({ title: 'Clinic closed automatically',           body: d.nextAvail ? `Next: ${d.nextAvail}` : 'No providers scheduled',                  requireInteraction: false, url: '/admin',   tag: 'clinic-closed' }),
  no_coverage:           (d) => ({ title: 'Coverage gap — no provider scheduled',  body: (d.days || []).join(', '),                                                          requireInteraction: true,  url: '/admin/schedule', tag: 'no-coverage' }),
  shift_offer:           (d) => ({ title: `Shift offered by ${d.fromName}`,        body: `${d.shiftDate} ${d.startTime?.slice(0,5)}–${d.endTime?.slice(0,5)}`,              requireInteraction: true,  url: '/provider/schedule', tag: `offer-${d.shiftDate}` }),
  shift_reminder:        (d) => ({ title: `Shift in 1 hour — ${d.startTime}`,      body: 'Your shift starts soon. Clinic will open automatically.',                         requireInteraction: false, url: '/provider', tag: `reminder-${d.shiftDate}` }),
  patient_called:        (d) => ({ title: 'Doctor is ready for you',               body: d.providerName ? `${d.providerName} is calling — tap to join` : 'Tap to join your consultation', requireInteraction: true, url: d.consultUrl || '/patient', tag: `call-${d.consultationId}` }),
}

// ── Firebase Admin (lazy-loaded to avoid startup cost when unused) ────────────
let firebaseApp = null
async function getFirebaseMessaging() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null
  if (!firebaseApp) {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app')
    const { getMessaging } = await import('firebase-admin/messaging')
    if (!getApps().length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      firebaseApp = initializeApp({ credential: cert(serviceAccount) })
    } else {
      firebaseApp = getApps()[0]
    }
    const { getMessaging: gm } = await import('firebase-admin/messaging')
    firebaseApp._messaging = gm(firebaseApp)
  }
  const { getMessaging } = await import('firebase-admin/messaging')
  return getMessaging(firebaseApp)
}

async function sendNative(tokens, notification) {
  const messaging = await getFirebaseMessaging()
  if (!messaging || !tokens.length) return { sent: 0, dead: [] }

  const dead = []
  let sent = 0

  await Promise.allSettled(
    tokens.map(async ({ token }) => {
      try {
        await messaging.send({
          token,
          notification: { title: notification.title, body: notification.body },
          data: { url: notification.url || '', tag: notification.tag || '' },
          apns: {
            payload: { aps: { sound: 'default', badge: 1 } },
          },
          android: {
            priority: notification.requireInteraction ? 'high' : 'normal',
          },
        })
        sent++
      } catch (e) {
        // Token expired or invalid
        if (e.code === 'messaging/registration-token-not-registered' || e.code === 'messaging/invalid-registration-token') {
          dead.push(token)
        }
      }
    })
  )

  return { sent, dead }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { type = 'new_patient', providerId, userId, consultationId, ...data } = req.body || {}

  const buildPayload = NOTIFICATION_TYPES[type]
  if (!buildPayload) return res.status(400).json({ error: 'Unknown notification type' })

  const notification = buildPayload(data)

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Target by consultationId (patient), userId, or providerId (provider)
    let query = supabase.from('push_subscriptions').select('endpoint, subscription, token, platform')
    if (consultationId) query = query.eq('consultation_id', consultationId)
    else if (userId) query = query.eq('user_id', userId)
    else if (providerId) query = query.eq('provider_id', providerId)

    const { data: subs } = await query
    if (!subs?.length) return res.json({ ok: true, sent: 0 })

    const webSubs    = subs.filter(s => s.platform === 'web' || (!s.platform && s.endpoint))
    const nativeSubs = subs.filter(s => s.platform === 'ios' || s.platform === 'android')

    const payload = JSON.stringify(notification)
    const deadEndpoints = []
    let sent = 0

    // ── Web push ──────────────────────────────────────────────────────────────
    await Promise.allSettled(
      webSubs.map(async ({ endpoint, subscription }) => {
        try {
          await webpush.sendNotification(subscription, payload)
          sent++
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) deadEndpoints.push(endpoint)
        }
      })
    )

    // ── Native push ───────────────────────────────────────────────────────────
    const { sent: nativeSent, dead: deadTokens } = await sendNative(nativeSubs, notification)
    sent += nativeSent

    // Clean up expired subscriptions
    if (deadEndpoints.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', deadEndpoints)
    }
    if (deadTokens.length) {
      await supabase.from('push_subscriptions').delete().in('token', deadTokens)
    }

    res.json({ ok: true, sent })
  } catch (e) {
    console.error('push-notify error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
