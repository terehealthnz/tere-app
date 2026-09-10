// Scribe transcription status — poll AWS Transcribe job by name, return
// { status: 'in_progress' | 'completed' | 'failed', text? }.
//
// GET  /api/transcribe-status?jobName=tere-scribe-YYYYMMDD-uuid
// POST /api/transcribe-status  { jobName: '...' }
//
// When status flips to COMPLETED we fetch the transcript JSON from the
// results S3 key that /api/transcribe wrote, parse the single-string
// transcript out of it, and return that. We also best-effort delete both
// the audio object and the results object to minimise PHI retention in
// S3 beyond the note-generation window.

import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { TranscribeClient, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe'

const REGION = process.env.SCRIBE_TRANSCRIBE_REGION || 'ap-southeast-2'

let s3, transcribe
function clients() {
  if (!s3)         s3         = new S3Client({ region: REGION })
  if (!transcribe) transcribe = new TranscribeClient({ region: REGION })
  return { s3, transcribe }
}

async function readS3ObjectAsString(client, bucket, key) {
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const chunks = []
  for await (const chunk of r.Body) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf-8')
}

export default async function handler(req, res) {
  const bucket = process.env.SCRIBE_S3_BUCKET
  if (!bucket) return res.status(500).json({ error: 'SCRIBE_S3_BUCKET not configured' })

  let jobName = null
  if (req.method === 'GET') {
    jobName = req.query?.jobName || null
  } else if (req.method === 'POST') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    try { jobName = JSON.parse(Buffer.concat(chunks).toString('utf-8'))?.jobName || null } catch {}
  } else {
    return res.status(405).end()
  }

  if (!jobName || typeof jobName !== 'string') {
    return res.status(400).json({ error: 'jobName required' })
  }
  // Cheap injection guard — job names are our own UUID-based format.
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(jobName)) {
    return res.status(400).json({ error: 'invalid jobName' })
  }

  try {
    const { s3, transcribe } = clients()
    const r = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }))
    const job = r.TranscriptionJob
    const status = job?.TranscriptionJobStatus

    if (status === 'IN_PROGRESS' || status === 'QUEUED') {
      return res.status(200).json({ status: 'in_progress' })
    }
    if (status === 'FAILED') {
      console.error('[transcribe-status] job failed:', jobName, job?.FailureReason)
      return res.status(200).json({ status: 'failed', error: job?.FailureReason || 'unknown' })
    }
    if (status !== 'COMPLETED') {
      return res.status(200).json({ status: 'unknown' })
    }

    // Job completed — reconstruct the output key from the job name we set,
    // rather than parsing the presigned Transcript.TranscriptFileUri URL.
    // Format matches /api/transcribe: scribe-out/YYYYMMDD/UUID.json
    // jobName format: tere-scribe-YYYYMMDD-uuid
    const parts = jobName.split('-')
    // ['tere','scribe','YYYYMMDD', ...uuid segments]
    const day = parts[2]
    const uuid = parts.slice(3).join('-')
    const outKey = `scribe-out/${day}/${uuid}.json`

    const raw = await readS3ObjectAsString(s3, bucket, outKey)
    const parsed = JSON.parse(raw)
    const text = parsed?.results?.transcripts?.[0]?.transcript || ''

    // Best-effort cleanup — don't fail the response if either delete errors.
    const audioKey = `scribe/${day}/${uuid}.webm`
    Promise.allSettled([
      s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: audioKey })),
      s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: outKey })),
    ]).catch(() => {})

    return res.status(200).json({ status: 'completed', text })
  } catch (e) {
    console.error('[transcribe-status]', e?.message)
    return res.status(500).json({ error: 'Status check failed' })
  }
}
