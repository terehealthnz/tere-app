// Single Vercel serverless function — routes all /api/* requests
import approveHandler          from './_approve-draft.js'
import cancelHandler           from './_cancel-payment.js'
import captureHandler          from './_capture-payment.js'
import createPaymentHandler    from './_create-payment-intent.js'
import createRoomHandler       from './_create-room.js'
import employerCheckHandler    from './_employer-check.js'
import generateNotesHandler    from './_generate-notes.js'
import generateRxHandler       from './_generate-prescription-pdf.js'
import generateRefHandler      from './_generate-referral-pdf.js'
import hpiHandler              from './_hpi-search.js'
import joinRoomHandler         from './_join-room.js'
import notifyWaitlistHandler   from './_notify-waitlist.js'
import providerAuthHandler     from './_provider-auth.js'
import sendEmailHandler        from './_send-email.js'
import sendToGpHandler         from './_send-to-gp.js'
import transcribeHandler       from './_transcribe.js'
import translateHandler        from './_translate.js'
import verifyAccHandler        from './_verify-acc.js'

const ROUTES = {
  'approve-draft':               approveHandler,
  'cancel-payment':              cancelHandler,
  'capture-payment':             captureHandler,
  'create-payment-intent':       createPaymentHandler,
  'create-room':                 createRoomHandler,
  'employer-check':              employerCheckHandler,
  'generate-notes':              generateNotesHandler,
  'generate-prescription-pdf':   generateRxHandler,
  'generate-referral-pdf':       generateRefHandler,
  'hpi-search':                  hpiHandler,
  'join-room':                   joinRoomHandler,
  'notify-waitlist':             notifyWaitlistHandler,
  'provider-auth':               providerAuthHandler,
  'send-email':                  sendEmailHandler,
  'send-to-gp':                  sendToGpHandler,
  'transcribe':                  transcribeHandler,
  'translate':                   translateHandler,
  'verify-acc':                  verifyAccHandler,
}

export default async function handler(req, res) {
  const segments = req.query.path
  const route = Array.isArray(segments) ? segments.join('/') : segments
  const fn = ROUTES[route]
  if (!fn) return res.status(404).json({ error: 'Not found' })
  return fn(req, res)
}
