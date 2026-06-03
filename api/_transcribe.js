export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const apiKey = process.env.DEEPGRAM_API_KEY
  console.log('DEEPGRAM_API_KEY:', apiKey ? 'SET' : 'MISSING')
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

    const r = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: audio,
    })

    if (!r.ok) {
      const err = await r.text()
      console.error('[transcribe] Deepgram error:', err)
      return res.status(500).json({ error: `Deepgram error: ${err}` })
    }

    const data = await r.json()
    const alternatives = data.results?.channels?.[0]?.alternatives?.[0]
    const text = alternatives?.transcript || ''

    res.status(200).json({ text })
  } catch (e) {
    console.error('[transcribe]', e.message)
    res.status(500).json({ error: e.message })
  }
}
