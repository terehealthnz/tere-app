// api/verify-acc.js — Claude verifies ACC eligibility of patient complaint
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { complaint, injuryDetails, injuryDate, employer } = req.body
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(200).json({
      verdict: 'PENDING',
      confidence: 'low',
      reasoning: 'AI verification unavailable — clinician to assess manually.',
      flags: [],
      suggestedQuestions: []
    })
  }

  const prompt = `You are an ACC (Accident Compensation Corporation) eligibility assessment tool for Tere Health, a New Zealand rural urgent care telehealth service.

Assess whether the following patient complaint is likely to be ACC-eligible under New Zealand's Accident Compensation Act 2001.

ACC covers: personal injury caused by an accident — a specific event involving external physical force, not a gradual process, disease, or pre-existing condition.

ACC does NOT cover: illness, infections, medical conditions, mental health (unless caused by physical injury), gradual hearing loss, wear and tear, or pre-existing conditions flaring up without a specific incident.

PATIENT COMPLAINT: ${complaint}
INJURY DETAILS: ${injuryDetails || 'Not provided'}
DATE OF INJURY: ${injuryDate || 'Not provided'}
EMPLOYER: ${employer || 'Not provided'}

Respond ONLY with valid JSON in this exact format:
{
  "verdict": "ELIGIBLE" | "BORDERLINE" | "FLAGGED",
  "confidence": "high" | "moderate" | "low",
  "reasoning": "2-3 sentence explanation of your assessment",
  "flags": ["list of specific concerns if any"],
  "suggestedQuestions": ["clarifying questions for the clinician to ask"]
}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const data = await r.json()
    const text = data.content[0].text
    const json = JSON.parse(text.replace(/```json|```/g, '').trim())
    res.status(200).json(json)
  } catch (e) {
    console.error(e)
    res.status(200).json({
      verdict: 'PENDING',
      confidence: 'low',
      reasoning: 'AI verification unavailable — clinician to assess manually.',
      flags: [],
      suggestedQuestions: []
    })
  }
}
