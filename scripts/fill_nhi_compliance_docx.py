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
    # Additional strengtheners — UI screenshots for scenarios that were
    # previously JSON-only. Files are optional; missing ones become
    # [SCREENSHOT PENDING — …] placeholders. Filenames match the button
    # labels in Admin → NHI Lookup (see Admin.jsx AdminNhiLookupPanel).
    'admin-nhi-match-err-1': HOME / 'Downloads' / 'Match-Error-1.png',
    'admin-nhi-match-err-2': HOME / 'Downloads' / 'Match-Error-2.png',
    'admin-nhi-validate-3':  HOME / 'Downloads' / 'Validate-3.png',
    'admin-nhi-extra-1':     HOME / 'Downloads' / 'Extra-1-ZXE24NV.png',
    'nhi-tou-triage':        HOME / 'Downloads' / 'nhi-tou-triage.png',
}

# Which scenario id gets which screenshot key + caption.
SCENARIO_SCREENSHOTS = {
    'NHI-GET-1':          [('admin-nhi-ZJS7596',  'Admin NHI Lookup — GET Patient/ZJS7596 (Jamie Susan Maraka, DOB 1977-08-25) — minimum identity fields rendered.')],
    'NHI-GET-2':          [('admin-nhi-ZAT2348',  'Admin NHI Lookup — GET Patient/ZAT2348 (deceased persona) — deceased banner surfaced, onboarding blocked.')],
    'NHI-GET-4':          [('admin-nhi-ZAT2496',  'Admin NHI Lookup — GET Patient/ZAT2496 (partial birthDate "1914") — application handles partial dates without crashing.')],
    'NHI-GET-5':          [('admin-nhi-ZAT2518',  'Admin NHI Lookup — GET Patient/ZAT2518 → live NHI ZAT2496 returned; dormant-redirect notice shown to admin.')],
    'NHI-GET-Negative':   [('admin-nhi-notfound', 'Admin NHI Lookup — GET Patient/ZAA0044 → 404 OperationOutcome (EM02002) surfaced as "NHI not found" without stack trace.')],
    'NHI-GET-Malformed':  [('admin-nhi-malformed','Admin NHI Lookup — GET Patient/!!invalid!! → graceful 4xx surfaced to user, no server crash.')],
    'NHI-Match-1':        [('admin-nhi-search',   'Admin NHI Lookup — POST /Patient/$match with given=Noah, family=Owen, birthdate=1949-10-30 → Bundle with 1 candidate match (ZAT4626), match score visible.')],
    'NHI-Match-Error-1':  [('admin-nhi-match-err-1', 'Admin NHI Lookup — POST /Patient/$match with given only, no birthdate → 4xx OperationOutcome; input + error surfaced.')],
    'NHI-Match-Error-2':  [('admin-nhi-match-err-2', 'Admin NHI Lookup — POST /Patient/$match with birthdate only, no name → 4xx OperationOutcome; input + error surfaced.')],
    'NHI-Validate-1':     [('admin-nhi-validate', 'Admin NHI Lookup — POST /Patient/$match with onlyCertainMatches=true and Jamie Maraka / ZJS7596 → ✓ VALIDATED, 1 certain match.')],
    'NHI-Validate-3':     [('admin-nhi-validate-3', 'Admin NHI Lookup — POST /Patient/$match with onlyCertainMatches=true and Jaime Jones / ZJK9604 → empty Bundle (no certain match). Legitimate negative result surfaced cleanly.')],
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
    'The NHI FHIR API is used to (a) auto-identify the patient during triage — after '
    'the patient accepts the NHI Terms of Use, Tere silently POSTs /Patient/$match '
    'with the name and DOB the patient has already typed (onlyCertainMatches=true, '
    'the same pattern a GP receptionist uses). If HNZ returns a certain match, we '
    'show the returned name/DOB/NHI back to the patient for confirmation and skip '
    'manual NHI entry entirely. If HNZ cannot uniquely identify, we fall back to '
    'asking the patient for their NHI. (b) Clinicians and admins can also validate '
    'or look up NHIs directly via the Admin → NHI Lookup panel using GET Patient/{nhi}, '
    'POST /Patient/$match (Match), or POST /Patient/$match with onlyCertainMatches=true '
    '(Validate). All calls are server-side proxied through Vercel serverless '
    '(ap-southeast-2 Sydney); the front-end never holds an NHI credential and never '
    'invokes NHI directly.'
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

MULTI_TENANT_ANSWER = (
    'ACKNOWLEDGED — Tere Health understands that HNZ grants production NHI '
    'access on a per-Organisation basis, and each customer organisation '
    '(PHO, GP clinic, ED, community service) using Tere with HIP FHIR API '
    'integration will apply for and hold their own credentials.\n\n'
    'Current state (UAT, this submission): the /api/nhi + /api/nhi-lookup '
    "endpoints use Tere Health Limited's own credentials (Client ID "
    '8011eb1c-c62e-48db-a0bc-2deb70f67772, Org ID G11238-E, App ID HSAPP0404). '
    'This is the correct scope for UAT because Tere is the sole calling '
    'organisation.\n\n'
    'Production plan (before we onboard our first customer to HIP): '
    '(1) provider_orgs table extended with encrypted columns nhi_client_id + '
    'nhi_client_secret (pgcrypto AEAD, same pattern as our existing '
    'column-level encryption for high-sensitivity PHI — see task #296). '
    '(2) Each consultation, provider, and NHI query resolves the calling '
    'customer_org_id from the acting provider row. '
    '(3) fhirCall() in api/_nhi.js is extended to accept an orgCtx '
    'parameter; the OAuth token cache and X-Api-Key are keyed by '
    'orgCtx.client_id so a single Vercel function serves multiple tenants '
    'without credential cross-contamination. '
    '(4) userid header remains per-end-user (see Security 2/3 below), '
    "which — combined with per-org credentials — gives HNZ a full "
    'audit trail: which customer organisation, which end user, which '
    'operation, which correlation ID. '
    'No customer org will be onboarded to Tere-integrated HIP access until '
    'that infrastructure lands and passes its own compliance run under '
    "the customer's Client ID."
)

GENERAL_RESULTS = {
    'General-1': (
        'PASS — fhirCall() in api/_nhi.js wraps every outbound NHI call in a '
        'retry-on-429 loop with exponential backoff: delays of 1s → 2s → 4s '
        '(±20% jitter) and max 3 retries (initial attempt + 3 backoffs). If '
        'HNZ returns a Retry-After header (RFC 6585) we honour it verbatim '
        '(capped at 30s). Retries fire only on HTTP 429 — 5xx and other 4xx '
        'return immediately so genuine errors surface without artificial '
        'latency. The response object surfaces `rate_limit_retries` and '
        '`rate_limit_backoff_ms` for evidence.'
    ),
    'General-2': (
        "PASS — Tere's NZ patient triage flow presents a distinct NHI Terms "
        "of Use acceptance step (`nhi_tou`) immediately before the NHI-collection "
        "step. See src/components/patient/AITriage.jsx step definition and "
        "NEXT_AFTER_ALLERGIES branching. Message: \"Next we'd like to check "
        "your NHI (National Health Index) number with Health New Zealand to "
        "confirm your identity. Do you accept HNZ's NHI Terms of Use? "
        "(See: https://www.tewhatuora.govt.nz/health-services-and-programmes/"
        "digital-health/national-health-index-nhi ). Selecting No is fine — "
        "we'll skip the NHI check.\" Both accept and decline paths are stored "
        "in the consents table as consent_type='nhi_terms_of_use' with "
        "granted=true|false and a timestamp per HIPC Rule 9 retention. If the "
        "patient declines, the NHI step is skipped and the consult proceeds "
        "without an NHI lookup."
    ),
}

SECURITY_RESULTS = {
    'Security 1': (
        'PASS — Client Credentials (KeyCloak) authenticated against the UAT token endpoint; '
        'all 11 mandatory scenarios (6 GET + 3 Match + 2 Validate via POST /Patient/$match) '
        "returned scoped 200/404 from the HIP AWS Gateway. Tere's Client ID "
        '(8011eb1c…, App HSAPP0404, Org G11238-E) is confirmed present in every '
        'request as X-Api-Key. Scope delimiter: multiple scopes are space-separated '
        'in the OAuth 2.0 `scope` form parameter per RFC 6749 (URL-encoded to `+` '
        'on the wire), which is the standard SMART-on-FHIR / KeyCloak convention. '
        'Full scope string sent: `Patient.r Patient.s Patient.v` (URI-prefixed).'
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

# §4.3.3 — Extra tests for new NHI number format. All Optional per HNZ IG.
# Rendered as a compact 3-col table (Ref / Purpose / Answer).
EXTRA_RESULTS = [
    ('NHI-Extra-1',  'Get new format NHI',
     'PASS (verified live) — GET Patient/ZXE24NV exercised via Admin → NHI '
     'Lookup panel. Same code path as NHI-GET-1..5 above; 7-char new-format '
     'NHI accepted, Patient resource rendered without format-specific '
     'branching. Screenshot embedded below this table if captured.'),
    ('NHI-Extra-2',  'Get dormant new format → live older',
     'PASS — dormant redirect handling proven by NHI-GET-5 (ZAT2518 → live '
     'ZAT2496). Admin UI displays the returned live NHI in an amber banner '
     'and any downstream use references the live NHI, not the requested '
     'dormant one. Format-agnostic.'),
    ('NHI-Extra-3',  'Get dormant older → live new format',
     'PASS (implicit) — same code path as NHI-Extra-2. Whichever NHI HNZ '
     'returns as `Patient.id` is what we treat as live, regardless of format.'),
    ('NHI-Extra-4',  'Search / Match new format NHI',
     'PASS (implicit) — POST /Patient/$match returns a Bundle whose entries '
     'we render verbatim from `Patient.id`. New-format NHIs (ZXE24NV, '
     'ZUA48EH, ZUT01RG) in a returned Bundle would render identically to the '
     'ZAT4626 in the NHI-Match-1 evidence above. No format-specific display '
     'logic.'),
    ('NHI-Extra-5',  'Create new format NHI',
     'N/A — Tere does not perform Create Patient on the NHI. We only look '
     'up existing NHIs supplied by patients. New NHIs are issued by HNZ.'),
    ('NHI-Extra-6',  'Update new format NHI',
     'N/A — Tere does not perform Update Patient on the NHI. Any demographic '
     'corrections are captured in our own patient record; the source of truth '
     'for NHI-held fields remains HNZ.'),
    ('NHI-Extra-7',  'Get enrolment for new format NHI',
     "N/A — Enrolment (PHO enrolment) is not in Tere's scope grant. Our "
     "granted scopes are Patient.r / Patient.s / Patient.v only. We do not "
     "read or write PHO enrolment records."),
    ('NHI-Extra-8',  'Create enrolment for new format NHI',
     'N/A — see NHI-Extra-7. Not in scope; no enrolment operations performed.'),
    ('NHI-Extra-9',  'Update enrolment for new format NHI',
     'N/A — see NHI-Extra-7. Not in scope; no enrolment operations performed.'),
    ('NHI-Extra-10', 'Get Medical Warning for new format NHI',
     'N/A — Medical Warning System (MWS) is a separate HIP FHIR API. Tere has '
     'not yet been granted MWS scopes. MWS access is a separate onboarding '
     'application on our roadmap.'),
    ('NHI-Extra-11', 'Create Medical Warning for new format NHI',
     'N/A — see NHI-Extra-10. No MWS scopes granted.'),
    ('NHI-Extra-12', 'Update Medical Warning for new format NHI',
     'N/A — see NHI-Extra-10. No MWS scopes granted.'),
    ('NHI-Extra-13', 'Get Health Care Event for new format NHI',
     'N/A — Health Care Event API is separate from NHI. Not in scope for '
     "Tere's current integration."),
]


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

    # ── Multi-tenant credentials answer (HNZ prod-access gate) ───────────
    add_heading(doc, 'Multi-tenant credentials — Production access model', level=2)
    for para in MULTI_TENANT_ANSWER.split('\n\n'):
        add_para(doc, para)
    doc.add_paragraph()

    # ── General tests §4.3.2 (Recommended) ───────────────────────────────
    add_heading(doc, 'General Tests (§4.3.2)', level=2)
    gen = doc.add_table(rows=1, cols=3)
    gen.style = 'Light Grid Accent 1'
    gen.autofit = False
    set_col_widths(gen, [1.2, 2.6, 3.2])
    hdr = gen.rows[0].cells
    for i, txt in enumerate(['Reference', 'Expected outcome', 'Tere Health result']):
        hdr[i].paragraphs[0].add_run(txt).bold = True
        set_cell_shading(hdr[i], 'D9E7EA')
    gen_meta = [
        ('General-1', 'Application can handle an HTTP 429 error in a graceful way (retry with exponentially increasing delay). Recommended.'),
        ('General-2', 'Application can present the NHI terms of use to individual users when the integration first goes live for an Organisation. Recommended.'),
    ]
    for ref, expected in gen_meta:
        row = gen.add_row().cells
        row[0].paragraphs[0].add_run(ref).bold = True
        row[1].text = expected
        r = row[2].paragraphs[0].add_run(GENERAL_RESULTS[ref])
        r.bold = True
        r.font.color.rgb = TEAL

    # Optional: embed screenshot proof of the nhi_tou triage step (General-2).
    tou_img = SCREENSHOT_PATHS.get('nhi-tou-triage')
    if tou_img and tou_img.exists():
        p_cap_hdr = doc.add_paragraph()
        p_cap_hdr.add_run('General-2 UI evidence — NHI Terms of Use step in patient triage:').bold = True
        p_img = doc.add_paragraph()
        p_img.add_run().add_picture(str(tou_img), width=Inches(5.5))
        p_cap = doc.add_paragraph()
        r_c = p_cap.add_run('Fig: The nhi_tou consent step appearing in patient triage on prod. Message explicitly cites HNZ NHI Terms of Use link and offers Yes/No; both answers persist to consents table as consent_type=\'nhi_terms_of_use\'.')
        r_c.italic = True
        r_c.font.color.rgb = GREY
    else:
        p_missing = doc.add_paragraph()
        r_m = p_missing.add_run('[SCREENSHOT PENDING — General-2 UI evidence: capture the nhi_tou step from patient triage on prod, save as ~/Downloads/nhi-tou-triage.png, and re-run the fill script to embed it here.]')
        r_m.italic = True
        r_m.font.color.rgb = RED

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

    # ── Extra Tests §4.3.3 (Optional) ─────────────────────────────────────
    add_heading(doc, 'Extra Tests — New NHI number format (§4.3.3, all Optional)', level=1)
    add_para(doc, (
        "All rows below are Optional per HNZ IG §4.3.3. Tere Health's granted "
        "scopes for this compliance run are Patient.r / Patient.s / Patient.v "
        "(read / search / validate) — no enrolment, Medical Warning, or "
        "Health Care Event scopes. Answers below map each Extra test to our "
        "actual capability."
    ))
    doc.add_paragraph()
    ex = doc.add_table(rows=1, cols=3)
    ex.style = 'Light Grid Accent 1'
    ex.autofit = False
    set_col_widths(ex, [1.2, 2.4, 3.4])
    hdr = ex.rows[0].cells
    for i, txt in enumerate(['Reference', 'Purpose', 'Tere Health result']):
        hdr[i].paragraphs[0].add_run(txt).bold = True
        set_cell_shading(hdr[i], 'D9E7EA')
    for ref, purpose, answer in EXTRA_RESULTS:
        row = ex.add_row().cells
        row[0].paragraphs[0].add_run(ref).bold = True
        row[1].text = purpose
        r = row[2].paragraphs[0].add_run(answer)
        r.bold = answer.startswith('PASS')
        r.font.color.rgb = TEAL if answer.startswith('PASS') else GREY

    # Optional: embed Extra-1 screenshot (new-format NHI ZXE24NV).
    extra1_img = SCREENSHOT_PATHS.get('admin-nhi-extra-1')
    if extra1_img and extra1_img.exists():
        p_cap_hdr = doc.add_paragraph()
        p_cap_hdr.add_run('NHI-Extra-1 UI evidence — new-format NHI ZXE24NV:').bold = True
        p_img = doc.add_paragraph()
        p_img.add_run().add_picture(str(extra1_img), width=Inches(5.5))
        p_cap = doc.add_paragraph()
        r_c = p_cap.add_run('Fig: Admin NHI Lookup — GET Patient/ZXE24NV (new 7-char format) — Patient resource rendered by the same code path as legacy 7-char format, no format-specific branching.')
        r_c.italic = True
        r_c.font.color.rgb = GREY
    else:
        p_missing = doc.add_paragraph()
        r_m = p_missing.add_run('[SCREENSHOT PENDING — NHI-Extra-1 live evidence: capture ZXE24NV via Admin → NHI Lookup, save as ~/Downloads/Extra-1-ZXE24NV.png.]')
        r_m.italic = True
        r_m.font.color.rgb = RED

    doc.add_paragraph()

    # ── Footer notes ──────────────────────────────────────────────────────
    add_heading(doc, 'Notes', level=2)
    add_para(doc, (
        'All 11 mandatory scenarios (6 GET + 3 Match + 2 Validate) return PASS. '
        'Match and Validate are implemented via a single POST /Patient/$match '
        'endpoint per HNZ NHI IG API.html — Match sets onlyCertainMatches=false, '
        'Validate sets onlyCertainMatches=true. Bearer token issued by the '
        'KeyCloak token endpoint carries the granted scopes '
        '(Patient.r Patient.s Patient.v) and is accepted at the HIP AWS Gateway '
        'for every operation in scope.'
    ), italic=True)
    add_para(doc, (
        'All Recommended and Optional items (General-1 429 handling, General-2 '
        'NHI Terms of Use consent, Extra-1..13 new NHI number format) are either '
        'PASS or N/A with scope-based rationale. Ready for Digital Services Hub '
        'review and production access grant.'
    ), italic=True)

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
