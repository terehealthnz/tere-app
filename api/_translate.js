// DeepL target_lang codes (use EN-US for English target). DeepL does not
// support 'mi' (Māori), 'sm' (Samoan), 'mh' (Marshallese), or 'rhg' (Rohingya)
// — those fall through to Google, then to Claude via the AI-triage prompt.
const DEEPL_CODES = { en: 'EN-US', zh: 'ZH', ja: 'JA', ko: 'KO', de: 'DE', fr: 'FR', es: 'ES', ar: 'AR', hi: 'HI' }
// Google Translate codes. Google supports Te Reo Māori ('mi') and Samoan ('sm').
// Marshallese ('mh') and Rohingya ('rhg') are not in Google Translate; those
// requests degrade to a source-text passthrough and rely on the AI-triage
// prompt in _assess-acc / _patient-consult to respond in the target language.
const GOOGLE_CODES = { en: 'en', mi: 'mi', sm: 'sm', zh: 'zh-CN', ja: 'ja', ko: 'ko', de: 'de', fr: 'fr', es: 'es', ar: 'ar', hi: 'hi' }

// 2026-09-28: text can be a string OR an array of strings. When an array,
// returned translated_text is also an array (same order + length) so the
// caller can bulk-translate a whole UI string map in one round-trip. Used
// by the patient-flow pages (WorkIntake, VitalsCapture, WaitingRoom) that
// need instant translation on mount when the patient picked non-English
// upstream on WorkLanding.
async function withDeepL(text, targetLang) {
  const key = process.env.DEEPL_API_KEY
  if (!key) return null
  const base = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
  const dl = DEEPL_CODES[targetLang] || targetLang.toUpperCase()
  const inputs = Array.isArray(text) ? text : [text]
  const res = await fetch(`${base}/v2/translate`, {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: inputs, target_lang: dl }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const ts = data.translations || []
  if (ts.length !== inputs.length) return null
  const out = ts.map(t => t?.text || '')
  const detected = ts[0]?.detected_source_language?.toLowerCase() || null
  return {
    translated_text: Array.isArray(text) ? out : out[0],
    detected_language: detected,
  }
}

async function withGoogle(text, targetLang) {
  const gl = GOOGLE_CODES[targetLang] || targetLang
  const inputs = Array.isArray(text) ? text : [text]
  // Google's public gtx endpoint takes one string per request. For arrays
  // we fire them in parallel (typical page = 15-30 strings, well within
  // the throttle we'd hit at low patient volume).
  const results = await Promise.all(inputs.map(async (t) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${gl}&dt=t&q=${encodeURIComponent(t)}`
    const r = await fetch(url)
    if (!r.ok) return { translated: t, detected: null }
    const data = await r.json()
    if (!Array.isArray(data?.[0])) return { translated: t, detected: null }
    return {
      translated: data[0].map(x => x?.[0] || '').join(''),
      detected: typeof data[2] === 'string' ? data[2] : null,
    }
  }))
  return {
    translated_text: Array.isArray(text) ? results.map(r => r.translated) : results[0].translated,
    detected_language: results[0]?.detected || null,
  }
}

export default async function handler(req, res) {
  const { text, target_lang = 'en', source_lang } = req.body || {}
  const isArray = Array.isArray(text)
  const hasContent = isArray
    ? text.some(t => typeof t === 'string' && t.trim())
    : (typeof text === 'string' && text.trim())
  if (!hasContent) return res.status(400).json({ error: 'text is required' })

  const norm = l => (l || '').toLowerCase().split('-')[0]
  const tgt = norm(target_lang)
  const src = norm(source_lang)

  // Skip translation if same language.
  if (src && src === tgt) return res.json({ translated_text: text, detected_language: src })

  try {
    const r = await withDeepL(text, tgt)
    if (r?.translated_text) return res.json(r)
  } catch {}

  try {
    const r = await withGoogle(text, tgt)
    if (r?.translated_text) return res.json(r)
  } catch {}

  // Both failed — return original unchanged
  res.json({ translated_text: text, detected_language: src || null, fallback: true })
}
