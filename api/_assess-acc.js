export default async function handler(req, res) {
  const { complaint } = req.body || {}
  if (!complaint?.trim()) return res.status(400).json({ error: 'complaint required' })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return res.status(500).json({ error: 'API key not configured' })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: `A patient in New Zealand described their health complaint as: "${complaint.slice(0, 500)}"\n\nIs this complaint likely related to an accident, injury, or trauma that could be eligible for ACC (Accident Compensation Corporation) cover?\n\nReply with only one word: YES or NO`,
      }],
    }),
  })

  if (!response.ok) return res.status(502).json({ error: 'AI service error' })
  const data = await response.json()
  const answer = (data.content?.[0]?.text || '').trim().toUpperCase()
  res.json({ isLikelyACC: answer.startsWith('YES') })
}
