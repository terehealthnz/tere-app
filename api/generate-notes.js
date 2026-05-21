// api/generate-notes.js — Tere Scribe AI note generation
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    transcript = '',
    triage = {},
    vitals = null,
    prescriptions = [],
    referrals = [],
    durationMinutes = 0,
    providerName = 'Treating clinician',
    providerCredentials = '',
    consultationDate = new Date().toISOString(),
    chatMessages = [],
  } = req.body || {}

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' })

  const vitalsStr = vitals
    ? [
        vitals.hr    ? `HR: ${vitals.hr} bpm`   : null,
        vitals.rr    ? `RR: ${vitals.rr} brpm`  : null,
        vitals.spo2  ? `SpO2: ${vitals.spo2}%`  : null,
        vitals.bp    ? `BP: ${vitals.bp} mmHg`  : null,
        vitals.temp  ? `Temp: ${vitals.temp}°C` : null,
      ].filter(Boolean).join(' | ')
    : 'No vitals recorded'

  const rxStr = prescriptions.length
    ? prescriptions.map(p =>
        `  • ${p.drug}${p.dose ? ' ' + p.dose : ''}${p.frequency ? ' ' + p.frequency : ''}${p.indication ? ' — ' + p.indication : ''}`
      ).join('\n')
    : '  None issued this consultation'

  const refStr = referrals.length
    ? referrals.map(r =>
        `  • ${r.investigation || r.type || 'Imaging'}: ${r.bodyPart || r.body_part || ''}${r.priority ? ' [' + r.priority + ']' : ''}`
      ).join('\n')
    : '  None'

  const chatStr = chatMessages.filter(m => m.message).length
    ? chatMessages.filter(m => m.message).map(m =>
        `  ${m.sender === 'patient' ? 'Patient' : 'Provider'}: ${m.message}`
      ).join('\n')
    : '  No in-call chat messages'

  const billingCode = durationMinutes >= 30 ? 'CS2T' : 'CS1T'
  const consultDate = new Date(consultationDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  const consultTime = new Date(consultationDate).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })

  const age = triage.patientDob
    ? Math.floor((Date.now() - new Date(triage.patientDob)) / (365.25 * 24 * 3600 * 1000))
    : null

  const prompt = `You are Tere Scribe, the AI clinical documentation assistant for Tere Health — a New Zealand rural urgent care telehealth service.

Generate comprehensive, audit-ready clinical notes from the data below. These notes must meet:
• MCNZ and Paramedicine Council telehealth standards
• ACC audit requirements (ACC45/ACC18)
• ProviderHub billing documentation requirements
• NZ rural urgent care documentation standard of care

=== PATIENT ===
Name: ${triage.patientName || 'Unknown'}${age ? ` (Age ${age})` : ''}
DOB: ${triage.patientDob || '—'} | NHI: ${triage.patientNhi || '—'}
Phone: ${triage.patientPhone || '—'} | Email: ${triage.patientEmail || '—'}
Location: ${triage.patientLocation || '—'} (rural/remote — telehealth appropriate)

=== TRIAGE (PATIENT-REPORTED) ===
Chief complaint: ${triage.chiefComplaint || '—'}
Duration/onset: as described by patient in chief complaint
Medical history: ${triage.medicalHistory || 'Not provided'}
Current medications: ${triage.medications || 'None reported'}
Allergies: ${triage.allergies || 'None reported'}
Pharmacy: ${triage.pharmacy || '—'}

=== ACC ===
ACC eligible: ${triage.accEligible ? 'Yes' : 'No'}
Injury description: ${triage.accInjuryDescription || '—'}
Injury date: ${triage.accInjuryDate || '—'}
Employer: ${triage.accEmployer || '—'}

=== VITALS (Tere Vitals rPPG + manual) ===
${vitalsStr}

=== PRESCRIPTIONS ISSUED ===
${rxStr}

=== RADIOLOGY REFERRALS ===
${refStr}

=== IN-CALL CHAT ===
${chatStr}

=== CONSULTATION ===
Provider: ${providerName}${providerCredentials ? ' | ' + providerCredentials : ''}
Date: ${consultDate} at ${consultTime} | Duration: ${durationMinutes} min | Type: Video telehealth | Billing: ${billingCode}

=== WHISPER TRANSCRIPT ===
${transcript || '[No transcript — recording declined or unavailable. Base examination on vitals only and note: "Examination limited to vitals assessment via video. No audio transcript available."]'}

=== GENERATION INSTRUCTIONS ===
1. TRANSCRIPT IS THE PRIMARY SOURCE for examination findings and MDM.
   Extract verbatim provider findings: "I can see...", "on inspection...", "range of motion...", "neurovascularly intact", etc.
   Extract provider's MDM: differentials spoken aloud, clinical decision rules (Ottawa, PECARN, HEART score, etc.), risk stratification, red flags excluded.

2. Write presentingHistory as a clinical narrative paragraph in third person past tense:
   cover onset, character, severity, radiation, associated symptoms, aggravating/relieving factors, timing, what patient has tried.

3. For exam subsections with NO transcript content, write: "Not clinically indicated — N/A"
   For "general" always summarise appearance from video even without transcript.
   Always populate "vitals" from the vitals data above.

4. highlighted array: list the 2-4 exam sections most relevant to the chief complaint.
   Logic: ankle/foot/knee → msk | resp/cough/chest pain → respiratory,cardiac | skin/rash → skin | abdo/nausea → abdomen | head/dizzy → neurological,heent | eye → heent

5. accSection.readCodeSuggestion — pick the single best matching code from this list:
   S30 Ankle sprain | S39 Other ankle injury | M13 Laceration | M10 Contusion | N17 UTI
   H05 URTI | H06 Tonsillitis | K22 Chest pain | A84 Back pain | S20 Wrist sprain
   F29 Eye injury | S60 Finger injury | T14 Burn | A09 Headache | R05 Cough | J06 Nausea/vomiting

6. workCapacity: "fit" unless transcript/complaint indicates injury affects work capacity.

Return ONLY valid JSON, no markdown fences, no preamble:
{
  "presentingHistory": "Clinical narrative paragraph...",
  "medicalHistory": "Conditions | Surgical history | Hospitalisations. Write NKHA if not provided.",
  "allergies": "NKDA" or "Drug — reaction; Drug — reaction",
  "socialHistory": "Occupation. Employer. Location (rural — telehealth appropriate). Smoking/alcohol if mentioned.",
  "examination": {
    "general": "Alert and oriented. Appearance, distress level from video assessment.",
    "vitals": "${vitalsStr}",
    "heent": "...",
    "cardiac": "...",
    "respiratory": "...",
    "abdomen": "...",
    "skin": "...",
    "msk": "...",
    "neurological": "...",
    "highlighted": ["msk"]
  },
  "mdm": "1. Differentials considered\\n2. Clinical decision rules applied (name each rule)\\n3. Risk stratification\\n4. Reason for investigations ordered\\n5. Reason for prescription(s)\\n6. Red flags excluded",
  "plan": "1. [action]\\n2. [action]\\n3. [ACC/referral/follow-up]\\n4. Return precautions — symptoms to watch for\\n5. Work capacity: [Fit / Modified duties / Unfit — duration]",
  "accSection": {
    "claimType": "New injury",
    "mechanism": "...",
    "bodyPart": "...",
    "readCodeSuggestion": "S30",
    "readCodeLabel": "Ankle sprain",
    "injuryDate": "${triage.accInjuryDate || ''}",
    "incapacityForWork": false,
    "returnToWorkDate": null,
    "restrictions": null
  },
  "billing": {
    "serviceCode": "${billingCode}",
    "durationMinutes": ${durationMinutes},
    "consultationType": "Video"
  },
  "suggestedReadCode": "S30",
  "readCodeLabel": "Ankle sprain",
  "workCapacity": "fit"
}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!r.ok) throw new Error(await r.text())
    const data = await r.json()
    const raw = data.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    res.status(200).json(JSON.parse(raw))
  } catch (e) {
    console.error('generate-notes error:', e)
    res.status(500).json({ error: e.message })
  }
}
