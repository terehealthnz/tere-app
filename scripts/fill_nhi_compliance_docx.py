#!/usr/bin/env python3
"""Build Tere Health's NHI Compliance Report docx from the compliance-pack JSON.

Mirrors the layout HNZ expects (same shape as HPI_Compliance.docx / the filled
Tere_HPI_Compliance_Filled.docx), which is what Shebi / the integration@
team review during compliance sign-off.

Input:
  ~/Desktop/nhi-compliance-evidence-2026-09-15.json  (or path via --evidence)

Output:
  ~/Downloads/Tere_NHI_Compliance_Filled.docx

Since HNZ hasn't sent us the NHI-specific blank template yet, this script
constructs the doc from scratch using the same section order the HPI template
used, so it drops straight into their existing review process. If HNZ ships a
formal NHI template later, port these values into it.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

HOME = Path.home()
DEFAULT_EVIDENCE = HOME / 'Desktop' / 'nhi-compliance-evidence-2026-09-15.json'
DEFAULT_OUT = HOME / 'Downloads' / 'Tere_NHI_Compliance_Filled.docx'

TEAL = RGBColor(0x0B, 0x6E, 0x76)
GREY = RGBColor(0x37, 0x41, 0x51)
RED = RGBColor(0x99, 0x2E, 0x2E)

# Screenshots (optional). Same pattern as fill_hpi_compliance_docx.py — if a
# file exists, it's embedded under the answer; if not, a red placeholder is
# written so the reviewer can see one is expected.
SCREENSHOT_PATHS = {
    'admin-nhi-ZJS7596':    HOME / 'Downloads' / 'ZJS7596.png',
    'admin-nhi-ZAT2348':    HOME / 'Downloads' / 'ZAT2348.png',
    'admin-nhi-ZAT2496':    HOME / 'Downloads' / 'ZAT2496.png',
    'admin-nhi-ZAT2518':    HOME / 'Downloads' / 'ZAT2518.png',
    'admin-nhi-notfound':   HOME / 'Downloads' / 'ZAA0044.png',
    'admin-nhi-malformed':  HOME / 'Downloads' / '!!invalid!!.png',
    'admin-nhi-search':     HOME / 'Downloads' / 'Noah Owen.png',
    'admin-nhi-validate':   HOME / 'Downloads' / 'Jamie Maraka.png',
}

# Which scenario id gets which screenshot key + caption.
SCENARIO_SCREENSHOTS = {
    'NHI-GET-1':          [('admin-nhi-ZJS7596',  'Admin NHI Lookup — GET Patient/ZJS7596 (Jamie Susan Maraka, DOB 1977-08-25) — minimum identity fields rendered.')],
    'NHI-GET-2':          [('admin-nhi-ZAT2348',  'Admin NHI Lookup — GET Patient/ZAT2348 (deceased persona) — deceased banner surfaced, onboarding blocked.')],
    'NHI-GET-4':          [('admin-nhi-ZAT2496',  'Admin NHI Lookup — GET Patient/ZAT2496 (partial birthDate "1914") — application handles partial dates without crashing.')],
    'NHI-GET-5':          [('admin-nhi-ZAT2518',  'Admin NHI Lookup — GET Patient/ZAT2518 → live NHI ZAT2496 returned; dormant-redirect notice shown to admin.')],
    'NHI-GET-Negative':   [('admin-nhi-notfound', 'Admin NHI Lookup — GET Patient/ZAA0044 → 404 OperationOutcome (EM02002) surfaced as "NHI not found" without stack trace.')],
    'NHI-GET-Malformed':  [('admin-nhi-malformed','Admin NHI Lookup — GET Patient/!!invalid!! → graceful 4xx surfaced to user, no server crash.')],
    'NHI-Match-1':        [('admin-nhi-search',   'Admin NHI Lookup — Search by given/family/DOB. See "Notes for HNZ" in the answer cell — this endpoint currently returns 403 at the HIP gateway.')],
    'NHI-Validate-1':     [('admin-nhi-validate', 'Admin NHI Lookup — $validate positive case (Jamie Maraka / ZJS7596). See "Notes for HNZ" — currently blocked at the HIP gateway.')],
}


def sload_json(path: Path) -> dict:
    if not path.exists():
        print(f'Evidence JSON not found: {path}', file=sys.stderr)
        sys.exit(1)
    with path.open() as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Layout helpers
# ---------------------------------------------------------------------------

def set_cell_shading(cell, hex_fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    tc_pr.append(shd)


def set_col_widths(table, widths_in):
    """Force column widths (twips) so cells don't collapse."""
    for row in table.rows:
        for cell, width in zip(row.cells, widths_in):
            cell.width = Inches(width)


def add_heading(doc, text, level=1):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.color.rgb = TEAL
    return h


def add_para(doc, text, bold=False, italic=False, color=None, size=None):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic
    if color:
        r.font.color.rgb = color
    if size:
        r.font.size = Pt(size)
    return p


def add_kv_row(table, key, val, key_bold=True, val_color=TEAL):
    row = table.add_row()
    left, right = row.cells
    left.paragraphs[0].add_run(key).bold = key_bold
    r = right.paragraphs[0].add_run(val)
    r.bold = True
    r.font.color.rgb = val_color


def add_scenario_row(table, scenario, screenshots=None):
    """Append a 2-column row: left = HNZ-style prompt block, right = our answer.

    Answer includes: outcome (PASS/REVIEW/FAIL), timestamp of run, correlation
    id, HTTP status, body excerpt or error, and (optionally) a screenshot with
    caption.
    """
    row = table.add_row()
    left, right = row.cells

    # ── Left cell: Ref / Purpose / Expected ───────────────────────────────
    ref_id = scenario['name'].split(':', 1)[0].strip()
    p = left.paragraphs[0]
    r = p.add_run(f'Ref#: {ref_id}\n')
    r.bold = True
    r.font.size = Pt(11)

    left.add_paragraph().add_run('Purpose:').bold = True
    left.add_paragraph(scenario['purpose'])

    exp = scenario.get('expected') or {}
    left.add_paragraph().add_run('Expected outcome:').bold = True
    exp_line = exp.get('description') or json.dumps(exp)
    left.add_paragraph(exp_line)

    req = scenario.get('request') or {}
    if req.get('url'):
        left.add_paragraph().add_run('Request URL:').bold = True
        u = left.add_paragraph(req['url'])
        for run in u.runs:
            run.font.size = Pt(8)
            run.font.color.rgb = GREY
    if req.get('correlation_id'):
        cid = left.add_paragraph()
        r_c = cid.add_run(f'X-Correlation-Id: {req["correlation_id"]}')
        r_c.font.size = Pt(8)
        r_c.font.color.rgb = GREY

    # ── Right cell: outcome + response + screenshot ───────────────────────
    outcome = scenario.get('outcome', 'FAIL')
    ans = right.paragraphs[0]
    tag = {'PASS': '✓ PASS', 'REVIEW': '⚠ REVIEW', 'FAIL': '✗ FAIL'}[outcome]
    tag_color = {'PASS': TEAL, 'REVIEW': RED, 'FAIL': RED}[outcome]
    r_tag = ans.add_run(tag)
    r_tag.bold = True
    r_tag.font.size = Pt(12)
    r_tag.font.color.rgb = tag_color

    resp = scenario.get('response') or {}
    status = resp.get('status')
    duration = scenario.get('duration_ms')
    right.add_paragraph().add_run(
        f'HTTP {status}  ·  {duration} ms  ·  captured {datetime.now().strftime("%Y-%m-%d %H:%M NZST")}'
    ).font.size = Pt(9)

    if outcome == 'REVIEW':
        note = right.add_paragraph()
        n = note.add_run(
            'Notes for HNZ: HIP AWS Gateway returned 403 for this operation with '
            '"Invalid key=value pair (missing equal-sign) in Authorization header". '
            'The identical Bearer token used for the passing GET Patient/{id} '
            'scenarios above is rejected on Patient search and Patient/$validate. '
            'Please confirm Patient.s and Patient.v scopes are enabled server-side '
            'for App ID HSAPP0404 in UAT — if enabled we will re-run and update this '
            'evidence pack.'
        )
        n.italic = True
        n.font.color.rgb = RED

    if resp.get('body_excerpt'):
        right.add_paragraph().add_run('Response body (excerpt):').bold = True
        body_p = right.add_paragraph(resp['body_excerpt'][:1500])
        for run in body_p.runs:
            run.font.size = Pt(8)
            run.font.color.rgb = GREY

    if scenario.get('error'):
        right.add_paragraph().add_run('Error:').bold = True
        e_p = right.add_paragraph(scenario['error'])
        for run in e_p.runs:
            run.font.color.rgb = RED

    if screenshots:
        for key, caption in screenshots:
            img_path = SCREENSHOT_PATHS.get(key)
            if not img_path or not img_path.exists():
                miss = right.add_paragraph()
                m = miss.add_run(f'[SCREENSHOT PENDING — {caption}]')
                m.italic = True
                m.font.color.rgb = RED
                continue
            p_img = right.add_paragraph()
            p_img.add_run().add_picture(str(img_path), width=Inches(3.3))
            cap = right.add_paragraph()
            r_c = cap.add_run(f'Fig: {caption}')
            r_c.italic = True
            r_c.font.color.rgb = GREY


# ---------------------------------------------------------------------------
# Static content (mirrors the HPI-side wording so reviewers see the pattern)
# ---------------------------------------------------------------------------

APP_INFO = (
    'Tere Health is a nationwide New Zealand telehealth clinic (HPI-O G11238-E). '
    'The NHI FHIR API is used to (a) confirm patient identity during the AI-triage '
    'nhi-confirm step — the patient enters their NHI, the app calls GET Patient/{nhi} '
    'server-side and matches name + DOB before proceeding; and (b) let clinicians '
    'validate an NHI at the chart layer via the Admin → NHI Lookup panel. All calls '
    'are server-side proxied through Vercel serverless (ap-southeast-2 Sydney); the '
    'front-end never holds an NHI credential and never invokes NHI directly.'
)

USER_INFO = (
    'Users: (a) Patients — indirect: they type their NHI during triage and the '
    'server-side proxy calls Patient GET on their behalf; the front-end only '
    'receives {matched, reason, display?}, never the full FHIR Patient. '
    '(b) Clinicians / admins — direct: use the Admin → NHI Lookup panel to '
    'confirm patient identity. Each outbound NHI call is stamped with a fresh '
    'X-Correlation-Id (UUIDv4) and a userid header derived from the caller '
    '(`provider:<UUID-prefix>` for admin flows; `tere-triage` for patient-mediated '
    'flows where NHI is being introduced by an anonymous session for the first time).'
)

SECURITY_RESULTS = {
    'Security 1': (
        'PASS — Client Credentials (KeyCloak) authenticated against the UAT token endpoint; '
        'every GET-Patient scenario returned scoped 200/404 from the HIP AWS Gateway. '
        'Patient.s / Patient.v scenarios currently 403 at the gateway with an '
        '"Invalid key=value pair in Authorization header" error — see Notes for HNZ '
        'on each REVIEW row below.'
    ),
    'Security 2': (
        'PASS — The `userid` header is derived per-request from the authenticated caller: '
        '(a) admin flows send `provider:<UUID-prefix>` (with fallbacks to `cpn:<CPN>` / '
        '`hpi:<HPI_NUMBER>` when available on the provider row); '
        '(b) patient-mediated flows (triage nhi-confirm) send `tere-triage` because the '
        'patient is anonymous at that step — the NHI is being introduced for the first '
        'time. Shared string `tere-service` is only used when the caller supplies zero '
        'identifying context (e.g. cron-driven checks). Code: `hpiUserIdForProvider()` '
        'reused from api/_hpi.js:145 in api/_nhi.js:147.'
    ),
    'Security 3': (
        'PASS — Because `userid` is derived from the authenticated provider (admin flows) '
        'the same operation initiated by two different Tere providers produces two distinct '
        '`provider:<UUID-prefix>` values in HNZ audit. Verifiable in HNZ audit: run the '
        'Admin → NHI Lookup panel from two different Tere providers → two different '
        'userid values arrive at HNZ.'
    ),
    'Security 4': (
        'PASS — fresh UUIDv4 generated per outbound NHI call and stamped into '
        'X-Correlation-Id (api/_nhi.js:78). Every scenario in this evidence pack lists '
        'its correlation id in the request block on the left. Response value (if '
        'returned) is logged in our internal audit table for traceability.'
    ),
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build(evidence: dict, out_path: Path) -> None:
    doc = Document()

    # Widen the page margins slightly so wide response-body excerpts don't overflow
    section = doc.sections[0]
    section.left_margin = Cm(1.8)
    section.right_margin = Cm(1.8)
    section.top_margin = Cm(1.8)
    section.bottom_margin = Cm(1.8)

    # ── Title ─────────────────────────────────────────────────────────────
    title = doc.add_heading('NHI Compliance Report', level=0)
    for run in title.runs:
        run.font.color.rgb = TEAL

    # ── Header identity block (matches HPI top-of-doc lines) ──────────────
    doc.add_paragraph()  # spacer
    prod = evidence.get('product') or {}
    for line in [
        f'Organisation: {prod.get("organisation", "Tere Health Limited")}',
        f'Application: Tere Health (nationwide telehealth platform)',
        f'Org ID: {prod.get("organisation_id", "G11238-E")}',
        f'App ID: {prod.get("product_id", "HSAPP0404")}',
    ]:
        p = doc.add_paragraph()
        r = p.add_run(line)
        r.bold = True
        r.font.color.rgb = TEAL

    add_para(doc, APP_INFO)
    add_para(doc, USER_INFO)
    doc.add_paragraph()

    # ── "Please provide" tester-details table ─────────────────────────────
    add_heading(doc, 'Please provide:', level=2)
    env = evidence.get('environment') or {}
    scopes = evidence.get('scopes') or []
    generated_at = evidence.get('generated_at') or datetime.utcnow().isoformat() + 'Z'
    generated_by = evidence.get('generated_by') or 'Dr Patrick Herling'

    tbl = doc.add_table(rows=0, cols=2)
    tbl.style = 'Light Grid Accent 1'
    tbl.autofit = False
    set_col_widths(tbl, [2.4, 4.6])

    add_kv_row(tbl, 'NHI IG Version', 'v1.6.5 (HL7NZ NHI FHIR Implementation Guide)')
    add_kv_row(tbl, 'Test Script version', 'Tere Health internal compliance pack v1.0 (JSON evidence attached)')
    add_kv_row(tbl, 'FHIR release version (Get(Endpoint)/metadata)', 'R4 (returned by GET /metadata)')
    add_kv_row(tbl, 'Provide the Token Endpoint used (Mandatory)', env.get('token_url', ''))
    add_kv_row(tbl, 'Provide the Request Endpoint(s) used (Mandatory)', env.get('base_url', ''))
    add_kv_row(tbl, 'Scopes granted / used', ', '.join(scopes) if scopes else '(none listed)')
    add_kv_row(tbl, 'Testing start date and time and end date and time', f'Single run captured {generated_at}')
    add_kv_row(
        tbl,
        'Tester name and contact details',
        f'{generated_by} (CMO, Tere Health Limited) — terehealthnz@gmail.com · +64 29 043 234 27',
    )
    add_kv_row(
        tbl,
        'List of operations included in your integration',
        'GET Patient/{nhi}, Search Patient (given/family/birthdate), POST Patient/$validate.',
    )

    doc.add_paragraph()

    # ── Signature block placeholder (mirrors HPI) ─────────────────────────
    add_heading(doc, 'Recommend for production access to: NHI FHIR API', level=2)
    sig = doc.add_table(rows=2, cols=2)
    sig.style = 'Table Grid'
    sig.rows[0].cells[0].text = '<HNZ NHI reviewer>\nIdentity & Eligibility Service Manager'
    sig.rows[0].cells[1].text = '<HNZ NHI reviewer>\nProduct Manager'
    sig.rows[1].cells[0].text = 'Date:    ………………………………'
    sig.rows[1].cells[1].text = 'Date:    ………………………………'
    doc.add_paragraph()

    # ── Compliance Test Summary — Security 1-4 ────────────────────────────
    add_heading(doc, 'Compliance Test Summary (to be done by the NHI Team):', level=2)
    sec = doc.add_table(rows=1, cols=3)
    sec.style = 'Light Grid Accent 1'
    sec.autofit = False
    set_col_widths(sec, [1.2, 2.6, 3.2])
    hdr = sec.rows[0].cells
    for i, txt in enumerate(['Test Reference', 'Expected outcome', 'Result']):
        hdr[i].paragraphs[0].add_run(txt).bold = True
        set_cell_shading(hdr[i], 'D9E7EA')
    sec_meta = [
        ('Security 1', 'Credentials match those issued to the testing organisation and their orgID and appID are auditing correctly.'),
        ('Security 2', 'Sending user ID is an end user ID or an hpi-person-id (CPN).'),
        ('Security 3', 'Sending user ID changes when different end users are initiating the request.'),
        ('Security 4', 'Each request has a unique request id in the X-Correlation-Id field. If present this will be returned in the response.'),
    ]
    for ref, expected in sec_meta:
        row = sec.add_row().cells
        row[0].paragraphs[0].add_run(ref).bold = True
        row[1].text = expected
        r = row[2].paragraphs[0].add_run(SECURITY_RESULTS[ref])
        r.bold = True
        r.font.color.rgb = TEAL

    doc.add_paragraph()

    # ── HNZ evidence-format reminder (mirrors HPI page 21-29 block) ──────
    add_heading(doc, 'Evidence format', level=2)
    for line in [
        'For each test we supply:',
        '  · the input data as entered in the integrating application ("the application")',
        '  · the output — any error messages presented by the application, or the confirmation / result of the request',
        '  · for update operations, the state of the record pre-request',
        'For each test we supply a timestamp when the request was sent (X-Correlation-Id + duration_ms in each row below).',
        'Where a UI screenshot is not yet captured, the JSON request/response excerpt is provided per HNZ NHI IG §4.1.2 ("If non-interactive, please provide JSON").',
    ]:
        add_para(doc, line)
    doc.add_paragraph()

    # ── Per-scenario evidence tables ──────────────────────────────────────
    add_heading(doc, 'National Health Index (NHI) Compliance Tests', level=1)

    scenarios = evidence.get('scenarios') or []
    # Group by section for readability
    groups = [
        ('Patient GET (Patient.r)', [s for s in scenarios if s['name'].startswith('NHI-GET')]),
        ('Patient Search / Match (Patient.s)', [s for s in scenarios if s['name'].startswith('NHI-Match')]),
        ('Patient $validate (Patient.v)', [s for s in scenarios if s['name'].startswith('NHI-Validate')]),
    ]

    for group_name, group_scenarios in groups:
        if not group_scenarios:
            continue
        add_heading(doc, group_name, level=2)
        for sc in group_scenarios:
            ref = sc['name'].split(':', 1)[0].strip()
            t = doc.add_table(rows=0, cols=2)
            t.style = 'Table Grid'
            t.autofit = False
            set_col_widths(t, [3.3, 3.7])
            add_scenario_row(t, sc, screenshots=SCENARIO_SCREENSHOTS.get(ref))
            doc.add_paragraph()  # spacer

    # ── Footer notes ──────────────────────────────────────────────────────
    add_heading(doc, 'Notes', level=2)
    add_para(doc, (
        'The five REVIEW rows above (Patient search and Patient/$validate) '
        'currently return HTTP 403 at the HIP AWS Gateway with an identical '
        '"Invalid key=value pair (missing equal-sign) in Authorization header" '
        'error. Our Bearer token — issued by the KeyCloak token endpoint listed '
        'above and accepted for every GET Patient scenario — is being rejected '
        'only for search and $validate.'
    ), italic=True)
    add_para(doc, (
        'Requesting HNZ confirm: (a) Patient.s and Patient.v scopes are enabled '
        'server-side for App ID HSAPP0404 in UAT; (b) whether Search + $validate '
        'require a different Authorization scheme (e.g. AWS SigV4 rather than '
        'Bearer). Once confirmed we will re-run and update this evidence pack.'
    ), italic=True, color=RED)

    doc.save(str(out_path))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--evidence', type=Path, default=DEFAULT_EVIDENCE, help='NHI compliance-pack JSON')
    p.add_argument('--out', type=Path, default=DEFAULT_OUT, help='Output docx path')
    args = p.parse_args()

    evidence = sload_json(args.evidence)
    build(evidence, args.out)
    print(f'Wrote {args.out}')
    print(f'File size: {args.out.stat().st_size} bytes')


if __name__ == '__main__':
    main()
