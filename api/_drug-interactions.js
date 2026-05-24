// Drug interaction checker using free RxNorm + NLM Interaction APIs
import { createClient } from '@supabase/supabase-js'

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST'

async function getRxcui(drugName) {
  const res = await fetch(`${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(drugName)}&search=1`)
  const data = await res.json()
  const ids = data?.idGroup?.rxnormId
  return ids && ids.length > 0 ? ids[0] : null
}

async function checkInteractions(rxcuis) {
  if (rxcuis.length < 2) return []
  const url = `${RXNORM_BASE}/interaction/list.json?rxcuis=${rxcuis.join('+')}`
  const res = await fetch(url)
  const data = await res.json()
  const pairs = data?.fullInteractionTypeGroup?.[0]?.fullInteractionType || []
  return pairs.flatMap(p => p.interactionPair || []).map(pair => ({
    description: pair.description,
    severity: pair.severity || 'unknown',
    drug1: pair.interactionConcept?.[0]?.minConceptItem?.name,
    drug2: pair.interactionConcept?.[1]?.minConceptItem?.name,
  }))
}

function normaliseSeverity(s) {
  const lower = (s || '').toLowerCase()
  if (lower.includes('high') || lower.includes('major')) return 'major'
  if (lower.includes('moderate') || lower.includes('medium')) return 'moderate'
  if (lower.includes('minor') || lower.includes('low')) return 'minor'
  return 'unknown'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { drug, patientMedications, consultationId, providerId, override, overrideReason } = req.body
  if (!drug) return res.status(400).json({ error: 'drug required' })

  try {
    // Parse patient meds into individual drug names
    const medList = (patientMedications || '')
      .split(/[,;\n]/)
      .map(m => m.trim().split(/\s+/)[0]) // take first word (drug name)
      .filter(m => m.length > 2)

    // Look up RxCUIs for all drugs
    const allDrugs = [drug, ...medList]
    const rxcuiResults = await Promise.allSettled(allDrugs.map(d => getRxcui(d)))
    const rxcuis = rxcuiResults
      .map((r, i) => ({ drug: allDrugs[i], rxcui: r.status === 'fulfilled' ? r.value : null }))
      .filter(x => x.rxcui)

    const rxcuiList = rxcuis.map(x => x.rxcui)
    const interactions = rxcuiList.length >= 2 ? await checkInteractions(rxcuiList) : []

    const normalised = interactions.map(i => ({ ...i, severity: normaliseSeverity(i.severity) }))
    const maxSeverity = normalised.some(i => i.severity === 'major') ? 'major'
      : normalised.some(i => i.severity === 'moderate') ? 'moderate'
      : normalised.some(i => i.severity === 'minor') ? 'minor'
      : 'none'

    // Log to Supabase
    try {
      const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      await supabase.from('drug_interactions_log').insert({
        consultation_id: consultationId || null,
        provider_id: providerId || null,
        drug_checked: drug,
        patient_meds: patientMedications || '',
        interactions: normalised,
        max_severity: maxSeverity,
        overridden: !!override,
        override_reason: overrideReason || null,
      })
    } catch {}

    return res.status(200).json({
      drug,
      rxcuis: rxcuis.map(x => ({ drug: x.drug, rxcui: x.rxcui })),
      interactions: normalised,
      maxSeverity,
      safe: maxSeverity === 'none' || maxSeverity === 'minor',
    })
  } catch (e) {
    console.error('[drug-interactions]', e)
    return res.status(500).json({ error: e.message })
  }
}
