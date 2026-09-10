#!/usr/bin/env python3
"""
Derive the NP (Nurse Practitioner) Contractor Agreement from the
doctor v8.1 JSON. This is a lawyer-review-pending stopgap so we can
onboard NP contractors before Heather drafts a purpose-built version.

Substitutions:
  - Fee: NZ$25 -> NZ$20
  - Regulator: MCNZ -> NCNZ (Nursing Council of NZ)
  - Practitioner type: "medical practitioner" -> "nurse practitioner"
  - Standards references:
      "Good Medical Practice" -> "Code of Conduct for Nurses"
      "MCNZ Statement on Cultural Safety" -> "NCNZ Guideline: Cultural Safety"
      "MCNZ Statement on Telehealth" -> "NCNZ Telehealth Guidance"
  - Cover page role tag: "Doctor" -> "Nurse Practitioner"
  - Supervisor default (Rachel Thomas) is left untouched — even NPs
    would use her as a designated escalation contact, per Patrick's
    call. Heather to confirm on lawyer-review pass.

Idempotent: re-running produces the same output. Not idempotent
against itself as a source (i.e. it reads doctor v8_1.json, not the
NP file).

Usage:
    python3 scripts/contract-extract/derive-np-from-doctor.py
"""
import json
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DOCTOR = os.path.join(REPO, 'src', 'contracts', 'v8_1.json')
NP     = os.path.join(REPO, 'src', 'contracts', 'v8_1_np.json')

# Order matters — do the longer/most-specific replacements first so
# they don't get mangled by shorter ones.
REPLACEMENTS = [
    # Standards references (all forms) — must run before bare MCNZ.
    (re.compile(r'MCNZ Good Medical Practice'), 'NCNZ Code of Conduct for Nurses'),
    (re.compile(r"MCNZ Good Medical Practice"), 'NCNZ Code of Conduct for Nurses'),
    (re.compile(r'MCNZ Statement on Cultural Safety'), 'NCNZ Guideline: Cultural Safety'),
    (re.compile(r'MCNZ Statement on Telehealth'), 'NCNZ Telehealth Guidance'),
    (re.compile(r'Statement on Telehealth'),      'Telehealth Guidance'),
    (re.compile(r'Good Medical Practice'),        'Code of Conduct for Nurses'),
    # Long-form regulator name.
    (re.compile(r'Medical Council of New Zealand'), 'Nursing Council of New Zealand'),
    # Practitioner type
    (re.compile(r'medical practitioner'), 'nurse practitioner'),
    (re.compile(r'Medical Practitioner'), 'Nurse Practitioner'),
    # Bare MCNZ (last, after the specific standards names)
    (re.compile(r'MCNZ'), 'NCNZ'),
    # Fee: doctor JSON is already {{fee_per_consult}}, so this is a
    # no-op after 2026-09-10 fee parameterization. Kept for the case
    # where a raw doctor JSON is fed in.
    (re.compile(r'NZ\$25'), '{{fee_per_consult}}'),
    # Cover-page role marker
    (re.compile(r'^Doctor$'), 'Nurse Practitioner'),
]


def transform(text):
    out = text
    for pat, repl in REPLACEMENTS:
        out = pat.sub(repl, out)
    return out


def main():
    with open(DOCTOR) as f:
        doc = json.load(f)

    # Header block: title stays "Independent Contractor Services Agreement"
    # but the role subtitle flips from "Doctor" to "Nurse Practitioner".
    for n in doc['nodes']:
        if isinstance(n.get('text'), str):
            n['text'] = transform(n['text'])

    doc['version'] = 'v8.1-np'
    doc['title']   = 'Independent Contractor Services Agreement (Nurse Practitioner)'

    with open(NP, 'w') as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)

    print(f"wrote NP contract: {NP} ({len(doc['nodes'])} nodes)")


if __name__ == '__main__':
    sys.exit(main() or 0)
