#!/usr/bin/env python3
"""
Slim v8.1 JSON contract:

Strip professional-registration placeholders (MCNZ, CPN, ACC Provider ID,
HPI, IRD, GST) from the identity block and Schedule 1. Keep only
contractor_full_name, contractor_address, contractor_notice_email as
inline data.

Rationale (see the send-contract flow design doc):

    A contractor agreement legally needs only name/address/email/
    signature. MCNZ/CPN/ACC/HPI numbers are regulatory identifiers
    that live in the provider profile and change over time -
    embedding them in the executed contract would either force
    re-signing on renewal, or leave stale data in the archive. IRD
    belongs on IR330C. GST belongs on invoices. So we replace the
    inline data with the wording:

        "Professional registration details (MCNZ, HPI-CPN, ACC
         Provider ID, IRD, and GST as applicable) are as recorded
         in Tere Health's provider profile from time to time."

    ...which the lawyer can sign off on as a de-scope of Schedule 1
    without redrafting.

Also fixes the multi-column extraction artifact: the parties block is
duplicated 3 times (nodes 4, 10-13, 19-22). Slim keeps one clean copy.

Idempotent: running twice produces the same output as running once.

Usage:
    python3 slim-v81.py            # writes src/contracts/v8_1.json in-place
"""
import json
import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
V81  = os.path.join(REPO, 'src', 'contracts', 'v8_1.json')

REG_DEFER = (
    "Professional registration details (MCNZ registration and scope, "
    "HPI-CPN, ACC Provider ID, IRD number, and GST registration status) "
    "are as recorded in Tere Health's provider profile from time to time. "
    "The Contractor is responsible for keeping those details current and "
    "notifying Tere Health of any material change (see clause 4.4)."
)

PARTY_FRAGMENT_TEXTS = {
    'PRINCIPAL',
    'CONTRACTOR',
    'and',
    'Tere Health Limited',
    '41 Adams Lane, Springlands, Blenheim 7201',
    '{{contractor_full_name}}',
    '{{contractor_address}}',
    '{{contractor_acc_id}}',
    '{{contractor_gst_optional}}',
    '{{contractor_cpn}} · ACC Provider ID',
}


def is_party_fragment(text):
    t = text.strip()
    if t in PARTY_FRAGMENT_TEXTS:
        return True
    if t.startswith('NZBN 9429053723413'):
        return True
    if t.startswith('MCNZ Reg.'):
        return True
    if t.startswith('{{contractor_acc_id}} · IRD'):
        return True
    return False


def slim(doc):
    nodes = doc['nodes']
    out = []
    i = 0
    saw_parties_block = False
    saw_schedule_contractor = False

    while i < len(nodes):
        n = nodes[i]
        t = (n.get('text') or '').strip()

        # ---- Parties block at top of doc ----
        # Multi-column extraction produced a merged mega-para plus two
        # linear copies. First hit -> emit ONE clean parties block; then
        # skip every subsequent party fragment that appears in a run
        # (until the next real heading/clause node).
        if (
            not saw_parties_block
            and n.get('type') == 'para'
            and t.startswith('PRINCIPAL')
        ):
            out.append({'type': 'heading', 'level': 2, 'text': 'Parties'})
            out.append({'type': 'para', 'text': 'PRINCIPAL', 'bold': True})
            out.append({'type': 'para', 'text': 'Tere Health Limited'})
            out.append({'type': 'para', 'text': 'NZBN 9429053723413 | Registered in New Zealand'})
            out.append({'type': 'para', 'text': '41 Adams Lane, Springlands, Blenheim 7201'})
            out.append({'type': 'para', 'text': 'and', 'bold': True})
            out.append({'type': 'para', 'text': 'CONTRACTOR', 'bold': True})
            out.append({'type': 'para', 'text': '{{contractor_full_name}}'})
            out.append({'type': 'para', 'text': '{{contractor_address}}'})
            out.append({'type': 'para', 'text': REG_DEFER})
            saw_parties_block = True
            # Consume this node + all trailing party fragments in one run.
            j = i + 1
            while j < len(nodes) and nodes[j].get('type') == 'para' and is_party_fragment(nodes[j].get('text','')):
                j += 1
            i = j
            continue

        # Anywhere later in the doc, if a stray party fragment shows up
        # (e.g. the docx's second/third column tail), drop it silently.
        if saw_parties_block and n.get('type') == 'para' and is_party_fragment(t):
            i += 1
            continue

        # In Schedule 1 there's a duplicated contractor identity block
        # starting with `{{contractor_full_name}}{{contractor_full_name}}`.
        # Emit one clean line + deferral note, then swallow the trailing
        # MCNZ/CPN/ACC/IRD/GST fragments.
        if n.get('type') == 'para' and t == '{{contractor_full_name}}{{contractor_full_name}}':
            if not saw_schedule_contractor:
                out.append({'type': 'para', 'text': '{{contractor_full_name}}', 'bold': True})
                out.append({'type': 'para', 'text': REG_DEFER})
                saw_schedule_contractor = True
            i += 1
            continue

        out.append(n)
        i += 1

    doc['nodes'] = out
    return doc


def main():
    with open(V81) as f:
        doc = json.load(f)
    before = len(doc['nodes'])
    slim(doc)
    after = len(doc['nodes'])
    with open(V81, 'w') as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
    print(f'slimmed v8.1: {before} -> {after} nodes')


if __name__ == '__main__':
    sys.exit(main() or 0)
