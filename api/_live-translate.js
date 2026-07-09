// POST /api/live-translate
//
// Real-time (batched, ~1-2s chunks) subtitle translation for video/phone consults.
// Uses Bedrock Claude Sonnet 4.5 under the same BAA-covered infrastructure as
// every other AI call in this app.
//
// Whitelist enforcement: only 10 languages are supported. Marshallese and
// Rohingya intentionally excluded — see docs in i18n.js. Callers requesting
// unsupported languages get 400 + "human interpreter required" flag.
//
// Body: {
//   text:            string,          // source utterance
//   source_lang:     'en'|'sm'|'mi'|'zh'|'ja'|'ko'|'de'|'fr'|'es'|'ar'|'hi',
//   target_lang:     same set,
//   consultation_id: uuid (optional — for transcript persistence),
//   speaker:         'patient'|'provider',
// }
//
// Response: {
//   translated:  string,
//   confidence:  'high'|'medium'|'low',
//   src_lang:    string,
//   tgt_lang:    string,
//   elapsed_ms:  number,
// }
//
// Persistence: when consultation_id is provided, the pair is appended to
// consultations.transcript_translated for medico-legal review.

import { createClient } from '@supabase/supabase-js'
import { aiCall, isConfigured } from './_ai.js'

// Only these languages get live AI subtitles. This matches the whitelist
// decided with Patrick 2026-07-08 — Excellent + Very Good tier only.
// Marshallese (mh) and Rohingya (rhg) are NOT in this list; low-resource
// languages produce confident-looking wrong translations that we can't
// detect from confidence signals alone.
// Keep in sync with:
//   • src/lib/i18n.js LANGUAGES list
//   • src/lib/useLiveTranscription.js AWS_LANG_MAP (STT-supported subset)
// Adding a new language here without adding it to those two lists (or vice
// versa) means the /call page opens the mic to AWS Transcribe and then
// bounces every translate request with a 400 — which is exactly the Dutch
// bug we hit in prod on 2026-07-09.
const SUBTITLE_WHITELIST = new Set(['en','zh','ja','ko','de','nl','fr','es','pt','it','ar','hi','mi','sm'])

const LANG_NAMES = {
  en: 'English', zh: 'Chinese (Simplified)', ja: 'Japanese', ko: 'Korean',
  de: 'German', nl: 'Dutch', fr: 'French', es: 'Spanish',
  pt: 'Portuguese (Brazilian)', it: 'Italian',
  ar: 'Arabic', hi: 'Hindi',
  mi: 'Te Reo Māori', sm: 'Samoan (Gagana Sāmoa)',
}

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Heuristic confidence signal derived from source/target-length ratio and
// unusual character patterns. This is intentionally simple — the model's
// self-reported confidence is uncalibrated for real safety guarantees, so
// we treat this as a rough hint only.
function estimateConfidence({ src, tgt, srcLang, tgtLang }) {
  if (!tgt || !tgt.trim()) return 'low'
  const srcLen = src.trim().length
  const tgtLen = tgt.trim().length
  const ratio = tgtLen / Math.max(srcLen, 1)
  // Very short target for a longer source usually means truncation or refusal.
  if (srcLen > 20 && tgtLen < srcLen * 0.25) return 'low'
  // Very long output for a short source often means Claude added commentary.
  if (ratio > 4 && srcLen > 10) return 'medium'
  // English fallback text sneaking through non-English target lang.
  if (tgtLang !== 'en' && /^[a-zA-Z ,.'\-!?]+$/.test(tgt.slice(0, 30))) return 'medium'
  return 'high'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!isConfigured()) {
    return res.status(503).json({ error: 'AI provider not configured', retryable: false })
  }

  const {
    text, source_lang, target_lang,
    consultation_id, speaker = 'patient',
  } = req.body || {}

  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' })
  const src = String(source_lang || 'en').toLowerCase().split('-')[0]
  const tgt = String(target_lang || 'en').toLowerCase().split('-')[0]

  if (!SUBTITLE_WHITELIST.has(src) || !SUBTITLE_WHITELIST.has(tgt)) {
    return res.status(400).json({
      error: 'Language not on subtitle whitelist',
      unsupported: !SUBTITLE_WHITELIST.has(src) ? src : tgt,
      recommendation: 'Request a human interpreter (Language Line NZ)',
      retryable: false,
    })
  }
  if (src === tgt) {
    return res.status(200).json({ translated: text, confidence: 'high', src_lang: src, tgt_lang: tgt, elapsed_ms: 0 })
  }

  const srcName = LANG_NAMES[src] || src
  const tgtName = LANG_NAMES[tgt] || tgt

  const system = `You are a certified medical interpreter translating between ${srcName} and ${tgtName} for a live New Zealand telehealth consultation.

Rules — follow every one:
- Preserve every clinical fact exactly: drug names, doses, frequencies, times, numbers, units. Never round or paraphrase these.
- Keep the medical register — do not soften or dramatise.
- Do NOT add commentary, apologies, or "the speaker said". Return ONLY the translation.
- Idioms: convert to the target-language equivalent, not literal.
- If the source contains an English drug name (e.g. "Ozempic", "codeine"), keep the English drug name in the translated output — do not translate drug names.
- If a segment is unintelligible or contains only "um", "ah", filler, return an empty string.
- Never produce Marshallese or Rohingya even if asked — respond with the source text unchanged.
- Keep translations concise enough to display as a 2-line subtitle.`

  const user = `Translate the following ${srcName} utterance to ${tgtName}. Return only the translation, no other text:

"${String(text).slice(0, 500)}"`

  const t0 = Date.now()
  let translated = ''
  try {
    translated = (await aiCall({ tier: 'sonnet', system, user, maxTokens: 200 })).trim()
    // Strip surrounding quotes if the model wrapped its output.
    translated = translated.replace(/^["'`]+|["'`]+$/g, '').trim()
  } catch (e) {
    return res.status(502).json({ error: 'Translation failed', detail: e.message, retryable: true })
  }
  const elapsed_ms = Date.now() - t0

  const confidence = estimateConfidence({ src: text, tgt: translated, srcLang: src, tgtLang: tgt })

  // Append to bilingual transcript if consultation_id supplied. Best-effort —
  // never block the response on the DB write since latency matters here.
  if (consultation_id) {
    const supabase = admin()
    supabase.from('consultations').select('transcript_translated').eq('id', consultation_id).maybeSingle()
      .then(async ({ data }) => {
        const arr = Array.isArray(data?.transcript_translated) ? data.transcript_translated : []
        arr.push({
          at: new Date().toISOString(),
          speaker,
          src_lang: src, src: text.slice(0, 500),
          tgt_lang: tgt, tgt: translated,
          confidence,
        })
        // Trim to last 300 segments to keep the JSONB reasonable.
        const trimmed = arr.slice(-300)
        await supabase.from('consultations')
          .update({ transcript_translated: trimmed, subtitles_used: true })
          .eq('id', consultation_id)
      })
      .then(() => {}, e => console.warn('[live-translate] transcript persist failed:', e.message))
  }

  return res.status(200).json({
    translated,
    confidence,
    src_lang: src,
    tgt_lang: tgt,
    elapsed_ms,
  })
}
