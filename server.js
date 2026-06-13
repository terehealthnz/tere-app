import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local', override: true })
const app = express()
app.use(cors())
app.use(express.json())

const apis = [
  'analytics-events',
  'appointments',
  'approve-draft',
  'assess-acc',
  'async-consult',
  'async-overdue',
  'audit',
  'bookings',
  'breach',
  'cancel-payment',
  'capture-payment',
  'change-password',
  'complaints',
  'confirm-waiting',
  'consents',
  'consultation-token',
  'convert-to-acc',
  'create-payment-intent',
  'create-room',
  'cron-availability',
  'dismiss-patient',
  'drug-interactions',
  'employer-check',
  'generate-med-cert',
  'generate-notes',
  'generate-prescription-pdf',
  'generate-referral-pdf',
  'get-availability',
  'get-queue',
  'handover',
  'hpi-search',
  'incidents',
  'initiate-call',
  'join-room',
  'notify-waitlist',
  'patient-flags',
  'payroll',
  'provider-auth',
  'provider-notifications',
  'push-notify',
  'push-subscribe',
  'schedule',
  'send-email',
  'send-to-gp',
  'send-waitlist-email',
  'set-availability',
  'set-provider-avail',
  'sms',
  'status',
  'transcribe',
  'translate',
  'twilio-connect',
  'twilio-fallback',
  'twilio-status',
  'make-call',
  'verify-acc',
  'acc-claims',
  'acc-webhook',
  'pms-data',
]

const GET_ONLY = new Set(['get-queue', 'get-availability', 'async-overdue', 'status', 'pms-data'])
const DUAL_METHOD = new Set([
  'analytics-events', 'appointments', 'audit', 'breach', 'consents',
  'complaints', 'bookings', 'handover', 'consultation-token', 'patient-flags',
  'incidents', 'provider-notifications', 'schedule', 'payroll',
])

for (const name of apis) {
  try {
    const mod = await import(`./api/_${name}.js`)
    if (GET_ONLY.has(name)) {
      app.get(`/api/${name}`, mod.default)
    } else if (DUAL_METHOD.has(name)) {
      app.all(`/api/${name}`, mod.default)
    } else {
      app.post(`/api/${name}`, mod.default)
    }
    console.log(`✓ /api/${name}`)
  } catch (e) {
    console.log(`✗ /api/${name}: ${e.message}`)
  }
}

app.listen(3002, () => console.log('API server on port 3002'))
