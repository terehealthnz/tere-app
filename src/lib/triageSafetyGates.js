// Triage safety gates (task #416). Two hard-coded tiers of questions that
// sit AHEAD of the AI triage / video-consult pathway. Reviewed at consult
// close by the clinical governance framework; changes here need CGM sign-off.
//
// Tier 1 — RED_FLAGS: any YES = immediate 111 call. Life-threat.
// Tier 2 — DIVERT_FLAGS: any YES = in-person / GP / urgent care today. NOT
// 111 but ALSO not safe to close on video. Reflects the highest-frequency
// telehealth safety failures (HDC/coronial findings): paediatric fever
// under 3mo, sudden severe pain in high-consequence body regions, head
// injury with concerning features, pregnancy complications, suspected
// fractures, sudden neuro/mental changes, active self-harm ideation.
//
// System-enforced — not left to AI or provider judgement. If any DIVERT
// answer is YES, the patient cannot proceed to the video pathway on this
// consultation.

export const RED_FLAGS = [
  { id: 'chest_pain',   q: 'Do you have chest pain, chest tightness, or pain spreading to your arm or jaw?' },
  { id: 'breathing',    q: 'Are you having severe difficulty breathing or feeling like you cannot breathe?' },
  { id: 'stroke',       q: 'Do you have sudden face drooping, arm weakness, or speech difficulty?' },
  { id: 'unconscious',  q: 'Have you been unconscious, or are you very difficult to wake up?' },
  { id: 'major_bleed',  q: 'Do you have severe bleeding that will not stop with pressure?' },
  { id: 'major_trauma', q: 'Have you had a serious fall, car crash, or major impact injury?' },
  { id: 'allergic',     q: 'Are you having a severe allergic reaction (throat swelling, hives all over, collapse)?' },
]

export const DIVERT_FLAGS = [
  { id: 'infant_under_3mo',        q: 'Is this consultation for a baby less than 3 months old?' },
  { id: 'severe_localised_pain',   q: 'Do you have severe (worst-you-have-had) pain in your abdomen, testicles, groin, or back that came on suddenly?' },
  { id: 'head_injury_features',    q: 'Have you had a head injury with any loss of consciousness, vomiting, confusion, or ongoing headache?' },
  { id: 'pregnancy_complication',  q: 'Are you pregnant and having any bleeding, severe headache, vision changes, or reduced baby movements?' },
  { id: 'suspected_fracture',      q: 'Do you have a suspected broken bone, deep cut, or a wound that may need stitches?' },
  { id: 'thunderclap_headache',    q: 'Have you had a sudden severe headache (worst of your life) or new confusion?' },
  { id: 'self_harm_ideation',      q: 'Are you having new or worsening thoughts of harming yourself or others?' },
  { id: 'new_neuro_symptoms',      q: 'Do you have new numbness, weakness, or vision loss that has not been checked by a doctor?' },
]

// Reason strings surfaced on the divert screen so the patient understands
// why we cannot proceed by video. Keep them plain-language.
export const DIVERT_REASONS = {
  infant_under_3mo:       'Babies under 3 months need in-person assessment for even mild symptoms.',
  severe_localised_pain:  'Sudden severe pain in these areas needs hands-on examination to rule out serious causes.',
  head_injury_features:   'Head injuries with these features need direct assessment — video is not safe.',
  pregnancy_complication: 'These pregnancy signs need in-person review or ED assessment the same day.',
  suspected_fracture:     'Fractures and wounds need physical examination and often imaging or stitching.',
  thunderclap_headache:   'Sudden severe headache or new confusion needs urgent in-person assessment.',
  self_harm_ideation:     'We want you seen by someone in person today. Please contact 1737 (free text or call) or attend ED.',
  new_neuro_symptoms:     'New neurological symptoms need in-person assessment.',
}

// The set of divert IDs whose recommended action is ED / 1737 today (not
// just "GP this week"). Used to escalate the divert screen's tone.
export const DIVERT_ED_SAME_DAY = new Set([
  'infant_under_3mo',
  'severe_localised_pain',
  'head_injury_features',
  'pregnancy_complication',
  'thunderclap_headache',
  'self_harm_ideation',
])
