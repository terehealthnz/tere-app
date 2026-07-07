// api/_bedrock-test.js — GET /api/bedrock-test
//
// Health check for AWS Bedrock connectivity. Fires one small Haiku call and
// reports success/failure with the model ID + region + error text so we can
// diagnose IAM, model access, or region issues without wiring up any of the
// production endpoints. Anon-callable; delete once the swap is verified in
// prod.

import { aiCall, resolveModel, isConfigured } from './_ai.js'

export default async function handler(req, res) {
  const t0 = Date.now()
  const region = process.env.AWS_REGION || 'ap-southeast-2'
  const model = resolveModel('haiku')

  if (!isConfigured()) {
    return res.status(500).json({
      ok: false,
      error: 'AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set',
      region,
      model,
    })
  }

  try {
    const reply = await aiCall({
      tier: 'haiku',
      user: 'Respond with exactly the word: pong',
      maxTokens: 10,
    })
    return res.status(200).json({
      ok: true,
      reply: reply.trim(),
      model,
      region,
      latencyMs: Date.now() - t0,
    })
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message || String(e),
      name: e.name,
      status: e.status,
      model,
      region,
      latencyMs: Date.now() - t0,
    })
  }
}
