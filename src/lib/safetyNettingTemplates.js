// Structured safety-netting templates for common presentations (task #417).
// Provider picks a template, then edits it — the edited text is stored on
// the consultation record and included in the patient-facing summary /
// after-visit email. Every HDC + coronial telehealth finding I know of
// turns on whether the patient knew what to do if things got worse.
//
// Templates are deliberately conservative: err toward "seek care" not
// "wait and see." Provider can loosen; can't tighten below the minimum.

export const SAFETY_NET_TEMPLATES = [
  {
    id: 'viral_uri',
    label: 'Viral URI / cough / cold',
    text:
`Most viral respiratory illnesses settle over 5–10 days.

Come back or seek care if:
• You develop shortness of breath at rest, or can't finish a sentence
• Chest pain, or coughing up blood
• Symptoms worsen after day 5 (fever returning, feeling much worse)
• Confusion, drowsiness, or you feel very unwell

Call 111 immediately if: severe breathing difficulty, blue lips, chest pain, or collapse.

Otherwise, review with your GP or Tere within 7 days if not improving.`
  },
  {
    id: 'skin_infection',
    label: 'Skin infection / cellulitis',
    text:
`Redness should stop spreading within 48 hours and start fading within 3–4 days on antibiotics.

Come back or seek in-person care today if:
• Redness spreads further despite antibiotics (mark the edge with a pen)
• Fever, chills, or feeling systemically unwell
• Increasing pain, swelling, or pus
• Red streaks tracking up the limb

Call 111 or go to ED immediately if: rapidly spreading redness, high fever, confusion, or the area becomes numb/very painful (concern for necrotising infection).

Complete the full course of antibiotics even if it looks better.`
  },
  {
    id: 'uti',
    label: 'UTI (uncomplicated)',
    text:
`Symptoms should improve within 48 hours of starting antibiotics.

Come back or seek in-person care today if:
• Fever, back or flank pain, or vomiting (concern for kidney infection)
• Blood in urine that is new or getting worse
• Symptoms persist or worsen after 48 hours on antibiotics
• You feel systemically unwell

Call 111 if severe flank pain with fever, or you become confused/very unwell.

Drink plenty of water. Complete the full antibiotic course.`
  },
  {
    id: 'msk_injury',
    label: 'MSK injury / sprain / strain',
    text:
`Rest, ice, compression, elevation for 48–72 hours. Gradual return to movement as tolerated.

Come back or seek in-person review if:
• You cannot bear weight or use the limb at all
• Numbness, tingling, or pale/cold fingers or toes
• Deformity, or pain out of proportion to injury
• Swelling that keeps worsening after 48 hours
• Pain not settling by day 5–7

Call 111 or go to ED if: obvious deformity, open fracture, or the limb is pale/cold/numb.

Follow up with your GP or Tere if not settling by 1 week, or if you need physiotherapy.`
  },
  {
    id: 'gastro',
    label: 'Gastroenteritis / D&V',
    text:
`Small frequent sips of fluid — oral rehydration solution is best. Symptoms usually settle within 3 days.

Come back or seek in-person care today if:
• Unable to keep any fluids down for more than 6 hours
• Blood in vomit or stools
• Severe abdominal pain, or pain localised to one area
• Signs of dehydration: dizzy when standing, very dry mouth, passing little urine
• Fever above 39°C, or feeling very unwell

Call 111 or go to ED if: signs of severe dehydration, severe pain, or confusion.

Especially concerning in infants, older adults, or if you have diabetes/kidney disease — lower threshold to seek care.`
  },
  {
    id: 'back_pain',
    label: 'Back pain (simple mechanical)',
    text:
`Stay as active as pain allows — bed rest slows recovery. Simple pain relief regularly for 3–5 days.

Come back or seek in-person care today if:
• Numbness or weakness in your legs
• Loss of control of bladder or bowels, or numbness around the saddle area
• Fever with back pain
• Pain following significant trauma
• Pain worsening despite regular pain relief after 5–7 days

Call 111 or go to ED if any red-flag symptoms above (especially bowel/bladder changes or saddle numbness — this is an emergency).

Most simple back pain settles within 2 weeks. Follow up with GP or Tere if not improving.`
  },
  {
    id: 'mental_health',
    label: 'Mental health / anxiety',
    text:
`Support lines are available 24/7 and free:
• 1737 — Need to talk? (call or text, free)
• Lifeline 0800 543 354
• Youthline 0800 376 633
• Samaritans 0800 726 666

Come back or seek in-person care today if:
• Thoughts of harming yourself or others become stronger or more specific
• You feel unable to keep yourself safe
• New confusion, unusual thoughts, or hearing/seeing things others don't
• You feel unable to cope with day-to-day life

Go to ED or call 111 immediately if: you feel unsafe, you have made plans to harm yourself, or someone else is at immediate risk.

Follow up with your GP or Tere for ongoing support. You are not alone.`
  },
  {
    id: 'generic',
    label: 'Generic (blank template — customise)',
    text:
`Most people with this presentation improve within [timeframe].

Come back or seek in-person care today if:
• [specific worsening feature]
• [specific worsening feature]
• You feel systemically unwell

Call 111 or go to ED immediately if: [specific red-flag features].

Follow up with your GP or Tere if not improving by [date/timeframe].`
  },
]

export const SAFETY_NET_MIN_CHARS = 40
