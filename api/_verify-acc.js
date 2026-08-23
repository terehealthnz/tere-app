// api/verify-acc.js — Claude verifies ACC eligibility of patient complaint
import { aiCallJSON, isConfigured } from './_ai.js'
import { PROMPT_SAFETY_PREAMBLE, wrapUserInput } from './_prompt-safety.js'

const ALLOWED_VERDICTS = new Set(['ELIGIBLE', 'BORDERLINE', 'FLAGGED', 'PENDING'])
const ALLOWED_CONFIDENCE = new Set(['high', 'moderate', 'low'])

const FALLBACK = {
  verdict: 'PENDING',
  confidence: 'low',
  reasoning: 'AI verification unavailable — clinician to assess manually.',
  flags: [],
  suggestedQuestions: [],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { complaint, injuryDetails, injuryDate, employer } = req.body

  if (!isConfigured()) return res.status(200).json(FALLBACK)

  const prompt = `You are an ACC (Accident Compensation Corporation) eligibility assessment tool for Tere Health, a New Zealand rural urgent care telehealth service.

${PROMPT_SAFETY_PREAMBLE}

Assess whether the following patient complaint is likely to be ACC-eligible under New Zealand's Accident Compensation Act 2001.

ACC covers: personal injury caused by an accident — a specific event involving external physical force, not a gradual process, disease, or pre-existing condition.

ACC does NOT cover: illness, infections, medical conditions, mental health (unless caused by physical injury), gradual hearing loss, wear and tear, or pre-existing conditions flaring up without a specific incident.

${wrapUserInput(complaint, 'patient_complaint')}
${wrapUserInput(injuryDetails || 'Not provided', 'injury_details')}
${wrapUserInput(injuryDate || 'Not provided', 'date_of_injury')}
${wrapUserInput(employer || 'Not provided', 'employer')}

Respond ONLY with valid JSON in this exact format:
{
  "verdict": "ELIGIBLE" | "BORDERLINE" | "FLAGGED",
  "confidence": "high" | "moderate" | "low",
  "reasoning": "2-3 sentence explanation of your assessment",
  "flags": ["list of specific concerns if any"],
  "suggestedQuestions": ["clarifying questions for the clinician to ask"]
}`

  try {
    const json = await aiCallJSON({ tier: 'sonnet', user: prompt, maxTokens: 500 })
    if (!json) return res.status(200).json(FALLBACK)
    // Schema validation — defence-in-depth against prompt injection that
    // returns malformed / attacker-crafted JSON. Reject unknown enum values.
    if (!ALLOWED_VERDICTS.has(String(json.verdict))) json.verdict = 'PENDING'
    if (!ALLOWED_CONFIDENCE.has(String(json.confidence))) json.confidence = 'low'
    res.status(200).json(json)
  } catch (e) {
    console.error('[verify-acc] Bedrock error:', e.message)
    res.status(200).json(FALLBACK)
  }
}
