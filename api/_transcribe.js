export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  // Accept either name so operators don't need to reconfigure Vercel.
  const apiKey = process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_SECRET_KEY
  if (!apiKey) return res.status(500).json({ error: 'Deepgram API key not configured' })

  try {
    // Collect raw audio stream (bodyParser disabled in handler.js for audio/* content types)
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const audio = Buffer.concat(chunks)
    if (!audio.length) return res.status(400).json({ error: 'No audio data' })

    const contentType = req.headers['content-type'] || 'audio/webm'

    const params = new URLSearchParams({
      model: 'nova-3-medical',
      language: 'en-NZ',
      smart_format: 'true',
      punctuate: 'true',
      diarize: 'true',
      filler_words: 'false',
      numerals: 'true',
      keyterm: 'ACC,NHI,ibuprofen,paracetamol,amoxicillin,fracture,laceration,sprain,contusion,hypertension,diabetes,asthma,ankle,knee,wrist,shoulder,Tere',
    })

    // One retry on 5xx. Deepgram occasionally 502s under upstream load;
    // without the retry a transient blip loses the whole consult transcript
    // and the provider has to re-type notes. Non-5xx (400 bad audio, 401
    // auth) fail fast - retrying wouldn't help.
    let r, errText
    for (let attempt = 1; attempt <= 2; attempt++) {
      r = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': contentType,
        },
        body: audio,
      })
      if (r.ok) break
      errText = await r.text()
      if (r.status < 500 || attempt === 2) break
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    if (!r.ok) {
      console.error('[transcribe] Deepgram error after retry:', r.status, errText)
      return res.status(502).json({ error: 'Transcription unavailable' })
    }

    const data = await r.json()
    const alternatives = data.results?.channels?.[0]?.alternatives?.[0]
    const text = alternatives?.transcript || ''

    res.status(200).json({ text })
  } catch (e) {
    console.error('[transcribe]', e.message)
    res.status(500).json({ error: 'Server error' })
  }
}
