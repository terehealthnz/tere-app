import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json())

const apis = [
  'create-room',
  'join-room',
  'transcribe',
  'generate-notes',
  'send-email',
  'verify-acc',
  'create-payment-intent',
  'capture-payment',
  'cancel-payment',
  'notify-waitlist',
  'provider-auth',
  'hpi-search',
  'generate-prescription-pdf',
  'generate-referral-pdf',
  'approve-draft',
  'translate',
  'send-to-gp',
  'employer-check',
]

for (const name of apis) {
  try {
    const mod = await import(`./api/${name}.js`)
    app.post(`/api/${name}`, mod.default)
    console.log(`✓ /api/${name}`)
  } catch (e) {
    console.log(`✗ /api/${name}: ${e.message}`)
  }
}

app.listen(3002, () => console.log('API server on port 3002'))
