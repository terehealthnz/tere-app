// api/_ai.js — Shared Bedrock client for all Claude calls.
//
// Every Anthropic call in this app routes through here so we have a single
// place to manage BAA-covered inference (AWS Bedrock in Sydney), model IDs,
// and error handling. Never talk to api.anthropic.com from any handler
// directly — that path is out-of-BAA and exposes PHI to a non-covered
// endpoint.
//
// Requires env vars: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION.
// Bedrock model IDs default to the APAC cross-region inference profiles;
// override via BEDROCK_MODEL_SONNET / BEDROCK_MODEL_HAIKU if the exact
// version bumps.

import AnthropicBedrock from '@anthropic-ai/bedrock-sdk'

let _client = null
function client() {
  if (_client) return _client
  _client = new AnthropicBedrock({
    awsRegion:    process.env.AWS_REGION       || 'ap-southeast-2',
    awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  })
  return _client
}

const MODELS = {
  sonnet: process.env.BEDROCK_MODEL_SONNET || 'apac.anthropic.claude-sonnet-4-5-20250929-v1:0',
  haiku:  process.env.BEDROCK_MODEL_HAIKU  || 'apac.anthropic.claude-haiku-4-5-20251001-v1:0',
}

export function resolveModel(tier) {
  return MODELS[tier] || MODELS.sonnet
}

// aiCall({ tier: 'sonnet'|'haiku', system, user, maxTokens }) → parsed text.
// If the reply is a fenced JSON block, callers can JSON.parse themselves;
// this helper returns the raw text so extraction/repair stays in each caller.
export async function aiCall({ tier = 'sonnet', system, user, maxTokens = 1024 }) {
  const model = resolveModel(tier)
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: user }],
  }
  if (system) body.system = system
  const resp = await client().messages.create(body)
  return resp?.content?.[0]?.text || ''
}

// aiCallJSON — same as aiCall but strips code fences and parses. Returns
// null on parse failure so the caller can fall back deterministically.
export async function aiCallJSON(args) {
  const text = await aiCall(args)
  const stripped = text.trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
  try { return JSON.parse(stripped) } catch {
    const s = stripped.indexOf('{')
    const e = stripped.lastIndexOf('}')
    if (s !== -1 && e > s) {
      try { return JSON.parse(stripped.slice(s, e + 1)) } catch { return null }
    }
    return null
  }
}

export function isConfigured() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
}
