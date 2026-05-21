const MESSAGE_KEYWORDS = [
  'prescription repeat','repeat script','repeat prescription','repeat medication',
  'follow up','follow-up','followup',
  'results','test results','lab results',
  'referral letter','referral',
  'medication question','medication advice',
  'rash photo','skin photo','minor rash',
  'same as before','same issue','same problem','same condition',
  'returning patient','back again',
]

const VIDEO_FORCE_KEYWORDS = [
  'injury','injured','hurt','accident','fell','fall','trip',
  'acc','work injury','sport','sports',
  'chest','breathing','breathe','breath','short of breath',
  'child','children','baby','infant','toddler',
  'mental health','anxiety','depression','panic','suicid',
  'new symptom','never had','getting worse','worsening',
  'fever','temperature','hot','chills',
  'infection','infected','spreading',
  'swelling','swollen','inflammation',
  'severe pain','sharp pain','stabbing pain',
  'urgent','emergency','serious',
  'bleeding','blood loss','blood in urine','blood in stool','coughing blood','wound','cut',
  'vomit','nausea',
  'dizziness','dizzy','faint','fainting',
  'seizure','fit','convuls',
]

export function scoreComplaint(complaint, isReturning = false) {
  const lower = (complaint || '').toLowerCase()

  const needsVideo = VIDEO_FORCE_KEYWORDS.some(kw => lower.includes(kw))
  if (needsVideo) return { allowVideo: true, allowPhone: true, allowMessage: false }

  const isMessageAppropriate = MESSAGE_KEYWORDS.some(kw => lower.includes(kw))
  return {
    allowVideo: true,
    allowPhone: true,
    allowMessage: isMessageAppropriate && isReturning,
  }
}

export const CONSULT_PRICES = {
  video:   { private: 65, acc: 25 },
  phone:   { private: 45, acc: 15 },
  message: { private: 25, acc: 25 }, // no ACC discount for message
}

export const CONSULT_TYPE_LABELS = {
  video:   { icon: '📹', label: 'Video' },
  phone:   { icon: '📞', label: 'Phone' },
  message: { icon: '💬', label: 'Message' },
}
