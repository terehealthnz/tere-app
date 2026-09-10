// Scribe transcription — AWS Transcribe batch (ap-southeast-2).
//
// Flow: client POSTs the recorded consult audio blob (audio/webm+opus) to
// this endpoint. We upload to S3, kick off StartTranscriptionJob, and return
// the job name so the client can poll /api/transcribe-status until done.
//
// Previously called Deepgram Nova-3 Medical synchronously (Sep 2026). We
// migrated off Deepgram to keep PHI-heavy consult audio inside the AWS BAA
// umbrella already covering Bedrock, Chime, SES, and S3.
//
// Region: transcription + S3 bucket are both in ap-southeast-2 (Sydney) so
// audio never leaves the region. Env vars:
//   SCRIBE_S3_BUCKET       — bucket name (e.g. tere-scribe-audio-apse2)
//   SCRIBE_TRANSCRIBE_REGION — defaults to ap-southeast-2
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY — same creds used elsewhere
//
// Bucket lifecycle should delete audio + transcript objects after ~2 days
// so we're not accumulating PHI in S3 beyond the note-generation window.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { TranscribeClient, StartTranscriptionJobCommand } from '@aws-sdk/client-transcribe'
import { randomUUID } from 'crypto'

const REGION = process.env.SCRIBE_TRANSCRIBE_REGION || 'ap-southeast-2'

let s3, transcribe
function clients() {
  if (!s3)         s3         = new S3Client({ region: REGION })
  if (!transcribe) transcribe = new TranscribeClient({ region: REGION })
  return { s3, transcribe }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const bucket = process.env.SCRIBE_S3_BUCKET
  if (!bucket) return res.status(500).json({ error: 'SCRIBE_S3_BUCKET not configured' })

  try {
    // bodyParser is disabled in handler.js — collect raw audio stream.
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const audio = Buffer.concat(chunks)
    if (!audio.length) return res.status(400).json({ error: 'No audio data' })

    const contentType = req.headers['content-type'] || 'audio/webm'
    // AWS Transcribe MediaFormat: webm, ogg, mp3, mp4, wav, flac, amr.
    // MediaRecorder in the browser produces audio/webm;codecs=opus — the
    // container is webm so that's what we tell Transcribe.
    const mediaFormat = 'webm'

    const { s3, transcribe } = clients()

    const id  = randomUUID()
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const key = `scribe/${day}/${id}.webm`

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: audio,
      ContentType: contentType,
      // Server-side encryption. Bucket default should also be SSE-S3, but
      // being explicit here means the object is encrypted even if the
      // bucket default policy is ever accidentally weakened.
      ServerSideEncryption: 'AES256',
    }))

    // Job name must be unique per AWS account (12 hrs history). Prefix
    // with day + short UUID prefix for greppability in the AWS console.
    const jobName = `tere-scribe-${day}-${id}`
    await transcribe.send(new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      LanguageCode: 'en-NZ',
      MediaFormat: mediaFormat,
      Media: { MediaFileUri: `s3://${bucket}/${key}` },
      OutputBucketName: bucket,
      OutputKey: `scribe-out/${day}/${id}.json`,
      // No speaker diarization for now — provider notes don't currently
      // use per-speaker attribution. Add ShowSpeakerLabels + MaxSpeakerLabels
      // later if we need to separate provider vs patient utterances.
      Settings: {
        ShowAlternatives: false,
      },
    }))

    // Return the job name — client polls /api/transcribe-status until it
    // moves from IN_PROGRESS → COMPLETED (or FAILED).
    res.status(200).json({ jobName })
  } catch (e) {
    console.error('[transcribe] start failed:', e?.message)
    res.status(500).json({ error: 'Transcription start failed' })
  }
}
