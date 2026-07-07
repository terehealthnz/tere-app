// api/_generate-notes.js — Tere Scribe v3: extract → red-flag check → JS-merge
import { isFlagEnabled } from './_flags-server.js'
import { aiCallJSON, isConfigured } from './_ai.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Kill switch: if the AI notes generation misbehaves (bad prompt, model
  // outage, unexpected clinical output), an admin can flip the
  // `ai_notes_enabled` feature flag OFF from Admin → 🚩 Feature flags and
  // every subsequent scribe call returns `{ skipped: true }` within ~60s.
  // Provider then writes notes manually with no code change or deploy needed.
  // Default true — only actively disabled when a problem is detected.
  const notesOn = await isFlagEnabled('ai_notes_enabled', { default: true })
  if (!notesOn) {
    return res.status(200).json({
      skipped: true,
      reason: 'AI note generation disabled by feature flag (ai_notes_enabled). Provider will complete notes manually.',
    })
  }

  if (!isConfigured()) return res.status(500).json({ error: 'Bedrock not configured' })

  let body = req.body || {}

  // ── consultationId path: fetch all data from DB ───────────────────────────
  if (body.consultationId) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      const { data: c, error } = await supabase
        .from('consultations')
        .select('*')
        .eq('id', body.consultationId)
        .single()
      if (error) throw new Error(`DB error: ${error.message}`)

      body = {
        consultationId: body.consultationId,
        transcript: c.transcript || '',
        triage: {
          patientName:          `${c.patient_first_name || ''} ${c.patient_last_name || ''}`.trim(),
          patientDob:           c.patient_dob,
          patientNhi:           c.patient_nhi,
          patientPhone:         c.patient_phone,
          patientEmail:         c.patient_email,
          patientLocation:      c.patient_location,
          chiefComplaint:       c.chief_complaint,
          medicalHistory:       c.medical_history,
          medications:          c.medications,
          allergies:            c.patient_allergies,
          pharmacy:             c.pharmacy,
          accEligible:          c.acc_eligible === 'yes',
          accInjuryDescription: c.acc_injury_details,
          accInjuryDate:        c.acc_injury_date,
          accEmployer:          c.acc_employer,
        },
        vitals:          c.vitals || null,
        prescriptions:   c.prescriptions || [],
        referrals:       c.referrals || [],
        durationMinutes: c.duration_minutes || 0,
        providerName:    c.provider_display_name || 'Treating clinician',
        consultationDate: c.created_at,
      }
      console.log('[generate-notes] loaded consultationId', body.consultationId, '— transcript length:', body.transcript.length)
    } catch (e) {
      console.error('[generate-notes] DB fetch error:', e.message)
      return res.status(500).json({ error: e.message })
    }
  }

  const {
    transcript = '',
    triage = {},
    prescriptions = [],
    referrals = [],
    durationMinutes = 0,
  } = body

  const billingCode = durationMinutes >= 30 ? 'CS2T' : 'CS1T'

  // ── Step 1: Extraction + red-flag check — run in parallel ─────────────────
  let extracted = {
    additional_history:            null,
    additional_history_confidence: null,
    general_appearance:            null,
    general_appearance_confidence: null,
    visible_findings:              null,
    visible_findings_confidence:   null,
    mdm_summary:                   null,
    mdm_confidence:                null,
    plan_additions:                [],
    plan_confidence:               null,
    return_precautions:            null,
    return_precautions_confidence: null,
    tobacco_use:                   null,
    alcohol_use:                   null,
    occupation:                    null,
  }
  const hasTranscript = transcript && transcript.trim().length > 50

  const systemPrompt = `You are a clinical documentation assistant. Your job is to accurately transcribe and structure what was said during a NZ telehealth consultation — nothing more. You are not the clinician. You do not diagnose, synthesise differentials, apply decision rules, or flag safety concerns of your own. Any clinical reasoning belongs to the provider; if they voiced it, capture it verbatim, otherwise leave the field null.

Knowledge you draw on strictly for accurate transcription and NZ-appropriate documentation formatting:
- NZ ACC injury classifications and Read codes (for structured note output only)
- PHARMAC medication names and NZ prescribing terminology
- MCNZ medical record keeping conventions
- HDC Code of Rights documentation obligations

You write in clear, concise medical English, third person past tense. You extract only clinically relevant information voiced during the consultation. You do not include greetings, small talk, or non-clinical conversation. You do not add clinical opinions, differentials, or "should be considered" language of your own.`

  if (hasTranscript) {
    const isDiarized = transcript.includes('[PROVIDER]') || transcript.includes('[PATIENT]')

    const extractionPrompt = `Extract ONLY clinically relevant information from this consultation transcript.

IGNORE completely:
- Greetings and small talk ("how are you", "thanks", "bye")
- Technical issues ("can you hear me", "connection problems")
- Payment or admin discussion
- Repetition of information already in the triage data below
- Personal conversation unrelated to the clinical presentation
- Anything not clinically relevant to the presenting complaint

EXTRACT only NEW information not already captured in the triage data:
- Additional history details (onset, mechanism, severity, associated symptoms, what patient has tried)
- Provider's spoken examination findings ("I can see swelling", "range of motion appears limited")
- Provider's clinical reasoning as they voiced it — verbatim, no synthesis or elaboration
- Additional symptoms mentioned during the call
- Verbal follow-up instructions and treatment advice
- Specific clinical observations ("swelling about 3cm", "can weight bear with pain")

TRIAGE DATA ALREADY CAPTURED (do not repeat):
Chief complaint: ${triage.chiefComplaint || '—'}
Medical history: ${triage.medicalHistory || '—'}
Medications: ${triage.medications || '—'}
Allergies: ${triage.allergies || '—'}${triage.accInjuryDescription ? '\nACC injury: ' + triage.accInjuryDescription : ''}
${isDiarized ? `
SPEAKER LABELS — transcript is diarized:
[PROVIDER] = clinician speech → use for examination findings, MDM reasoning, plan instructions
[PATIENT] = patient speech → use for additional history, symptoms, and concerns
Extract from PROVIDER: "I can see...", "there appears to be...", "range of motion...", "I'm going to prescribe..."
Extract from PATIENT: "it started...", "I've been having...", "the pain is...", "I'm worried about..."
` : ''}
TRANSCRIPT:
${transcript}

Return ONLY valid JSON. For fields with no relevant content return null. Do not invent content.
For each clinical field include a confidence rating based on the clarity and completeness of transcript content:
- "high": clear, complete information — confident extraction
- "medium": some information but gaps or unclear audio — provider should review
- "low": very limited or uncertain information — provider should complete manually

{
  "additional_history": "Any NEW history from the call not in triage. null if nothing new.",
  "additional_history_confidence": "high|medium|low|null",
  "general_appearance": "Provider's video assessment: alertness, distress level, colour. null if not described.",
  "general_appearance_confidence": "high|medium|low|null",
  "visible_findings": "What provider described seeing on camera: swelling, deformity, ROM, gait, measurements. Note exam modalities not possible via telehealth if relevant. null if nothing described.",
  "visible_findings_confidence": "high|medium|low|null",
  "mdm_summary": "Provider's clinical reasoning EXACTLY as they voiced it during the call. Do not add differentials, decision rules, or considerations they did not state. null if provider did not verbalise reasoning.",
  "mdm_confidence": "high|medium|low|null",
  "plan_additions": ["Specific verbal management instructions: RICE, activity modification, wound care, medication instructions, follow-up timing. Note any PHARMAC Special Authority if applicable."],
  "plan_confidence": "high|medium|low|null",
  "return_precautions": "Specific symptoms to watch for, when to seek further care, stated verbally and appropriate to diagnosis. null if not mentioned.",
  "return_precautions_confidence": "high|medium|low|null",
  "tobacco_use": "Smoking/vaping status only if mentioned. null if not mentioned.",
  "alcohol_use": "Alcohol use only if mentioned. null if not mentioned.",
  "occupation": "Occupation details only if mentioned beyond triage employer field. null if not mentioned."
}`

    try {
      const extractionRes = await aiCallJSON({
        tier: 'sonnet',
        system: systemPrompt,
        user: extractionPrompt,
        maxTokens: 2000,
      })

      if (extractionRes) {
        extracted = { ...extracted, ...extractionRes }
        const filled = Object.keys(extractionRes).filter(k =>
          !k.endsWith('_confidence') && extractionRes[k] !== null &&
          (Array.isArray(extractionRes[k]) ? extractionRes[k].length > 0 : true)
        )
        console.log('[generate-notes] extracted fields:', filled.join(', ') || 'none')
      }
    } catch (e) {
      console.error('[generate-notes] Bedrock extraction error:', e.message)
      // Fall through — triage-only merge
    }
  }

  // ── Step 2: JS merge — deterministic triage + extracted combination ────────
  const accCode  = suggestReadCode(triage.chiefComplaint, triage.accInjuryDescription)
  const icd10    = suggestIcd10(triage.chiefComplaint, triage.accInjuryDescription, transcript)
  const planAdditions = Array.isArray(extracted.plan_additions)
    ? extracted.plan_additions.filter(Boolean) : []

  // Source + confidence tracking
  const _sources = {
    presentingHistory: extracted.additional_history                          ? 'transcript' : (triage.chiefComplaint ? 'triage' : 'none'),
    medicalHistory:    triage.medicalHistory                                 ? 'triage'     : 'none',
    medications:       triage.medications                                    ? 'triage'     : 'none',
    allergies:         triage.allergies                                      ? 'triage'     : 'none',
    social:            (extracted.tobacco_use || extracted.alcohol_use || extracted.occupation) ? 'transcript' : 'triage',
    generalAppearance: extracted.general_appearance                          ? 'transcript' : 'none',
    visibleFindings:   extracted.visible_findings                            ? 'transcript' : 'none',
    mdm:               extracted.mdm_summary                                 ? 'transcript' : 'none',
    planItems:         planAdditions.length                                  ? 'transcript' : 'none',
    returnPrecautions: extracted.return_precautions                          ? 'transcript' : 'none',
  }

  const _confidence = {
    presentingHistory: extracted.additional_history_confidence || null,
    generalAppearance: extracted.general_appearance_confidence || null,
    visibleFindings:   extracted.visible_findings_confidence   || null,
    mdm:               extracted.mdm_confidence                || null,
    planItems:         extracted.plan_confidence               || null,
    returnPrecautions: extracted.return_precautions_confidence || null,
  }

  // Snapshot of triage-only values for note comparison toggle
  const _triage = {
    presentingHistory: triage.chiefComplaint  || null,
    medicalHistory:    triage.medicalHistory  || null,
    medications:       triage.medications     || null,
    allergies:         triage.allergies       || null,
  }

  // What Tere Scribe added from the transcript (for comparison toggle)
  const _additions = {
    presentingHistory: extracted.additional_history  || null,
    generalAppearance: extracted.general_appearance  || null,
    visibleFindings:   extracted.visible_findings    || null,
    mdm:               extracted.mdm_summary         || null,
    planItems:         planAdditions.length ? planAdditions : null,
    returnPrecautions: extracted.return_precautions  || null,
  }

  // Build HRV/AF vitals screening note from rPPG data
  const v = body.vitals
  const vitalsScreeningNote = (() => {
    if (!v || v.skipped) return null
    const parts = []
    if (v.hrv) parts.push(`HRV: SDNN ${v.hrv.sdnn}ms, RMSSD ${v.hrv.rmssd}ms (${v.hrv.interpretation})`)
    if (v.afDetection?.possible) parts.push(`Rhythm screening: possible irregular rhythm (RR variability ${v.afDetection.cvRR}%, RMSSD ${v.afDetection.rmssd}ms)`)
    return parts.length ? parts.join(' | ') : null
  })()
  const afMdmNote = (v?.afDetection?.possible)
    ? `rPPG screening flagged possible irregular rhythm (RR variability ${v.afDetection.cvRR}%, RMSSD ${v.afDetection.rmssd}ms). Clinical correlation recommended. ECG not performed — telehealth limitation.`
    : null

  const result = {
    presentingHistory: [triage.chiefComplaint, extracted.additional_history].filter(Boolean).join('. ') || null,
    medicalHistory:    triage.medicalHistory  || null,
    medications:       triage.medications     || null,
    allergies:         triage.allergies       || null,
    social: {
      tobacco:    extracted.tobacco_use || 'Not disclosed',
      alcohol:    extracted.alcohol_use || 'Not disclosed',
      occupation: extracted.occupation  || triage.accEmployer || 'Not disclosed',
    },
    examination: {
      generalAppearance:  extracted.general_appearance || null,
      visibleFindings:    extracted.visible_findings   || null,
      vitalsScreening:    vitalsScreeningNote,
    },
    generalAppearance: extracted.general_appearance || null,
    visibleFindings:   extracted.visible_findings   || null,
    mdm:               [extracted.mdm_summary, afMdmNote].filter(Boolean).join(' ') || null,
    plan:              planAdditions.length ? planAdditions.join('\n') : null,
    planItems:         planAdditions,
    returnPrecautions: extracted.return_precautions || null,
    workCapacity: 'fit',
    billing: {
      serviceCode:     billingCode,
      durationMinutes: durationMinutes || 0,
    },
    accSection: triage.accEligible ? {
      mechanism:          triage.accInjuryDescription || null,
      bodyPart:           null,
      readCodeSuggestion: accCode.code,
      readCodeLabel:      accCode.label,
    } : null,
    suggestedReadCode: accCode.code,
    readCodeLabel:     accCode.label,
    icd10Code:         icd10.code,
    icd10Label:        icd10.description,
    _sources,
    _confidence,
    _triage,
    _additions,
  }

  console.log('[generate-notes] complete — sources:', JSON.stringify(_sources))
  res.status(200).json(result)
}

// ── ACC Read code suggestion ──────────────────────────────────────────────────
function suggestReadCode(chiefComplaint, injuryDescription) {
  const text = ((chiefComplaint || '') + ' ' + (injuryDescription || '')).toLowerCase()
  if (text.includes('ankle'))                                                      return { code:'S30', label:'Ankle sprain' }
  if (text.includes('knee'))                                                       return { code:'S83', label:'Knee ligament injury' }
  if (text.includes('shoulder'))                                                   return { code:'S40', label:'Shoulder injury' }
  if (text.includes('wrist'))                                                      return { code:'S20', label:'Wrist sprain' }
  if (text.includes('finger') || text.includes('digit'))                          return { code:'S60', label:'Finger injury' }
  if (text.includes('toe'))                                                        return { code:'S90', label:'Toe injury' }
  if (text.includes('elbow'))                                                      return { code:'S50', label:'Elbow injury' }
  if (text.includes('hip'))                                                        return { code:'S70', label:'Hip injury' }
  if (text.includes('whiplash') || (text.includes('neck') && text.includes('injur'))) return { code:'S13', label:'Neck sprain / whiplash' }
  if (text.includes('back') || text.includes('lumbar'))                           return { code:'A84', label:'Back pain' }
  if (text.includes('rib'))                                                        return { code:'S22', label:'Rib injury' }
  if (text.includes('lacerat') || text.includes('wound') || text.includes(' cut ')) return { code:'M13', label:'Laceration' }
  if (text.includes('bruise') || text.includes('contus') || text.includes('crush')) return { code:'M10', label:'Contusion / bruise' }
  if (text.includes('abrasion') || text.includes('graze'))                        return { code:'M16', label:'Abrasion' }
  if (text.includes('burn') || text.includes('scald'))                            return { code:'T14', label:'Burn / scald' }
  if (text.includes('uti') || text.includes('urinary'))                           return { code:'N17', label:'UTI' }
  if (text.includes('tonsil') || text.includes('strep'))                          return { code:'H06', label:'Tonsillitis' }
  if (text.includes('cough') || text.includes('urti') || text.includes('cold') || text.includes('throat')) return { code:'H05', label:'URTI' }
  if (text.includes('sinusit'))                                                    return { code:'H09', label:'Sinusitis' }
  if (text.includes('ear infect') || text.includes('otitis'))                     return { code:'H61', label:'Otitis media' }
  if (text.includes('cellulitis'))                                                 return { code:'M36', label:'Cellulitis' }
  if (text.includes('conjunctivit'))                                               return { code:'F70', label:'Conjunctivitis' }
  if (text.includes('chest pain') || text.includes('chest tightness'))            return { code:'K22', label:'Chest pain' }
  if (text.includes('shortness of breath') || text.includes('dyspnoea'))          return { code:'R06', label:'Dyspnoea' }
  if (text.includes('asthma') || text.includes('wheez'))                          return { code:'H33', label:'Asthma exacerbation' }
  if (text.includes('concuss') || text.includes('head injur'))                    return { code:'A80', label:'Concussion / head injury' }
  if (text.includes('headache') || text.includes('migraine'))                     return { code:'A09', label:'Headache' }
  if (text.includes('dizz') || text.includes('vertigo'))                          return { code:'A88', label:'Dizziness / vertigo' }
  if (text.includes('eye') || text.includes('vision'))                            return { code:'F29', label:'Eye injury / foreign body' }
  if (text.includes('nausea') || text.includes('vomit'))                          return { code:'J06', label:'Nausea / vomiting' }
  if (text.includes('diarrhoea') || text.includes('gastro'))                      return { code:'J22', label:'Gastroenteritis' }
  if (text.includes('abdominal') || text.includes('stomach pain'))                return { code:'J19', label:'Abdominal pain' }
  if (text.includes('rash') || text.includes('dermatit'))                         return { code:'M26', label:'Rash / dermatitis' }
  if (text.includes('fall') || text.includes('fell'))                             return { code:'S39', label:'Fall / unspecified injury' }
  return { code:'S39', label:'Other / unspecified injury' }
}

// ── ICD-10 code suggestion ────────────────────────────────────────────────────
function suggestIcd10(chiefComplaint, injuryDescription, transcript) {
  // Include transcript for higher-precision matching (e.g. provider says "ankle sprain" in transcript)
  const text = ((chiefComplaint || '') + ' ' + (injuryDescription || '') + ' ' + (transcript || '')).toLowerCase()
  if (text.includes('ankle') && (text.includes('sprain') || text.includes('ligament'))) return { code:'S93.4', description:'Sprain and strain of ankle' }
  if (text.includes('ankle'))                                                      return { code:'S99', description:'Other injury of ankle' }
  if (text.includes('knee') && text.includes('ligament'))                         return { code:'S83.6', description:'Sprain of other and unspecified parts of knee' }
  if (text.includes('knee'))                                                       return { code:'S89', description:'Other injury of knee' }
  if (text.includes('shoulder'))                                                   return { code:'S49', description:'Other injury of shoulder' }
  if (text.includes('wrist') && text.includes('sprain'))                          return { code:'S63.5', description:'Sprain of wrist' }
  if (text.includes('wrist'))                                                      return { code:'S69', description:'Other injury of wrist and hand' }
  if (text.includes('finger'))                                                     return { code:'S69.9', description:'Injury of finger, unspecified' }
  if (text.includes('toe'))                                                        return { code:'S99.9', description:'Injury of toe, unspecified' }
  if (text.includes('elbow'))                                                      return { code:'S59', description:'Other injury of elbow and forearm' }
  if (text.includes('hip'))                                                        return { code:'S79', description:'Other injury of hip' }
  if (text.includes('neck') && text.includes('whiplash'))                         return { code:'S13.4', description:'Sprain and strain of cervical spine' }
  if (text.includes('back') || text.includes('lumbar'))                           return { code:'M54.5', description:'Low back pain' }
  if (text.includes('rib'))                                                        return { code:'S22.4', description:'Multiple fractures of ribs' }
  if (text.includes('lacerat'))                                                    return { code:'S01.9', description:'Open wound of head, unspecified' }
  if (text.includes('burn') || text.includes('scald'))                            return { code:'T30', description:'Burn and corrosion, unspecified' }
  if (text.includes('uti') || text.includes('urinary'))                           return { code:'N39.0', description:'Urinary tract infection' }
  if (text.includes('tonsil') || text.includes('strep'))                          return { code:'J03', description:'Acute tonsillitis' }
  if (text.includes('urti') || text.includes('cold') || text.includes('throat'))  return { code:'J06.9', description:'Acute upper respiratory infection, unspecified' }
  if (text.includes('cough') || text.includes('bronch'))                          return { code:'J20', description:'Acute bronchitis' }
  if (text.includes('sinusit'))                                                    return { code:'J01', description:'Acute sinusitis' }
  if (text.includes('otitis') || text.includes('ear infect'))                     return { code:'H66', description:'Otitis media' }
  if (text.includes('cellulitis'))                                                 return { code:'L03', description:'Cellulitis' }
  if (text.includes('conjunctivit'))                                               return { code:'H10', description:'Conjunctivitis' }
  if (text.includes('chest pain'))                                                 return { code:'R07.4', description:'Chest pain, unspecified' }
  if (text.includes('asthma'))                                                     return { code:'J45', description:'Asthma' }
  if (text.includes('concuss'))                                                    return { code:'S09.90', description:'Concussion' }
  if (text.includes('headache') || text.includes('migraine'))                     return { code:'G43', description:'Migraine / headache' }
  if (text.includes('dizz') || text.includes('vertigo'))                          return { code:'H81', description:'Disorders of vestibular function' }
  if (text.includes('nausea') || text.includes('vomit'))                          return { code:'R11', description:'Nausea and vomiting' }
  if (text.includes('diarrhoea') || text.includes('gastro'))                      return { code:'A09', description:'Gastroenteritis' }
  if (text.includes('abdominal') || text.includes('stomach'))                     return { code:'R10.4', description:'Abdominal pain, unspecified' }
  if (text.includes('rash') || text.includes('dermatit'))                         return { code:'L30.9', description:'Dermatitis, unspecified' }
  return { code:'Z00.0', description:'General medical examination' }
}
