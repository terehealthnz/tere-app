// POST /api/transcribe-token
//
// Pre-signs an AWS Transcribe streaming WebSocket URL for the caller and
// returns it. Client opens the WebSocket directly against AWS — no browser
// credentials, no proxy, no per-day cap (Deepgram's 100 keys/day limit was
// what forced this migration; see api/_deepgram-token.js history).
//
// Auth:
//   • Provider path — x-provider-id / JWT via guardProvider.
//   • Patient path  — body { consultationId }; server verifies the consult
//                     exists AND status='in_progress'.
//
// Request body (in addition to consultationId): { languageCode, sampleRate }.
//   - languageCode: AWS Transcribe streaming code (e.g. 'en-US', 'es-US',
//                   'ja-JP'). Server refuses if unsupported (mi/sm/ar/…).
//   - sampleRate:   16000 for our linear16 PCM pipe.
//
// AWS Transcribe streaming uses SigV4 pre-signed URL auth over WebSocket:
//   wss://transcribestreaming.<region>.amazonaws.com:8443/stream-transcription-websocket?...
// See:
//   https://docs.aws.amazon.com/transcribe/latest/dg/websocket.html
//
// The URL is valid for 300s from signing. Client should open the WS
// immediately after fetching. If the WS drops mid-consult, the client
// refetches a fresh URL.

import { createClient } from '@supabase/supabase-js'
import { createHash, createHmac } from 'node:crypto'
import { guardProvider } from './_auth.js'

// AWS Transcribe streaming languages we officially expose. Māori (mi),
// Samoan (sm), Arabic streaming (partial ar), and Hindi streaming (limited
// hi at time of writing) are intentionally excluded — the client-side
// LiveSubtitles component shows a "no AI subtitles — Language Line NZ"
// fallback for these languages.
const SUPPORTED_LANGUAGES = new Set([
  'en-US', 'en-GB', 'en-AU',
  'es-US', 'es-ES',
  'fr-FR', 'fr-CA',
  'de-DE',
  'nl-NL',
  'it-IT',
  'pt-BR', 'pt-PT',
  'ja-JP',
  'ko-KR',
  'zh-CN',
])

function iso8601Basic(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function shortDate(date) {
  return iso8601Basic(date).slice(0, 8)
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest()
}

function hmacHex(key, data) {
  return createHmac('sha256', key).update(data).digest('hex')
}

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex')
}

// SigV4 pre-signed URL for the Transcribe streaming WebSocket endpoint.
// Query-string signing (not header signing) — the browser can only open the
// URL, it can't attach custom headers to a WebSocket handshake.
function presignTranscribeStreamUrl({
  accessKeyId, secretAccessKey, region,
  languageCode, sampleRate, mediaEncoding = 'pcm',
}) {
  const service = 'transcribe'
  const method = 'GET'
  const host = `transcribestreaming.${region}.amazonaws.com:8443`
  const path = '/stream-transcription-websocket'
  const now = new Date()
  const amzDate = iso8601Basic(now)
  const date = shortDate(now)
  const credential = `${accessKeyId}/${date}/${region}/${service}/aws4_request`

  const queryParams = {
    'X-Amz-Algorithm':      'AWS4-HMAC-SHA256',
    'X-Amz-Credential':     credential,
    'X-Amz-Date':           amzDate,
    'X-Amz-Expires':        '300',
    'X-Amz-SignedHeaders':  'host',
    'language-code':        languageCode,
    'media-encoding':       mediaEncoding,
    'sample-rate':          String(sampleRate),
  }

  const canonicalQuery = Object.keys(queryParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&')

  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'
  const payloadHash = sha256Hex('') // empty payload for GET

  const canonicalRequest = [
    method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate,
    `${date}/${region}/${service}/aws4_request`,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const kDate    = hmac(`AWS4${secretAccessKey}`, date)
  const kRegion  = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = hmacHex(kSigning, stringToSign)

  return `wss://${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Provider path: try JWT/x-provider-id; if that fails, fall through to the
  // patient path which verifies a live consult.
  let auth = null
  try { auth = await guardProvider(req, { status: () => ({ json: () => {}, end: () => {} }) }) } catch {}
  if (!auth) {
    const { consultationId } = req.body || {}
    if (!consultationId) return res.status(401).json({ error: 'consultationId required for patient path' })
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: consult } = await supabase
      .from('consultations')
      .select('status')
      .eq('id', consultationId)
      .maybeSingle()
    if (!consult || consult.status !== 'in_progress') {
      return res.status(403).json({ error: 'Transcribe URLs only available while consult is in_progress' })
    }
  }

  const { languageCode, sampleRate = 16000 } = req.body || {}
  if (!languageCode) return res.status(400).json({ error: 'languageCode required' })
  if (!SUPPORTED_LANGUAGES.has(languageCode)) {
    return res.status(400).json({
      error: 'Language not supported by AWS Transcribe streaming',
      languageCode,
      hint: 'For Māori, Samoan or Arabic, route to Language Line NZ.',
    })
  }

  const accessKeyId     = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const region          = process.env.AWS_REGION || 'ap-southeast-2'
  if (!accessKeyId || !secretAccessKey) {
    return res.status(500).json({ error: 'AWS credentials not configured' })
  }

  try {
    const url = presignTranscribeStreamUrl({
      accessKeyId, secretAccessKey, region,
      languageCode, sampleRate: Number(sampleRate),
    })
    return res.status(200).json({ url, region, expires_in: 300 })
  } catch (e) {
    return res.status(500).json({ error: 'Failed to pre-sign Transcribe URL', detail: e.message })
  }
}
