// api/_bedrock-test.js — GET /api/bedrock-test
//
// Health check for AWS Bedrock connectivity. Fires one small call to BOTH
// Haiku and Sonnet models and reports success/failure with the model ID +
// region + error text so we can diagnose IAM, model access, or region
// issues without wiring up any of the production endpoints. Anon-callable;
// delete once the swap is verified in prod.

import { aiCall, resolveModel, isConfigured } from './_ai.js'

async function testTier(tier) {
  const t0 = Date.now()
  const model = resolveModel(tier)
  try {
    const reply = await aiCall({
      tier,
      user: 'Respond with exactly the word: pong',
      maxTokens: 10,
    })
    return {
      tier,
      ok: true,
      reply: (reply || '').trim(),
      model,
      latencyMs: Date.now() - t0,
    }
  } catch (e) {
    return {
      tier,
      ok: false,
      error: e.message || String(e),
      status: e.status,
      model,
      latencyMs: Date.now() - t0,
    }
  }
}

export default async function handler(req, res) {
  const region = process.env.AWS_REGION || 'ap-southeast-2'

  if (!isConfigured()) {
    return res.status(500).json({
      ok: false,
      error: 'AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set',
      region,
    })
  }

  const [haiku, sonnet] = await Promise.all([testTier('haiku'), testTier('sonnet')])
  const allOk = haiku.ok && sonnet.ok

  return res.status(allOk ? 200 : 500).json({
    ok: allOk,
    region,
    haiku,
    sonnet,
  })
}
