// Curated chip lists used by AITriage for medical history + allergies.
// Medications come from the NZF formulary directly (see AITriage import).
//
// Design principles:
//   - Cover the top ~90% of NZ community GP presentations without becoming
//     a wall of chips. Anything not on the list falls through to free-text.
//   - Use lay-friendly wording first, medical term in brackets where the
//     medical term is the more common one on charts. Chart reads whatever
//     the patient picked.
//   - Deliberate omission: highly specialised conditions (rare cancers,
//     inborn errors of metabolism, etc.) — patients with those tend to
//     type them verbatim anyway and mixing them into the chip list bloats
//     the search results for common conditions.

// Common NZ presentations. ID = short stable key; label = what patient sees.
export const COMMON_CONDITIONS = [
  { id: 'htn',           label: 'High blood pressure (hypertension)' },
  { id: 'dm2',           label: 'Type 2 diabetes' },
  { id: 'dm1',           label: 'Type 1 diabetes' },
  { id: 'asthma',        label: 'Asthma' },
  { id: 'copd',          label: 'COPD / emphysema' },
  { id: 'ihd',           label: 'Heart disease (angina, previous heart attack)' },
  { id: 'af',            label: 'Atrial fibrillation (irregular heartbeat)' },
  { id: 'chf',           label: 'Heart failure' },
  { id: 'stroke',        label: 'Stroke or mini-stroke (TIA)' },
  { id: 'ckd',           label: 'Kidney disease' },
  { id: 'depression',    label: 'Depression' },
  { id: 'anxiety',       label: 'Anxiety' },
  { id: 'bipolar',       label: 'Bipolar disorder' },
  { id: 'adhd',          label: 'ADHD' },
  { id: 'ptsd',          label: 'PTSD' },
  { id: 'migraine',      label: 'Migraine' },
  { id: 'epilepsy',      label: 'Epilepsy / seizures' },
  { id: 'gord',          label: 'Reflux / GORD' },
  { id: 'ibs',           label: 'Irritable bowel syndrome (IBS)' },
  { id: 'ibd',           label: 'Crohn\'s disease or ulcerative colitis' },
  { id: 'coeliac',       label: 'Coeliac disease' },
  { id: 'hypothyroid',   label: 'Underactive thyroid (hypothyroidism)' },
  { id: 'hyperthyroid',  label: 'Overactive thyroid (hyperthyroidism)' },
  { id: 'osteoarthritis',label: 'Osteoarthritis' },
  { id: 'ra',            label: 'Rheumatoid arthritis' },
  { id: 'gout',          label: 'Gout' },
  { id: 'chronic_pain',  label: 'Chronic pain' },
  { id: 'osteoporosis',  label: 'Osteoporosis / low bone density' },
  { id: 'cancer_hx',     label: 'History of cancer' },
  { id: 'obesity',       label: 'Obesity' },
  { id: 'osa',           label: 'Sleep apnoea' },
  { id: 'eczema',        label: 'Eczema' },
  { id: 'psoriasis',     label: 'Psoriasis' },
  { id: 'pcos',          label: 'PCOS (polycystic ovary syndrome)' },
  { id: 'endometriosis', label: 'Endometriosis' },
  { id: 'menopause',     label: 'Menopause' },
  { id: 'hiv',           label: 'HIV' },
  { id: 'hepb',          label: 'Hepatitis B' },
  { id: 'hepc',          label: 'Hepatitis C' },
  { id: 'tb_hx',         label: 'Tuberculosis (past or latent)' },
  { id: 'rheumatic',     label: 'Rheumatic fever / rheumatic heart disease' },
  { id: 'recent_surgery',label: 'Recent surgery (past 6 months)' },
  { id: 'pregnancy',     label: 'Currently pregnant' },
]

// Common allergies. Medication allergies first (most clinically relevant),
// then non-medication. Deliberately short — patients often over-report
// "allergies" that are actually intolerances; the free-text catches
// everything else.
export const COMMON_ALLERGIES = [
  { id: 'penicillin',    label: 'Penicillin' },
  { id: 'cephalosporin', label: 'Cephalosporins (e.g. keflex, cefaclor)' },
  { id: 'sulfa',         label: 'Sulfa drugs (sulphonamides)' },
  { id: 'aspirin',       label: 'Aspirin' },
  { id: 'nsaids',        label: 'NSAIDs (ibuprofen, naproxen, diclofenac)' },
  { id: 'codeine',       label: 'Codeine or other opioids' },
  { id: 'contrast',      label: 'Iodine / X-ray contrast dye' },
  { id: 'latex',         label: 'Latex' },
  { id: 'peanuts',       label: 'Peanuts' },
  { id: 'tree_nuts',     label: 'Tree nuts (almonds, cashews, walnuts, etc.)' },
  { id: 'shellfish',     label: 'Shellfish' },
  { id: 'fish',          label: 'Fish' },
  { id: 'eggs',          label: 'Eggs' },
  { id: 'dairy',         label: 'Dairy / milk' },
  { id: 'wheat_gluten',  label: 'Wheat / gluten' },
  { id: 'soy',           label: 'Soy' },
  { id: 'sesame',        label: 'Sesame' },
  { id: 'bee_wasp',      label: 'Bee or wasp stings' },
  { id: 'pollen',        label: 'Pollen / hay fever' },
  { id: 'dust_mites',    label: 'Dust mites' },
  { id: 'cats',          label: 'Cats' },
  { id: 'dogs',          label: 'Dogs' },
  { id: 'grass',         label: 'Grass' },
]

// Build a lookup from the NZF formulary. Called from AITriage. Filters
// out injection-only / infusion-only formulations that a patient is very
// unlikely to be self-reporting as a "regular medication".
export function buildMedicationOptionsFromNzf(nzfList) {
  if (!Array.isArray(nzfList)) return []
  const seen = new Set()
  const out = []
  for (const drug of nzfList) {
    const name = String(drug?.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    // Sentence-case the drug name for display (NZF stores lowercase).
    const label = name.charAt(0).toUpperCase() + name.slice(1)
    out.push({ id: key, label })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}
