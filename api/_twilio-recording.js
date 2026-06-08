import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // Twilio sends form-encoded POST when recording completes
  const { CallSid, RecordingUrl, RecordingStatus } = req.body

  if (RecordingStatus !== 'completed' || !RecordingUrl) return res.status(200).send('OK')

  const { data: consult } = await supabase
    .from('consultations')
    .select('id, transcript')
    .eq('twilio_call_sid', CallSid)
    .single()

  if (!consult) return res.status(200).send('OK')

  // Embed Twilio credentials so Deepgram can fetch the recording
  const authedUrl = RecordingUrl.replace(
    'https://',
    `https://${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}@`
  ) + '.wav'

  try {
    const dgRes = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&language=en-NZ&punctuate=true&smart_format=true&multichannel=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: authedUrl }),
      }
    )

    if (!dgRes.ok) throw new Error(`Deepgram ${dgRes.status}`)

    const data = await dgRes.json()
    const channels = data.results?.channels

    let callTranscript = ''

    if (channels?.length >= 2) {
      // Dual channel: merge words by timestamp, label by channel
      const labels = ['[PROVIDER]', '[PATIENT]']
      const words = []
      channels.forEach((ch, idx) => {
        ;(ch.alternatives?.[0]?.words || []).forEach(w => words.push({ ...w, label: labels[idx] }))
      })
      words.sort((a, b) => a.start - b.start)

      let lastLabel = null
      for (const w of words) {
        if (w.label !== lastLabel) {
          lastLabel = w.label
          callTranscript += (callTranscript ? '\n' : '') + w.label + ' '
        } else {
          callTranscript += ' '
        }
        callTranscript += (w.punctuated_word || w.word)
      }
    } else {
      callTranscript = channels?.[0]?.alternatives?.[0]?.transcript || ''
    }

    if (callTranscript) {
      const existing = consult.transcript || ''
      const combined = existing
        ? `${existing}\n\n--- Phone call recording ---\n${callTranscript}`
        : `--- Phone call recording ---\n${callTranscript}`

      await supabase
        .from('consultations')
        .update({ transcript: combined })
        .eq('id', consult.id)
    }
  } catch (err) {
    console.error('Recording transcription error:', err)
  }

  res.status(200).send('OK')
}
