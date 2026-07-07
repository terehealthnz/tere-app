import { aiCall, isConfigured } from './_ai.js'

export default async function handler(req, res) {
  const { complaint } = req.body || {}
  if (!complaint?.trim()) return res.status(400).json({ error: 'complaint required' })

  if (!isConfigured()) return res.status(500).json({ error: 'Bedrock not configured' })

  try {
    const answer = (await aiCall({
      tier: 'haiku',
      maxTokens: 10,
      user: `A patient in New Zealand described their health complaint as: "${complaint.slice(0, 500)}"\n\nIs this complaint likely related to an accident, injury, or trauma that could be eligible for ACC (Accident Compensation Corporation) cover?\n\nReply with only one word: YES or NO`,
    })).trim().toUpperCase()
    res.json({ isLikelyACC: answer.startsWith('YES') })
  } catch (e) {
    console.error('[assess-acc] Bedrock error:', e.message)
    res.status(502).json({ error: 'AI service error' })
  }
}
