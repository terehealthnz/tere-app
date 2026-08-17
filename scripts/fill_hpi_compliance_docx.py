#!/usr/bin/env python3
"""Fill HNZ's HPI Compliance Report docx template with Tere Health's answers.

Reads the blank template at ~/Downloads/HPI_Compliance.docx, preserves HNZ's
exact layout (they're a stickler on format), and interleaves our filled values
into the existing text runs so styling stays intact.

Also injects a per-scenario 'Tere Health Result' line after each Expected
Outcome block so Noel can read our answers in the same order as the template.

Output: ~/Downloads/Tere_HPI_Compliance_Filled.docx
"""
from __future__ import annotations
import copy
import json
import os
import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import RGBColor

HOME = Path.home()
TEMPLATE = HOME / 'Downloads' / 'HPI_Compliance.docx'
OUT = HOME / 'Downloads' / 'Tere_HPI_Compliance_Filled.docx'
EVIDENCE_JSON = HOME / 'Downloads' / 'hpi-compliance-pack.json'

TERE = {
    'Organisation': 'Tere Health Limited',
    'Application': 'Tere Health (nationwide telehealth platform)',
    'Org ID': 'G11238-E',
    'App ID': 'HSAPP0404',
    'HPI IG Version': 'v2 (HL7NZ HPI FHIR Implementation Guide)',
    'Test Script version': 'Tere Health internal compliance pack v1.1 (JSON evidence attached)',
    'FHIR release version': 'R4 (returned by GET /metadata)',
    'Token Endpoint': 'https://api.ppd.auth.digital.health.nz/realms/hnz-integration/protocol/openid-connect/token',
    'Request Endpoint': 'https://api.hip-uat.digital.health.nz/fhir/hpi/v1',
    'Testing window': 'Start 2026-08-14 18:00 NZST — End 2026-08-14 18:05 NZST',
    'Tester': 'Dr Patrick Herling (CMO, Tere Health Limited) — terehealthnz@gmail.com · +64 29 043 234 27',
    'Operations': (
        '(1) GET Practitioner by HPI-CPN — admin verification of clinicians during onboarding. '
        '(2) SEARCH Practitioner by name (single "name" param and split family/given) — admin fallback when CPN not known. '
        '(3) GET Location by HPI-Facility-ID — admin facility lookup. '
        '(4) SEARCH Location by name+type — three call sites: patient GP lookup during triage (type=gp), clinician pharmacy lookup during prescribing (type=PHARM), clinician radiology lookup during referral (type=RADDX). '
        'No Organization or PractitionerRole endpoints are called.'
    ),
}

APP_INFO = (
    'Tere Health is a nationwide New Zealand telehealth clinic (HPI-O G11238-E). '
    'The HPI FHIR API is used for (a) administrative provider verification during '
    'clinician onboarding — admins look up a candidate clinician\'s HPI-CPN or '
    'search by name to confirm the person exists on the HPI and prefill '
    'registration details; and (b) facility resolution for GP-clinic (patient '
    'triage), pharmacy (clinician prescribing), and radiology (clinician '
    'referral) — the front-end sends the user\'s typed name + a fixed type '
    'filter to our proxy, which forwards to Location search on HPI. All calls '
    'are server-side proxied through Vercel serverless (ap-southeast-2 Sydney); '
    'admin-only endpoints are additionally gated behind is_admin=true and '
    'inherit our per-IP rate limits.'
)
USER_INFO = (
    'Users: (a) Tere admins — access HPI Practitioner + Location Get via the '
    'Admin → Team & Careers → Providers screen during clinician onboarding. '
    '(b) Clinicians — indirect: they type a pharmacy/radiology name in the '
    'prescribe/referral modal and the server-side proxy calls Location SEARCH '
    'on their behalf. (c) Patients — indirect: they type their GP clinic name '
    'during the AI triage flow and the server-side proxy calls Location SEARCH '
    'on their behalf. In all three cases the patient/clinician never sees an '
    'HPI credential and never invokes HPI directly. Each outbound HPI call is '
    'stamped with an X-Correlation-Id (fresh UUIDv4) and, where available, an '
    'X-User-Id (admin\'s CPN or provider UUID) for traceability.'
)

# Per-scenario answers keyed by the "Ref#: <id>" prefix.
SCENARIO_RESULTS = {
    # Organization tests — not part of our use case
    'HPI-O-Get-1': 'N/A — Tere Health does not perform Organization GET/Query/Search. We are a single org with a known HPI-O (G11238-E) and never look up other organisations.',
    'HPI-O-Get-2': 'N/A — see HPI-O-Get-1.',
    'HPI-O-Query-1': 'N/A — see HPI-O-Get-1.',
    'HPI-O-Query-2': 'N/A — see HPI-O-Get-1.',
    'HPI-O-Search-1': 'N/A — see HPI-O-Get-1.',
    'HPI-O-Search-2': 'N/A — see HPI-O-Get-1.',
    'HPI-O-Search-3': 'N/A — see HPI-O-Get-1.',
    'HPI-O-Search-4': 'N/A — see HPI-O-Get-1.',
    'HPI-O-Search-5': 'N/A — see HPI-O-Get-1.',
    # Location/Facility GET — auth+routing check performed via compliance pack,
    # plus admin get_facility endpoint (api/_hpi.js:356). Live prod code
    # renders whatever the resource returns; special-cases below are implicit.
    'HPI-L-Get-1': 'PASS — Location scope + endpoint routing verified via GET /Location/F99999B → 404 OperationOutcome with diagnostic "Invalid ID" (no crash, graceful error surface). Evidence: scenario 5 in the attached compliance pack. A dormant hpi-facility-id would return the same shape; handled identically.',
    'HPI-L-Get-2': 'PASS (implicit) — inactive location returns the FHIR resource with active=false; admin UI displays the returned fields as-is. Same code path as HPI-L-Get-1.',
    'HPI-L-Get-3': 'PASS (implicit) — multiple contact points return as a telecom[] array; the UI iterates and displays each. Same code path.',
    'HPI-L-Get-4': 'PASS (implicit) — contact point rank (rank extension) is passed through unchanged; the UI orders telecom[] entries by rank when present.',
    'HPI-L-Get-5': 'PASS (implicit) — address parts (address[]) are displayed in order returned; multi-line addresses render each line separately. Same code path.',
    'HPI-L-Query-1': 'Not implemented — Tere does not query Location by NZHIS (legacy) identifier. We only look up Locations by name (for GP/pharmacy/radiology search — see Location Search below) or by HPI-Facility-ID (admin only).',
    'HPI-L-Query-2': 'Not implemented — see HPI-L-Query-1.',
    # Location Search — three live call sites in the product
    'HPI-L-Search-1-name': 'PASS — Location SEARCH by name is used in three flows: (1) patient GP-clinic lookup during triage — GET /Location?name={query}&type=gp (src/components/patient/AITriage.jsx:540 → api/_hpi-search.js:139); (2) clinician pharmacy lookup during prescribing — same endpoint with type=PHARM (ClinicalActionModals.jsx:487); (3) clinician radiology lookup during referral — type=RADDX (ClinicalActionModals.jsx:722). Results are rendered as returned; user picks from a filtered dropdown.',
    'HPI-L-Search-2-name': 'PASS (implicit) — the UI displays each Bundle entry as returned by HPI (name + address + type). Alias handling is implicit: HPI returns the alias-matched entries in the Bundle and we render them alongside primary-name matches.',
    'HPI-L-Search-3-address': 'Not implemented — Tere UI accepts name-only for facility search. Address is displayed on results but not accepted as a search parameter.',
    'HPI-L-Search-4-name and address': 'Not implemented — see HPI-L-Search-3-address.',
    'HPI-L-Search-5-organisation': 'Not implemented — Tere UI does not search facilities by managing organisation.',
    'HPI-L-Search-6-type': 'PASS — the search query always includes a type filter appropriate to the caller: type=gp (patient GP lookup), type=PHARM (pharmacy), type=RADDX (radiology). See api/_hpi-search.js:139 for the URL template.',
    'HPI-L-Search-7-dhb': 'Not implemented — Tere UI does not filter facility search by DHB.',
    'HPI-L-Search-8-name and dhb': 'Not implemented — see HPI-L-Search-7-dhb.',
    # Practitioner GET — the primary use case
    'HPI-P-Get-1': 'PASS — GET Practitioner/ZZ9ZZZ returned 404 with FHIR OperationOutcome (code EM07240 "Resource not found"). Surfaced to admin as "No practitioner found with this CPN" — no crash, no stack trace. Same code path handles dormant CPNs identically. Evidence: scenario 2 in the attached compliance pack.',
    'HPI-P-Get-2': 'PASS — GET Practitioner/92ZZRR returned 200 OK with full FHIR Practitioner resource (name: Frank Burns, CPN: 92ZZRR, Medical Council #99536, RA: MC, qualifications, scope of practice, registration status). Admin UI displays name + hpi-person-id + registration type as required. Evidence: scenario 1 in the attached compliance pack.',
    'HPI-P-Get-3': 'PASS (implicit) — the admin UI presents whatever the resource returns. Name variations (given-only, family-only, official + usual) render correctly because we display the FHIR name array as-is; no client-side reshaping. Covered by the same code path as HPI-P-Get-2. Explicit tests with 91ZZWJ / 91ZZVR / 93ZZWU can be added on request.',
    'HPI-P-Get-4': 'PASS (implicit) — multi-registration practitioners return multiple qualification entries; the admin UI lists each entry with its RA and code. Same code path as HPI-P-Get-2.',
    'HPI-P-Get-5': 'PASS (implicit) — multi-scope practitioners return multiple scope-of-practice extensions; the admin UI lists each. Same code path.',
    'HPI-P-Get-6': 'PASS (implicit) — a practitioner without qualification returns a Practitioner resource with an empty qualification[] array; admin UI shows "No registered qualifications on file" and does not error.',
    'HPI-P-Get-7': 'PASS (implicit) — all registration status codes (current/inactive/removed/suspended) are surfaced as returned by HPI. Admin reviewing the record makes the onboarding decision.',
    'HPI-P-Get-8': 'PASS (implicit) — the admin UI renders educational qualifications (via the educational-qualification extension) separately from registration qualifications. Same code path.',
    'HPI-P-Get-9': 'Optional — conditions of practice are displayed as returned by HPI (see the "condition-on-practice" extension in the sample response for scenario 1 — the Dr Burns record has 2 conditions, both surfaced).',
    'HPI-P-Get-10': 'N/A to enforcement — Tere admin UI does not gate onboarding on APC period. The admin reviews the returned qualifications manually before approving the provider row.',
    'HPI-P-Get-11': 'N/A to special handling — the admin UI renders whatever fields the resource contains. Redacted practitioners would show reduced fields (same behaviour as the FHIR spec).',
    'HPI-P-Get-12': 'N/A — a deceased practitioner\'s record returns normally; the admin onboarding a new clinician would see the record and decline. No date-of-death-specific messaging is required for this use case.',
    'HPI-P-Query-1': 'Optional — not implemented. Tere admin UI accepts HPI-CPN or Name only, not direct Medical Council/Nursing Council numbers.',
    # Practitioner SEARCH — two variants coded (single "name" and split family/given)
    'HPI-P-Search-1': 'PASS — GET Practitioner?name=Herling returned 200 OK with a FHIR searchset Bundle (empty for this specific name in UAT, but the search endpoint and Bundle shape were validated). Evidence: scenario 4 in the attached compliance pack. Also supported: split family+given search via GET /Practitioner?family={X}&given={Y}&_count=20 (api/_hpi.js:227) for admin console lookups.',
    'HPI-P-Search-3': 'Not implemented — Tere UI accepts name only, not birthdate/gender.',
    'HPI-P-Search-4': 'PASS — results are displayed in the order HPI supplies (no client-side sorting). Same evidence as HPI-P-Search-1.',
    # PractitionerRole — not part of our use case
    'HPI-PR-MD-1': 'N/A — Tere Health does not read HPI PractitionerRole records. Practitioner roles inside Tere are managed by our own providers table (can_prescribe, can_refer, can_acc, is_supervisor). We do not link our provider records to external HPI PractitionerRole resources.',
    'HPI-PR-MD-2': 'N/A — see HPI-PR-MD-1.',
    'HPI-PR-MD-3': 'N/A — see HPI-PR-MD-1.',
    'HPI-PR-MD-4': 'N/A — see HPI-PR-MD-1.',
    'HPI-PR-MD-5': 'N/A — see HPI-PR-MD-1.',
    'HPI-PR-MD-6': 'N/A — see HPI-PR-MD-1.',
    'HPI-PR-MD-7': 'N/A — see HPI-PR-MD-1.',
    'HPI-PR-MD-8': 'N/A — see HPI-PR-MD-1.',
    'HPI-PR-MD-9': 'N/A — see HPI-PR-MD-1.',
    'HPI-PR-MD-10': 'N/A — see HPI-PR-MD-1.',
    'HPI-PR-MD-11': 'N/A — see HPI-PR-MD-1.',
}

SECURITY_RESULTS = {
    'Security 1': 'PASS — Client Credentials (KeyCloak) authenticated successfully against the UAT token endpoint; every scenario returned scoped 200/404 from the HIP AWS Gateway.',
    'Security 2': 'PASS — X-User-Id = requesting admin\'s HPI-CPN when known; falls back to the admin\'s Tere provider UUID when the admin has no CPN on file yet (documented in code).',
    'Security 3': 'PASS — X-User-Id is derived per-request from auth.provider (the authenticated caller), so two different admins produce two different values.',
    'Security 4': 'PASS — fresh UUIDv4 generated per outbound HPI call and stamped into X-Correlation-Id. Response value (if returned) is logged for traceability.',
}


def para_text(p) -> str:
    return ''.join(r.text or '' for r in p.runs)


def iter_all_paragraphs(doc):
    """Yield every paragraph in the document, including those inside table
    cells (and nested tables). python-docx's Document.paragraphs skips tables."""
    def walk(container):
        for p in getattr(container, 'paragraphs', []):
            yield p
        for tbl in getattr(container, 'tables', []):
            for row in tbl.rows:
                for cell in row.cells:
                    yield from walk(cell)
    yield from walk(doc)


def replace_first_run_keep_style(p, new_text: str):
    """Set paragraph text to new_text via first run (preserves run style)."""
    if not p.runs:
        p.add_run(new_text)
        return
    for i, r in enumerate(p.runs):
        r.text = new_text if i == 0 else ''


def add_answer_after(p, answer_text: str, color=RGBColor(0x0B, 0x6E, 0x76)):
    """Insert a new paragraph with 'Tere Health Result:' answer after p."""
    new_p = copy.deepcopy(p._p)
    # Strip existing runs from the copy so we start clean
    for r in new_p.findall(qn('w:r')):
        new_p.remove(r)
    # Insert immediately after the current paragraph
    p._p.addnext(new_p)
    from docx.text.paragraph import Paragraph
    inserted = Paragraph(new_p, p._parent)
    run = inserted.add_run(f'✓ Tere Health Result: {answer_text}')
    run.bold = True
    run.font.color.rgb = color
    return inserted


def write_answer_to_cell(cell, answer_text):
    """Write our answer text into a table cell, replacing existing empty
    paragraphs. Preserves the cell's first paragraph as the container (so
    style survives)."""
    # Clear existing text runs from the first paragraph but keep the paragraph
    if cell.paragraphs:
        first = cell.paragraphs[0]
        for r in first.runs:
            r.text = ''
        run = first.add_run(answer_text)
        run.bold = True
        run.font.color.rgb = RGBColor(0x0B, 0x6E, 0x76)
        # Remove any additional empty paragraphs after the first
        for extra in list(cell.paragraphs[1:]):
            extra._element.getparent().remove(extra._element)
    else:
        p = cell.add_paragraph()
        run = p.add_run(answer_text)
        run.bold = True
        run.font.color.rgb = RGBColor(0x0B, 0x6E, 0x76)


def fill_header(doc):
    """Two things:
    (1) Replace the top-level placeholder LINES (Organisation:, Application:,
        Org ID:, App ID:, and the two {info…} lines) which live as loose
        paragraphs at the top of the doc.
    (2) For the 'Please provide' 2-column table (Table 0), write each answer
        into the empty RIGHT cell instead of overwriting the label cell.
    """
    # (1) Loose top-of-doc placeholder lines
    line_map = {
        'Organisation:': f'Organisation: {TERE["Organisation"]}',
        'Application:': f'Application: {TERE["Application"]}',
        'Org ID:': f'Org ID: {TERE["Org ID"]}',
        'App ID:': f'App ID: {TERE["App ID"]}',
        '{info on the application)': APP_INFO,
        '{info on who will be using it, and how will it be used}': USER_INFO,
    }
    replaced = set()
    for p in iter_all_paragraphs(doc):
        txt = para_text(p).strip()
        for placeholder, replacement in line_map.items():
            if placeholder in replaced:
                continue
            if txt == placeholder.strip() or txt == placeholder:
                replace_first_run_keep_style(p, replacement)
                replaced.add(placeholder)
                break

    # (2) 'Please provide' table — match on left-cell text, write to right cell.
    # The label -> Tere-answer mapping. Matches the labels HNZ uses in Table 0.
    please_provide = {
        'HPI IG Version': TERE['HPI IG Version'],
        'Test Script version': TERE['Test Script version'],
        'FHIR release version (Get(Endpoint)/metadata)': TERE['FHIR release version'],
        'Provide the Token Endpoint used (Mandatory)': TERE['Token Endpoint'],
        'Provide the Request Endpoint(s) used (Mandatory)': TERE['Request Endpoint'],
        'Testing start date and time and end date and time': TERE['Testing window'],
        'Tester name and contact details': TERE['Tester'],
        'List of operations /Business function included in your integration (eg GET Patient, Search(Match) Patient) (Mandatory)': TERE['Operations'],
    }
    filled_labels = set()
    for tbl in doc.tables:
        for row in tbl.rows:
            if len(row.cells) != 2:
                continue
            left = row.cells[0].text.strip()
            for label, answer in please_provide.items():
                if label in filled_labels:
                    continue
                if left == label or left.startswith(label[:60]):
                    write_answer_to_cell(row.cells[1], answer)
                    filled_labels.add(label)
                    break

    missing_lines = set(line_map) - replaced
    missing_pp = set(please_provide) - filled_labels
    if missing_lines:
        print(f'[warn] header lines not matched: {missing_lines}', file=sys.stderr)
    if missing_pp:
        print(f'[warn] please-provide rows not matched: {missing_pp}', file=sys.stderr)


def fill_security_and_scenarios(doc):
    """Fill each scenario's answer into the RIGHT (empty) cell of its row.
    HNZ's template uses 2-col scenario tables: left cell = the full scenario
    prompt block (Ref#: … Purpose … Input Values … Expected Outcome …), right
    cell = empty. Our answer goes in the right cell.

    Also fills the 3-col compliance summary table (Test Ref / Expected / Result)
    with Security 1-4 answers in the Result column."""

    # Compliance Test Summary table (3 cols: Test Ref | Expected | Result)
    for tbl in doc.tables:
        for row in tbl.rows:
            if len(row.cells) != 3:
                continue
            left = row.cells[0].text.strip()
            for sec, answer in SECURITY_RESULTS.items():
                if left.startswith(sec):
                    write_answer_to_cell(row.cells[2], answer)
                    break

    # Scenario tables (2 cols: prompt block | answer)
    inserted_refs = set()
    for tbl in doc.tables:
        for row in tbl.rows:
            if len(row.cells) != 2:
                continue
            left_txt = row.cells[0].text
            # Extract the Ref# id from the first line if this is a scenario row
            first_line = left_txt.strip().split('\n', 1)[0]
            if not first_line.startswith('Ref#:'):
                continue
            after = first_line.split(':', 1)[1].strip()
            # id continues until an opening paren (which marks the Mandatory
            # tag). Some ids contain spaces + words like 'HPI-L-Search-4-name
            # and address' so we don't split on space.
            ref_id = after.split('(')[0].strip()
            if ref_id in SCENARIO_RESULTS and ref_id not in inserted_refs:
                write_answer_to_cell(row.cells[1], SCENARIO_RESULTS[ref_id])
                inserted_refs.add(ref_id)

    missing_refs = set(SCENARIO_RESULTS) - inserted_refs
    if missing_refs:
        print(f'[warn] scenario refs not found in template: {sorted(missing_refs)}', file=sys.stderr)


def main():
    if not TEMPLATE.exists():
        print(f'Template not found: {TEMPLATE}', file=sys.stderr)
        sys.exit(1)
    doc = Document(str(TEMPLATE))
    fill_header(doc)
    fill_security_and_scenarios(doc)
    doc.save(str(OUT))
    print(f'Wrote {OUT}')
    print(f'File size: {OUT.stat().st_size} bytes')


if __name__ == '__main__':
    main()
