-- Task #229 — Seed content for shared_prescription_templates.
--
-- 12 common NZ primary-care starter templates. Dosing cross-checked
-- against NZ Formulary release 171 (src/lib/nzf-formulary.json). All
-- non-controlled, all appropriate for telehealth prescribing.
--
-- Idempotent: ON CONFLICT on the lower(name) unique index leaves
-- admin-tweaked rows alone if this seed is re-run.

INSERT INTO shared_prescription_templates
  (name, condition, drug_name,
   default_strength, default_form, default_dose, default_route,
   default_frequency, default_duration, default_quantity, default_repeats,
   default_directions, safety_net_text,
   is_paediatric, weight_based_dose, controlled_drug, source)
VALUES
  -- 1. Acute otitis media (paeds, amoxicillin) — first-line for severe or
  --    bilateral OM in <2y, or systemic features. NZF paeds dose 15 mg/kg TDS.
  ('Acute otitis media (paeds) — amoxicillin',
   'Acute otitis media in a child (moderate/severe or <2y bilateral)',
   'amoxicillin',
   '250mg/5mL', 'oral suspension', 'see weight-based guidance', 'oral',
   'TDS', '5 days', '100mL', 0,
   'Give three times daily for 5 days. Shake bottle well before each dose. Complete the course even if the ear feels better.',
   'Return if fever persists >48h, ear discharge, severe pain not settling with paracetamol, or child appears more unwell.',
   true,
   '{"mg_per_kg_per_dose": 15, "max_mg_per_dose": 500, "notes": "15 mg/kg three times daily. Cap 500 mg per dose. Under 3 months old — refer, do not template."}'::jsonb,
   false, 'NZF 171 / BPAC ear infection guideline'),

  -- 2. Uncomplicated UTI, adult non-pregnant female — nitrofurantoin
  --    first-line per BPAC empirical guidelines.
  ('Uncomplicated UTI (adult female) — nitrofurantoin',
   'Uncomplicated lower UTI, non-pregnant adult female, eGFR ≥45',
   'nitrofurantoin',
   '50mg', 'capsules', '1 capsule', 'oral',
   'QID', '5 days', '20 capsules', 0,
   'Take one capsule four times a day for 5 days, with food. Drink plenty of water.',
   'Return if fever, loin pain, vomiting, or symptoms persist beyond 48h — may need a different antibiotic. Not for eGFR <45.',
   false, NULL, false, 'BPAC 2023 UTI empirical antibiotic guide'),

  -- 3. Strep pharyngitis — phenoxymethylpenicillin (adult). Paeds is a
  --    weight-based template on the same drug (below).
  ('Strep pharyngitis (adult) — penicillin V',
   'Group A streptococcal pharyngitis (Centor/FeverPAIN suggestive), adult',
   'phenoxymethylpenicillin',
   '500mg', 'tablets', '1 tablet', 'oral',
   'BD', '10 days', '20 tablets', 0,
   'Take one tablet twice daily for 10 full days, even if throat improves earlier. Complete the course to prevent rheumatic fever.',
   'Return if unable to swallow, drooling, muffled voice, or fever >48h. Rheumatic fever prophylaxis requires the full 10-day course.',
   false, NULL, false, 'NZ Heart Foundation NZ rheumatic fever guideline'),

  -- 4. Cellulitis, mild, non-facial — flucloxacillin adult.
  ('Cellulitis (mild, adult) — flucloxacillin',
   'Mild cellulitis, non-facial, patient systemically well',
   'flucloxacillin',
   '500mg', 'capsules', '1 capsule', 'oral',
   'QID', '7 days', '28 capsules', 0,
   'Take one capsule four times a day for 7 days, on an empty stomach (1 hour before or 2 hours after food). Mark the leading edge with a pen so you can see if it spreads.',
   'Return immediately if the redness advances past the pen line, fever develops, lymphangitis (red streaks), or systemic symptoms — may need IV antibiotics.',
   false, NULL, false, 'BPAC 2022 skin infection guideline'),

  -- 5. Community-acquired pneumonia, mild — amoxicillin adult.
  ('Community-acquired pneumonia (mild, adult) — amoxicillin',
   'CAP CRB-65 0-1, patient well enough for oral therapy',
   'amoxicillin',
   '500mg', 'capsules', '1 capsule', 'oral',
   'TDS', '5 days', '15 capsules', 0,
   'Take one capsule three times daily for 5 days. Rest, fluids, paracetamol for fever.',
   'Return / call 111 if breathing worsens, chest pain, confusion, unable to tolerate fluids, or fever persists past 3 days.',
   false, NULL, false, 'BPAC 2024 lower respiratory tract infection guideline'),

  -- 6. Acute bronchitis — no antibiotic (safety-net template). The value
  --    of this template is codifying "don't prescribe" as a first-line
  --    starting point with counsel + safety-net wording ready to go.
  ('Acute bronchitis (adult) — no antibiotic',
   'Acute bronchitis in an otherwise well adult (viral, self-limiting)',
   'paracetamol',
   '500mg', 'tablets', '2 tablets (1g)', 'oral',
   'QID', 'as needed for symptoms', '100 tablets', 0,
   'Symptomatic management only — no antibiotic indicated. Take up to 1g four times daily for cough discomfort / fever. Rest, fluids, honey/lemon.',
   'Cough may last 2–3 weeks. Return if fever >38.5°C beyond 4 days, breathing difficulty, chest pain, coughing up blood, or new confusion — could indicate pneumonia.',
   false, NULL, false, 'NICE NG120 / BPAC antibiotic stewardship'),

  -- 7. Impetigo, limited — topical fusidic acid.
  ('Impetigo (limited) — topical fusidic acid',
   'Localised non-bullous impetigo, ≤3 lesions',
   'fusidic acid',
   '2%', 'cream', 'thin layer to lesions', 'topical',
   'TDS', '5 days', '15g tube', 0,
   'Apply a thin layer to each lesion three times daily for 5 days. Wash hands before and after. Keep lesions covered where possible; do not share towels.',
   'Return if lesions spread, new lesions appear, systemic symptoms, or no improvement by day 3 — may need oral flucloxacillin.',
   false, NULL, false, 'BPAC 2022 skin infection guideline'),

  -- 8. Eczema flare — topical steroid + emollient advice.
  ('Eczema flare (mild-moderate, adult) — hydrocortisone',
   'Mild-to-moderate eczema flare on trunk/limbs (not face/flexures)',
   'hydrocortisone',
   '1%', 'cream', 'thin layer to affected areas', 'topical',
   'BD', '7 days, then step down', '30g tube', 1,
   'Apply thinly twice daily for up to 7 days, then reduce to once daily as skin settles. Continue emollient (e.g. Cetomacrogol) at least twice daily as a moisturiser — apply liberally, generic pump size is fine. Do not use hydrocortisone on the face; ask if flare involves face.',
   'Return if worsens, spreading crusting/pus (secondary infection), or no improvement in 7 days. Face/eyelid involvement needs a face-safe steroid — book a review.',
   false, NULL, false, 'DermNet NZ / BPAC eczema guideline'),

  -- 9. Migraine — naproxen + antiemetic combo.
  ('Migraine attack (adult) — naproxen + metoclopramide',
   'Acute migraine attack in an adult with a prior migraine diagnosis',
   'naproxen',
   '500mg', 'tablets', '1 tablet at onset, may repeat once after 6-8h', 'oral',
   'PRN', 'as needed for attack (max 2 doses/24h)', '10 tablets', 1,
   'Take one 500mg naproxen tablet at the first sign of migraine, with food. Can repeat once after 6-8 hours. Do not exceed 2 tablets in 24 hours. Also prescribed: metoclopramide 10mg — take one tablet at onset if nausea (max 3 doses/24h, avoid if under 30y). Lie in a dark quiet room.',
   'Seek urgent care for: sudden severe "thunderclap" headache, headache with fever + neck stiffness, neurological symptoms lasting >1 hour, weakness or numbness, first-ever migraine >50y, or attacks worsening in frequency.',
   false, NULL, false, 'BPAC 2023 migraine management'),

  -- 10. Gout flare — naproxen (no allopurinol change during flare).
  ('Acute gout flare (adult) — naproxen',
   'Acute gout flare, no contraindication to NSAID',
   'naproxen',
   '500mg', 'tablets', '1 tablet', 'oral',
   'BD', '5 days or until 48h after flare settles', '14 tablets', 0,
   'Take one 500mg tablet twice daily with food for up to 5 days, or until 48 hours after the flare has settled — whichever is sooner. Rest and elevate the joint.',
   'Return if unable to tolerate NSAIDs (GI bleed history, renal impairment, heart failure), if pain not settling by day 3, or if fever / joint appears infected. Do NOT start or stop allopurinol during a flare — continue existing prophylaxis.',
   false, NULL, false, 'BPAC 2023 gout management'),

  -- 11. Tinea corporis / pedis — topical clotrimazole.
  ('Tinea (body/foot) — topical clotrimazole',
   'Localised tinea corporis or tinea pedis in an immunocompetent adult',
   'clotrimazole',
   '1%', 'cream', 'thin layer to affected area + 2cm margin', 'topical',
   'BD', '2 weeks (continue 1 week after clearance)', '20g tube', 1,
   'Apply thinly twice daily to the rash and 2cm of surrounding skin. Continue for at least 1 week after the rash clears (usually 2-4 weeks total). Keep the area clean and dry; change socks daily; do not share towels.',
   'Return if no improvement after 2 weeks, if it spreads, involves nails, or scalp (needs oral antifungal). Scalp/nail tinea is NOT for topical treatment.',
   false, NULL, false, 'DermNet NZ tinea guideline'),

  -- 12. Otitis externa, mild — topical ciprofloxacin drops.
  ('Otitis externa (mild) — topical ciprofloxacin',
   'Mild acute otitis externa, intact tympanic membrane',
   'ciprofloxacin',
   '0.3%', 'ear drops', '4 drops to affected ear', 'topical',
   'BD', '7 days', '5mL bottle', 0,
   'Instil 4 drops into the affected ear twice daily for 7 days. Lie on the opposite side for 3-5 minutes after each dose to allow drops to work. Keep the ear dry — no swimming or hair-washing water in the canal.',
   'Return if pain worsens, discharge changes to bloody/foul-smelling, hearing loss beyond mild muffling, fever, or facial weakness. Do NOT use if ear drum may be perforated (severe pain, prior grommets, sudden hearing loss).',
   false, NULL, false, 'BPAC 2023 otitis externa guide')

ON CONFLICT ((lower(name))) DO NOTHING;
