-- Add Ciproxin HC (ciprofloxacin 0.2% + hydrocortisone 1%) ear drops to
-- shared_prescription_templates.
--
-- Rationale: existing template #12 ('Otitis externa (mild) — topical
-- ciprofloxacin') covers plain ciprofloxacin 0.3% ear drops — appropriate
-- for mild OE without visible inflammation. In NZ primary care, the HC
-- combination is often first-line because most OE presentations have canal
-- oedema / pain that the hydrocortisone component settles faster than
-- ciprofloxacin alone. Providers now have both quick-picks so they can
-- choose based on exam.
--
-- Safe with intact OR perforated tympanic membrane and with tympanostomy
-- tubes (unlike aminoglycoside drops). Approved for adults and children
-- 1 year and over.
--
-- Idempotent: ON CONFLICT on the lower(name) unique index.

INSERT INTO shared_prescription_templates
  (name, condition, drug_name,
   default_strength, default_form, default_dose, default_route,
   default_frequency, default_duration, default_quantity, default_repeats,
   default_directions, safety_net_text,
   is_paediatric, weight_based_dose, controlled_drug, source)
VALUES
  ('Otitis externa (moderate) — ciprofloxacin + hydrocortisone',
   'Acute otitis externa with canal swelling / inflammation on otoscopy',
   'ciprofloxacin + hydrocortisone',
   '0.2% + 1%', 'ear drops', '3 drops to affected ear', 'topical',
   'BD', '7 days', '10mL bottle', 0,
   'Shake bottle well. Warm in hands for a minute before use (cold drops can cause dizziness). Instil 3 drops into the affected ear twice daily for 7 days. Lie on the opposite side for 3-5 minutes after each dose to let the drops reach the canal. Keep the ear dry between doses — no swimming or shampoo water in the canal.',
   'Return if pain worsens despite drops, fever develops, hearing loss persists more than 48h after other symptoms settle, facial weakness, or discharge becomes bloody or foul-smelling. Diabetic or immunocompromised patients: urgent review if symptoms escalate (malignant otitis externa risk). Expect improvement within 48-72h — if not, reconsider the diagnosis (fungal OE, foreign body).',
   false, NULL, false, 'BPAC 2023 otitis externa guide / NZF cipro+hydrocortisone')
ON CONFLICT ((lower(name))) DO NOTHING;

-- Report what landed.
SELECT name, drug_name, default_strength, default_duration
  FROM shared_prescription_templates
 WHERE lower(name) = 'otitis externa (moderate) — ciprofloxacin + hydrocortisone';
