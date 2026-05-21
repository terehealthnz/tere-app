// DeepL target_lang codes (use EN-US for English target)
const DEEPL_CODES = { en: 'EN-US', zh: 'ZH', ja: 'JA', ko: 'KO', de: 'DE', fr: 'FR', es: 'ES', ar: 'AR', hi: 'HI' }
// Google Translate codes
const GOOGLE_CODES = { en: 'en', zh: 'zh-CN', ja: 'ja', ko: 'ko', de: 'de', fr: 'fr', es: 'es', ar: 'ar', hi: 'hi' }

async function withDeepL(text, targetLang) {
  const key = process.env.DEEPL_API_KEY
  if (!key) return null
  // Free tier keys end with :fx
  const base = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
  const dl = DEEPL_CODES[targetLang] || targetLang.toUpperCase()
  const res = await fetch(`${base}/v2/translate`, {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: [text], target_lang: dl }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const t = data.translations?.[0]
  if (!t?.text) return null
  return { translated_text: t.text, detected_language: t.detected_source_language?.toLowerCase() || null }
}

async function withGoogle(text, targetLang) {
  const gl = GOOGLE_CODES[targetLang] || targetLang
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${gl}&dt=t&q=${encodeURIComponent(text)}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (!Array.isArray(data?.[0])) return null
  const translated = data[0].map(x => x?.[0] || '').join('')
  const detected = typeof data[2] === 'string' ? data[2] : null
  return { translated_text: translated, detected_language: detected }
}

export default async function handler(req, res) {
  const { text, target_lang = 'en', source_lang } = req.body || {}
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' })

  const norm = l => (l || '').toLowerCase().split('-')[0]
  const tgt = norm(target_lang)
  const src = norm(source_lang)

  // Skip translation if same language or text looks already English
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
