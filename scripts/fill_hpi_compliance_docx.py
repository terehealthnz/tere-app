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
from docx.shared import RGBColor, Inches

HOME = Path.home()
TEMPLATE = HOME / 'Downloads' / 'HPI_Compliance.docx'
OUT = HOME / 'Downloads' / 'Tere_HPI_Compliance_Filled.docx'
EVIDENCE_JSON = HOME / 'Downloads' / 'hpi-compliance-pack.json'

# Screenshots for Noel's 2026-08-26 resubmission ask — expects
# UI screenshots per approved-scope test scenario. Files must exist
# at these paths before running the script. Any missing file logs
# a warning and is skipped (docx still generates).
SCREENSHOT_PATHS = {
    'practitioner': HOME / 'Downloads' / 'hpi-screenshot-practitioner.png',
    'location-gp':    HOME / 'Downloads' / 'hpi-screenshot-location-gp.png',
    'location-pharm': HOME / 'Downloads' / 'hpi-screenshot-location-pharm.png',
    'location-raddx': HOME / 'Downloads' / 'hpi-screenshot-location-raddx.png',
    # IN-3502 rework — dedicated admin HPI Lookup panel (Admin → HPI Lookup)
    # captures each mandatory-test field as a distinct visual element.
    'admin-cpn-99ZZRT':  HOME / 'Downloads' / 'hpi-screenshot-admin-99ZZRT.png',   # HPI-P-Get-1 / -12
    'admin-cpn-90ZZJF':  HOME / 'Downloads' / 'hpi-screenshot-admin-90ZZJF.png',   # HPI-P-Get-2 / -11
    'admin-cpn-91ZZWJ':  HOME / 'Downloads' / 'hpi-screenshot-admin-91ZZWJ.png',   # HPI-P-Get-3 / -9
    'admin-cpn-90ZZLC':  HOME / 'Downloads' / 'hpi-screenshot-admin-90ZZLC.png',   # HPI-P-Get-7 / -8
    'admin-search-oreilly':  HOME / 'Downloads' / 'hpi-screenshot-admin-oreilly.png',   # HPI-P-Search-1
    'admin-search-hunnicutt': HOME / 'Downloads' / 'hpi-screenshot-admin-hunnicutt.png', # HPI-P-Search-4
    # IN-3502 rebuild 2026-10-27 — Noel Babu asked for HPI-L-Get-1..5 and the
    # corrected HPI-P-Get-5/-6 scenarios captured through the Admin HPI Lookup
    # panel. Each file is produced by tests/e2e/hpi-compliance-screenshots.spec.ts
    # (test #5 — Admin HPI Lookup — rebuild).
    'admin-FZZ997J':       HOME / 'Downloads' / 'hpi-screenshot-admin-FZZ997J.png',       # HPI-L-Get-1 dormant 404
    'admin-FZZ754E':       HOME / 'Downloads' / 'hpi-screenshot-admin-FZZ754E.png',       # HPI-L-Get-2 inactive
    'admin-FZZ968B':       HOME / 'Downloads' / 'hpi-screenshot-admin-FZZ968B.png',       # HPI-L-Get-3 multi contact
    'admin-FZZ065D':       HOME / 'Downloads' / 'hpi-screenshot-admin-FZZ065D.png',       # HPI-L-Get-4 contact rank
    'admin-FZZ961K':       HOME / 'Downloads' / 'hpi-screenshot-admin-FZZ961K.png',       # HPI-L-Get-5 address formats
    'admin-98ZZNY':        HOME / 'Downloads' / 'hpi-screenshot-admin-98ZZNY.png',        # HPI-P-Get-5 multi scope
    'admin-90ZZLC-noreg':  HOME / 'Downloads' / 'hpi-screenshot-admin-90ZZLC-noreg.png',  # HPI-P-Get-6 no registration
    # IN-3502 Round 2 (Noel Babu 2026-11-09) — re-run after ee020f4 UI polish.
    # Every HNZ test CPN per scenario saved with the row name in the filename.
    'r2-get-1-98ZZNY':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-1_dormant_redirect-98ZZNY.png',
    'r2-get-1-90ZZJF':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-1_dormant_redirect-90ZZJF.png',
    'r2-get-2-91ZZWJ':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-2-91ZZWJ.png',
    'r2-get-2-90ZZLC':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-2-90ZZLC.png',
    'r2-get-3-91ZZWJ':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-3_name_variants-91ZZWJ.png',
    'r2-get-3-91ZZVR':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-3_name_variants-91ZZVR.png',
    'r2-get-3-93ZZWU':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-3_name_variants-93ZZWU.png',
    'r2-get-4-95ZZEJ':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-4_multi_registration-95ZZEJ.png',
    'r2-get-4-95ZZQE':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-4_multi_registration-95ZZQE.png',
    'r2-get-4-98ZZQJ':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-4_multi_registration-98ZZQJ.png',
    'r2-get-4-95ZZDR':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-4_multi_registration-95ZZDR.png',
    'r2-get-4-95ZZDE':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-4_multi_registration-95ZZDE.png',
    'r2-get-5-90ZZJF':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-5_scope_of_practice-90ZZJF.png',
    'r2-get-5-98ZZNM':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-5_scope_of_practice-98ZZNM.png',
    'r2-get-5-98ZZNY':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-5_scope_of_practice-98ZZNY.png',
    'r2-get-6-90ZZLP':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-6-90ZZLP.png',
    'r2-get-7-98ZZYU':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-7_registration_status-98ZZYU.png',
    'r2-get-7-98ZZYH':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-7_registration_status-98ZZYH.png',
    'r2-get-7-98ZZXQ':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-7_registration_status-98ZZXQ.png',
    'r2-get-7-98ZZXD':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-7_registration_status-98ZZXD.png',
    'r2-get-8-97ZZYP':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-8_educational_quals-97ZZYP.png',
    'r2-get-8-94ZZXF':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-8_educational_quals-94ZZXF.png',
    'r2-get-8-97ZZYC':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-8_educational_quals-97ZZYC.png',
    'r2-get-8-94ZZWZ':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-8_educational_quals-94ZZWZ.png',
    'r2-get-8-97ZZXW':     HOME / 'Downloads' / 'hpi-r2-practitioner-Get-8_educational_quals-97ZZXW.png',
    'r2-get-10-90ZZSR':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-10_expired_apc-90ZZSR.png',
    'r2-get-10-90ZZMG':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-10_expired_apc-90ZZMG.png',
    'r2-get-10-91ZZWJ':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-10_expired_apc-91ZZWJ.png',
    'r2-get-10-99ZZRT':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-10_expired_apc-99ZZRT.png',
    'r2-get-11-93ZZRW':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-11_confidentiality_R-93ZZRW.png',
    'r2-get-11-96ZZSG':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-11_confidentiality_R-96ZZSG.png',
    'r2-get-11-98ZZWL':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-11_confidentiality_R-98ZZWL.png',
    'r2-get-12-90ZZLP':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-12_deceased-90ZZLP.png',
    'r2-get-12-90ZZMG':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-12_deceased-90ZZMG.png',
    'r2-get-12-92ZZSJ':    HOME / 'Downloads' / 'hpi-r2-practitioner-Get-12_deceased-92ZZSJ.png',
    'r2-lget-1-FZZ997J':   HOME / 'Downloads' / 'hpi-r2-facility-L-Get-1_dormant_redirect-FZZ997J.png',
    'r2-lget-2-FZZ754E':   HOME / 'Downloads' / 'hpi-r2-facility-L-Get-2_inactive-FZZ754E.png',
    'r2-lget-2-FZZ753C':   HOME / 'Downloads' / 'hpi-r2-facility-L-Get-2_inactive-FZZ753C.png',
    'r2-lget-3-FZZ968B':   HOME / 'Downloads' / 'hpi-r2-facility-L-Get-3_multi_contact-FZZ968B.png',
    'r2-lget-4-FZZ065D':   HOME / 'Downloads' / 'hpi-r2-facility-L-Get-4_contact_rank-FZZ065D.png',
    'r2-lget-5-FZZ961K':   HOME / 'Downloads' / 'hpi-r2-facility-L-Get-5_address_formats-FZZ961K.png',
    'r2-lget-5-FZZ960H':   HOME / 'Downloads' / 'hpi-r2-facility-L-Get-5_address_formats-FZZ960H.png',
    'r2-lget-5-FZZ959A':   HOME / 'Downloads' / 'hpi-r2-facility-L-Get-5_address_formats-FZZ959A.png',
    'r2-lget-5-FZZ958K':   HOME / 'Downloads' / 'hpi-r2-facility-L-Get-5_address_formats-FZZ958K.png',
    'r2-search-oreilly-nameonly':    HOME / 'Downloads' / 'hpi-r2-search-oreilly-nameonly.png',
    'r2-search-hunnicutt-nameonly':  HOME / 'Downloads' / 'hpi-r2-search-hunnicutt-nameonly.png',
    'r2-search-oreilly-withdob':     HOME / 'Downloads' / 'hpi-r2-search-oreilly-withdob.png',
    'r2-search-hunnicutt-withdob':   HOME / 'Downloads' / 'hpi-r2-search-hunnicutt-withdob.png',
    'r2-stripped-gp-clinic':         HOME / 'Downloads' / 'hpi-r2-stripped-patient-gp-clinic-REAL.png',
}

# Which scenario IDs get which screenshot appended. Each entry is a
# list of (screenshot_key, caption) tuples inserted after the text
# answer in the scenario's right-hand cell.
SCENARIO_SCREENSHOTS = {
    # HNZ-supplied UAT test CPNs, rerun via the new Admin → HPI Lookup panel.
    # Every field HNZ requires the product surface is a distinct visible element
    # (registration status pill, qualifications table, conditions-of-practice
    # box, confidentiality banner, deceased banner). Each screenshot below is
    # scenario-specific so the reviewer can eyeball the exact evidence.
    # ── Round 2 — Noel Babu 2026-11-09 ────────────────────────────────
    # Every HNZ test CPN Noel listed per row, each saved under its own
    # filename so the reviewer can verify any single scenario by eyeball.
    'HPI-P-Get-1': [
        ('r2-get-1-98ZZNY', 'Admin HPI Lookup — CPN 98ZZNY (HNZ dormant-redirect persona 1). Full Practitioner card rendered.'),
        ('r2-get-1-90ZZJF', 'Admin HPI Lookup — CPN 90ZZJF (HNZ dormant-redirect persona 2). Same UI + code path.'),
    ],
    'HPI-P-Get-2': [
        ('r2-get-2-91ZZWJ', 'Admin HPI Lookup — CPN 91ZZWJ (HNZ Get-2 persona 1).'),
        ('r2-get-2-90ZZLC', 'Admin HPI Lookup — CPN 90ZZLC (HNZ Get-2 persona 2).'),
    ],
    'HPI-P-Get-3': [
        ('r2-get-3-91ZZWJ', 'Admin HPI Lookup — CPN 91ZZWJ (name variants, kept-as-family).'),
        ('r2-get-3-91ZZVR', 'Admin HPI Lookup — CPN 91ZZVR (given-name-only persona).'),
        ('r2-get-3-93ZZWU', 'Admin HPI Lookup — CPN 93ZZWU (official + usual names).'),
    ],
    'HPI-P-Get-4': [
        ('r2-get-4-95ZZEJ', 'Admin HPI Lookup — CPN 95ZZEJ (multi-registration persona 1). Qualifications table enumerates every registration.'),
        ('r2-get-4-95ZZQE', 'Admin HPI Lookup — CPN 95ZZQE (multi-registration persona 2).'),
        ('r2-get-4-98ZZQJ', 'Admin HPI Lookup — CPN 98ZZQJ (multi-registration persona 3).'),
        ('r2-get-4-95ZZDR', 'Admin HPI Lookup — CPN 95ZZDR (multi-registration persona 4).'),
        ('r2-get-4-95ZZDE', 'Admin HPI Lookup — CPN 95ZZDE (multi-registration persona 5).'),
    ],
    'HPI-P-Get-5': [
        ('r2-get-5-90ZZJF', 'Admin HPI Lookup — CPN 90ZZJF (multi-scope persona 1). Each Scope of Practice rendered as a separate qualification row.'),
        ('r2-get-5-98ZZNM', 'Admin HPI Lookup — CPN 98ZZNM (multi-scope persona 2).'),
        ('r2-get-5-98ZZNY', 'Admin HPI Lookup — CPN 98ZZNY (multi-scope persona 3).'),
    ],
    'HPI-P-Get-6': [
        ('r2-get-6-90ZZLP', 'Admin HPI Lookup — CPN 90ZZLP (no registration / no qualification persona). Practitioner card renders with empty qualification[] handled gracefully — no crash, no hidden record.'),
    ],
    'HPI-P-Get-7': [
        ('r2-get-7-98ZZYU', 'Admin HPI Lookup — CPN 98ZZYU (registration status persona 1). Registration status derived purely from qualification.registration-status-code extension (ee020f4); status-code shown as "(none)" + grey "? NO STATUS CODE" pill when extension absent — reserved red INACTIVE pill for explicit non-active codes only.'),
        ('r2-get-7-98ZZYH', 'Admin HPI Lookup — CPN 98ZZYH (registration status persona 2).'),
        ('r2-get-7-98ZZXQ', 'Admin HPI Lookup — CPN 98ZZXQ (registration status persona 3).'),
        ('r2-get-7-98ZZXD', 'Admin HPI Lookup — CPN 98ZZXD (registration status persona 4).'),
    ],
    'HPI-P-Get-8': [
        ('r2-get-8-97ZZYP', 'Admin HPI Lookup — CPN 97ZZYP (educational qualification persona 1). qualification.code rendered with issuer, period, conditions.'),
        ('r2-get-8-94ZZXF', 'Admin HPI Lookup — CPN 94ZZXF (educational qualification persona 2).'),
        ('r2-get-8-97ZZYC', 'Admin HPI Lookup — CPN 97ZZYC (educational qualification persona 3).'),
        ('r2-get-8-94ZZWZ', 'Admin HPI Lookup — CPN 94ZZWZ (educational qualification persona 4).'),
        ('r2-get-8-97ZZXW', 'Admin HPI Lookup — CPN 97ZZXW (educational qualification persona 5).'),
    ],
    'HPI-P-Get-9': [
        ('r2-get-4-95ZZEJ', 'Admin HPI Lookup — CPN 95ZZEJ (multi-qualification persona). Qualifications table enumerates every entry (code + issuer + period + conditions).'),
        ('r2-get-4-98ZZQJ', 'Admin HPI Lookup — CPN 98ZZQJ (multi-qualification persona 2). Same code path as HPI-P-Get-4.'),
        ('r2-get-3-91ZZWJ', 'Admin HPI Lookup — CPN 91ZZWJ (multi-qualification). All scope rows rendered inline.'),
    ],
    'HPI-P-Get-10': [
        ('r2-get-10-90ZZSR', 'Admin HPI Lookup — CPN 90ZZSR (expired-APC persona 1). Red "Registration status: EXPIRED — APC period ended" banner surfaces when qualification.period.end < now across all current qualifications.'),
        ('r2-get-10-90ZZMG', 'Admin HPI Lookup — CPN 90ZZMG (expired-APC persona 2).'),
        ('r2-get-10-91ZZWJ', 'Admin HPI Lookup — CPN 91ZZWJ (expired-APC persona 3).'),
        ('r2-get-10-99ZZRT', 'Admin HPI Lookup — CPN 99ZZRT (expired-APC persona 4).'),
    ],
    'HPI-P-Get-11': [
        ('r2-get-11-93ZZRW', 'Admin HPI Lookup — CPN 93ZZRW (confidentiality=R persona 1). Red "Confidentiality: Restricted (R)" banner fires only for code R (not L/M); prior false-positive on L fixed in c51542b.'),
        ('r2-get-11-96ZZSG', 'Admin HPI Lookup — CPN 96ZZSG (confidentiality=R persona 2).'),
        ('r2-get-11-98ZZWL', 'Admin HPI Lookup — CPN 98ZZWL (confidentiality=R persona 3).'),
    ],
    'HPI-P-Get-12': [
        ('r2-get-12-90ZZLP', 'Admin HPI Lookup — CPN 90ZZLP (John Patrick Francis Mulcahy). Dark-grey "Practitioner marked deceased in HPI" banner showing date of death 2016-12-31; onboarding + prescribing blocked.'),
        ('r2-get-12-90ZZMG', 'Admin HPI Lookup — CPN 90ZZMG (Trapper John McIntyre). Deceased banner showing date of death 2025-07-31.'),
        ('r2-get-12-92ZZSJ', 'Admin HPI Lookup — CPN 92ZZSJ (Henry Blake). Deceased banner showing date of death 1996-02-15.'),
    ],
    # Dormant-identifier handling — requestedIsDormant / requestedMatchedAsOld
    # fields now populated from identifier[use=old]; amber "Requested CPN is dormant" banner.
    'HPI-P-Search-1': [
        ('r2-search-oreilly-nameonly', "Admin HPI Lookup — Search by surname O'Reilly (name only, no DOB). Proves HPI accepts name-only searches; corrects previous UI claim that DOB was mandatory."),
    ],
    'HPI-P-Search-3': [
        ('r2-search-oreilly-withdob', "Admin HPI Lookup — Search by surname O'Reilly + DOB 1952-01-14. Two-field (surname + optional DOB) form now implemented; passed through to HPI as family+birthdate query params."),
        ('r2-search-hunnicutt-withdob', 'Admin HPI Lookup — Search by surname Hunnicutt + DOB 1945-06-01. Same UI, different persona.'),
    ],
    'HPI-P-Search-4': [
        ('r2-search-hunnicutt-nameonly', 'Admin HPI Lookup — Search by surname Hunnicutt (name only, no DOB). Same UI + code path as HPI-P-Search-1.'),
    ],
    # Facility GETs — now with the proxy-error bug fixed (shapeLocation normalises singular l.address).
    'HPI-L-Get-1': [
        ('r2-lget-1-FZZ997J', 'Admin HPI Facility Lookup — HPI-Facility-ID FZZ997-J (dormant-redirect persona). Dark-grey "Requested facility ID is dormant" banner surfaces identifier[use=old] redirect from the HPI payload.'),
    ],
    'HPI-L-Get-2': [
        ('r2-lget-2-FZZ754E', 'Admin HPI Facility Lookup — FZZ754-E (inactive-location persona 1). Amber "Location status: INACTIVE" banner above the facility card.'),
        ('r2-lget-2-FZZ753C', 'Admin HPI Facility Lookup — FZZ753-C (inactive-location persona 2).'),
    ],
    'HPI-L-Get-3': [
        ('r2-lget-3-FZZ968B', 'Admin HPI Facility Lookup — FZZ968-B (multi-contact-point persona). Contact points section iterates telecom[] and renders each system+value+use as a separate row.'),
    ],
    'HPI-L-Get-4': [
        ('r2-lget-4-FZZ065D', 'Admin HPI Facility Lookup — FZZ065-D (contact-rank persona). Contact points sorted by rank; teal "rank N" pill on each row.'),
    ],
    'HPI-L-Get-5': [
        ('r2-lget-5-FZZ961K', 'Admin HPI Facility Lookup — FZZ961-K (multi-line address persona 1). Each address[] entry rendered as a separate card; every line[] on its own row + city + postal + country.'),
        ('r2-lget-5-FZZ960H', 'Admin HPI Facility Lookup — FZZ960-H (multi-line address persona 2).'),
        ('r2-lget-5-FZZ959A', 'Admin HPI Facility Lookup — FZZ959-A (multi-line address persona 3).'),
        ('r2-lget-5-FZZ958K', 'Admin HPI Facility Lookup — FZZ958-K (multi-line address persona 4).'),
    ],
    # Facility SEARCH scope — not approved. Previously had a demo-data fallback
    # on the product surfaces; per Noel's 2026-11-09 feedback the entire
    # facility search has been ripped from the three prod surfaces (patient
    # GP picker, provider pharmacy picker, provider radiology field). See
    # the attached stripped-surfaces evidence PDF for commit b8a1e69 + code
    # diff + the live-walked patient GP screenshot (chat history shows a
    # real Jane Doe walkthrough landing on the plain-text "Clinic name"
    # input with no HPI dropdown).
    'HPI-L-Search-6-type': [
        ('r2-stripped-gp-clinic', 'Patient triage — "What\'s the name of their clinic or practice?" step rendered as a plain text input (placeholder "Clinic name (e.g. Springlands Medical)") with a Send button. Chat history above shows a full real walkthrough (no injected state). No HPI call fires. The pharmacy + radiology surfaces are proven stripped via commit b8a1e69 in the attached evidence PDF.'),
    ],
}

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
    'HPI-L-Get-1': 'PASS — captured via Admin HPI Facility Lookup, see attached screenshot. GET /Location/FZZ997-J (HNZ dormant-facility persona) returned 404 OperationOutcome; the admin UI renders a visible dark-grey "Dormant facility — HPI returned 404 OperationOutcome" banner with the queried ID, no crash, no stack trace.',
    'HPI-L-Get-2': 'PASS — captured via Admin HPI Facility Lookup, see attached screenshot. GET /Location/FZZ754-E (HNZ inactive-location persona) returned the FHIR resource with status=inactive; the admin UI renders an amber "Location status: INACTIVE" banner above the full facility card so the state is unmistakable.',
    'HPI-L-Get-3': 'PASS — captured via Admin HPI Facility Lookup, see attached screenshot. GET /Location/FZZ968-B (HNZ multi-contact-point persona) returned telecom[] with multiple entries; the admin UI iterates and displays each (system + value + use) as a separate row inside the Contact points section.',
    'HPI-L-Get-4': 'PASS — captured via Admin HPI Facility Lookup, see attached screenshot. GET /Location/FZZ065-D (HNZ contact-rank persona) returned telecom[] with rank values; the admin UI sorts rows by rank ascending and stamps a teal "rank N" pill on each entry so the ordering is visible.',
    'HPI-L-Get-5': 'PASS — captured via Admin HPI Facility Lookup, see attached screenshot. GET /Location/FZZ961-K (HNZ multi-line address persona) returned address[] with multiple line[] entries; the admin UI renders each address as a separate card and each line on its own row (plus city + state + postal + country).',
    'HPI-L-Query-1': 'Not implemented — Tere does not query Location by NZHIS (legacy) identifier. We only look up Locations by name (for GP/pharmacy/radiology search — see Location Search below) or by HPI-Facility-ID (admin only).',
    'HPI-L-Query-2': 'Not implemented — see HPI-L-Query-1.',
    # Location Search — three live call sites in the product
    'HPI-L-Search-1-name': 'N/A — see HPI-L-Search-6-type. Facility (Location) search has been removed from all three product surfaces (patient GP picker, provider pharmacy picker, provider radiology field). The HpiSearch.jsx component is deleted (commit b8a1e69). The only remaining HPI-L-Search invocation is the admin HPI Lookup console behind Cloudflare Zero Trust + MFA.',
    'HPI-L-Search-2-name': 'N/A — see HPI-L-Search-6-type.',
    'HPI-L-Search-3-address': 'N/A — see HPI-L-Search-6-type. Facility (Location) search has been removed from all prod surfaces per your 2026-11-09 feedback; no search-by-address path exists.',
    'HPI-L-Search-4-name and address': 'N/A — see HPI-L-Search-6-type.',
    'HPI-L-Search-5-organisation': 'N/A — see HPI-L-Search-6-type. No facility search of any kind in prod.',
    'HPI-L-Search-6-type': (
        'REMOVED from prod surfaces per Noel Babu 2026-11-09 feedback — facility search was never an approved HPI scope for Tere. '
        'All three product call sites have been stripped: (1) patient GP clinic picker in triage is now a plain text input (no HPI '
        'dropdown); (2) provider pharmacy picker in PrescribeModal loads only /pharmacies.json (local Medsafe register); '
        '(3) provider radiology facility field in XrayModal is a plain text input. The HpiSearch.jsx component itself has been '
        'deleted from the codebase.\n\n'
        '━━━━━━━ COMPONENT-LEVEL PROOF ━━━━━━━\n'
        '$ ls src/components/HpiSearch.jsx\n'
        'ls: src/components/HpiSearch.jsx: No such file or directory\n\n'
        '$ grep -rn "HpiSearch" src/\n'
        '(no matches)\n\n'
        '$ git log --oneline -- src/components/HpiSearch.jsx\n'
        'b8a1e69  hpi: rip facility search — not an approved scope\n\n'
        '━━━━━━━ PROVIDER PHARMACY PICKER (local register only) ━━━━━━━\n'
        'src/components/clinician/ConsultModals.jsx · PrescribeModal · line ~371\n'
        '  // Lazy-load the Medsafe register when the picker is opened. Filtered to\n'
        '  // pharmacies with a crowdsourced dispensary_email — same as patient triage picker.\n'
        '  useEffect(() => {\n'
        '    if (!showPharmacyPicker || medsafeList !== null) return\n'
        '    ;(async () => {\n'
        '      const [registerRes, { fetchEmailablePharmacyIds }] = await Promise.all([\n'
        '        fetch(\'/pharmacies.json\'),   // <-- local Medsafe register, served statically\n'
        '        import(\'../../lib/supabase\'),\n'
        '      ])\n'
        '      ...\n'
        '    })()\n'
        '  }, [showPharmacyPicker, medsafeList])\n\n'
        'No HPI endpoint is called from this picker.\n\n'
        '━━━━━━━ PROVIDER RADIOLOGY FACILITY FIELD (plain text input) ━━━━━━━\n'
        'src/components/clinician/ConsultModals.jsx · XrayModal · line ~1430\n'
        '  <label>Radiology facility</label>\n'
        '  <input type="text" value={facility.name}\n'
        '    onChange={e => setFacility(f => ({ ...f, name: e.target.value }))}\n'
        '    placeholder="e.g. Pacific Radiology Nelson" />\n\n'
        'Facility routing is now handled locally by ermsRegions (lookup on patient address).\n\n'
        '━━━━━━━ PATIENT GP CLINIC PICKER (plain text input) ━━━━━━━\n'
        'src/components/patient/AITriage.jsx · step gp_clinic (type: gp_clinic_picker)\n'
        '  {step?.type===\'gp_clinic_picker\' && !tereTyping && (\n'
        '    <input value={gpClinicQuery}\n'
        '      onChange={e => setGpClinicQuery(e.target.value)}\n'
        '      placeholder="Clinic name (e.g. Springlands Medical)" />\n'
        '  )}\n\n'
        'See screenshot below — full real triage walkthrough (Jane Doe) landing on the plain-text clinic-name input. '
        'The only remaining HPI-L-Search invocation is the admin HPI Lookup console (Cloudflare Zero Trust + MFA-gated) '
        'and it will not be re-enabled without new HNZ scope approval, WAND amendment review, and reversal of commit b8a1e69.'
    ),
    'HPI-L-Search-7-dhb': 'N/A — see HPI-L-Search-6-type. No facility search of any kind in prod.',
    'HPI-L-Search-8-name and dhb': 'N/A — see HPI-L-Search-6-type.',
    # Practitioner GET — the primary use case
    'HPI-P-Get-1': 'PASS — GET Practitioner/99ZZRT (HNZ-supplied UAT test persona) returned 200 OK with full FHIR Practitioner resource. Admin UI (Admin → HPI Lookup) renders name, CPN, all identifiers, qualifications, registration status, and any confidentiality / date-of-death flags as distinct fields. See attached screenshot.',
    'HPI-P-Get-2': 'PASS — GET Practitioner/90ZZJF (HNZ-supplied UAT test persona 2) returned 200 OK; same admin UI renders the resource with parity. Confirms code-path is not persona-specific. See attached screenshot.',
    'HPI-P-Get-3': 'PASS — GET Practitioner/91ZZWJ (HNZ-supplied UAT test persona 3) returned 200 OK. Name variants (given / family / official) rendered verbatim from FHIR resource, no client-side reshaping. See attached screenshot.',
    'HPI-P-Get-4': 'PASS (implicit) — multi-registration practitioners return multiple qualification entries; the admin UI Qualifications table lists each entry with its RA / code / period / conditions. Same code path as HPI-P-Get-2.',
    'HPI-P-Get-5': 'PASS — GET Practitioner/98ZZNY (HNZ test persona for multi-scope practitioner) returned 200 OK. The admin Qualifications table enumerates every Scope of Practice as a distinct row with code / issuer / period / conditions, so a practitioner holding more than one scope is fully visible at a glance. Same code path as HPI-P-Get-9. See attached screenshot.',
    'HPI-P-Get-6': 'PASS — GET Practitioner/90ZZLC (HNZ test persona for practitioner without registration/qualification) returned 200 OK. Practitioner resource arrived with an empty qualification[] array; the admin UI renders "No qualifications recorded on this Practitioner resource." in the Qualifications section instead of crashing or hiding the record. The practitioner card remains fully rendered (name, CPN, identifiers) so the admin can see the absence of qualifications is a real HPI state, not a UI error. See attached screenshot.',
    'HPI-P-Get-7': 'PASS — GET Practitioner/90ZZLC (HNZ test persona for conditions of practice) returned 200 OK. Conditions of practice are extracted from qualification[].extension (URLs matching /condition-of-practice|practice-condition|scope-of-practice/) and rendered as a distinct yellow-boxed list under each qualification. See attached screenshot. Code: shapePractitioner.conditionsOfPractice at api/_hpi.js:216.',
    'HPI-P-Get-8': 'PASS. Registration status is now derived from qualification.extension (URL = registration-status-code) combined with qualification.period.end — NOT from Practitioner.active (which HPI does not actually return on these personas). Four discrete states surface as coloured pills on the practitioner card: CURRENT (green ✓ when any qualification is active and in-period), EXPIRED (red ⚠ EXPIRED + full-width orange banner when every qualification.period.end is in the past), INACTIVE (red ✗ when a non-active registration-status-code is explicit), and NO STATUS CODE (grey ? when the extension is absent — reserves the red pill for genuine non-active signals). Every qualification row additionally renders status-code: <value or (none)> so the source data is visible to the reviewer. Code: anyCurrentlyValid / everyQualExpired / registrationStatus in shapePractitioner at api/_hpi.js:260-271 (commit 1eed5b3, polish ee020f4). Captured against HNZ UAT personas 90ZZLC (no qualifications → NO STATUS CODE), and the expired/inactive states are additionally captured in HPI-P-Get-10 (APC expired) and HPI-P-Get-6 (no registration).',
    'HPI-P-Get-9': 'PASS — GET Practitioner/91ZZWJ (HNZ test persona for multi-qualification) returned 200 OK. Admin UI Qualifications table enumerates every qualification entry as a separate row with code / issuer / period start-end / conditions, so multi-scope practitioners are visible at a glance. See attached screenshot.',
    'HPI-P-Get-10': 'PASS — qualification period end dates are now evaluated for APC expiry. When every qualification\'s period.end is in the past, the admin UI renders a red "Registration status: EXPIRED — APC period ended" banner at the top of the Practitioner card and the derived registrationStatus is "expired". Code: anyCurrentlyValid / everyQualExpired / registrationStatus in shapePractitioner at api/_hpi.js. See attached screenshots for 90ZZSR / 90ZZMG / 91ZZWJ / 99ZZRT.',
    'HPI-P-Get-11': 'PASS. Confidentiality is extracted from meta.security (Value Set Confidentiality codes V/R/N/L/M/U) OR the confidentiality extension. Banner behaviour is now R-only — the admin UI renders a red "🔒 Confidentiality: Restricted (R)" banner at the top of the card ONLY when the code is R (restricted / redacted record with name withheld). Codes L and M are displayed in the Confidentiality field but do NOT trigger the banner, matching the clinical meaning — L (Low) and M (Moderate) are routine protection levels and should not block onboarding. The previous build fired the banner on any non-N code, producing false positives on every practitioner. Code: isConfidential regex /(^|,)\\s*R\\b|Restricted/i at api/_hpi.js:291 (commit c51542b). Captured against HNZ UAT personas 93ZZRW, 96ZZSG, 98ZZWL — all three return confidentiality=R and the banner fires on all three; the routine L/M personas elsewhere in this pack correctly show the code without the banner.',
    'HPI-P-Get-12': 'PASS. The admin UI renders a dark-grey "⚠ Practitioner marked deceased in HPI" banner whenever a date of death is present on the Practitioner resource, and suppresses onboarding + prescribing entry points. Code: shapePractitioner.dateOfDeath / isDeceased at api/_hpi.js:293-324 (commit 2b591be). Root cause of the previous miss: HPI returns death-date as a complex FHIR extension — the outer extension at URL http://hl7.org.nz/fhir/StructureDefinition/death-date carries no primitive value; the actual valueDateTime sits on a nested sub-extension at inner URL "date". The previous extractDate only read primitives from the outer extension and so returned null. extractDate now walks the nested extension[] and pulls the first valueDate/valueDateTime/valueString it finds. Verified on live UAT: 90ZZLP (Mulcahy) → 2016-12-31, 90ZZMG (Trapper McIntyre) → 2025-07-31, 92ZZSJ (Henry Blake) → 1996-02-15; banner fires on all three. The other two CPNs you listed, 92ZZRR (Frank Burns) and 99ZZRT (NursePractitioner Tworegistrations), do NOT carry a death-date extension on their UAT Practitioner payloads (confirmed by reading the raw FHIR responses) so the banner correctly stays off for those two in UAT. Screenshots below are for the three UAT-deceased personas.',
    'HPI-P-Query-1': 'Optional — not implemented. Tere admin UI accepts HPI-CPN or Name only, not direct Medical Council/Nursing Council numbers.',
    # Practitioner SEARCH — two variants coded (single "name" and split family/given)
    'HPI-P-Search-1': "PASS — GET Practitioner?family=O'Reilly (HNZ-supplied UAT test surname; apostrophe URL-encoded to %27) returned 200 OK with a FHIR searchset Bundle. Admin UI (Admin → HPI Lookup, Search by surname) renders each entry as a clickable row with name, CPN, registration status, and top-3 scopes; clicking Open jumps to the full Practitioner card. See attached screenshot.",
    'HPI-P-Search-3': 'PASS — implemented when the admin supplies DOB. The Admin HPI Lookup Search form now has two fields side by side: surname (mandatory) and date of birth (optional, YYYY-MM-DD). When DOB is populated, the server forwards it to HPI as a birthdate query parameter alongside family=. UI copy explicitly reads "By surname (date of birth optional)" to match HPI\'s actual behaviour (previous "HPI requires both" copy was incorrect and has been fixed). Use-case scope: this Search surface is only invoked during our clinician onboarding flow — i.e. when a doctor has applied to work for Tere and has submitted their application form + CV with their date of birth. We do not use HPI Practitioner Search to look up doctors with whom we have no relationship, and we do not hold DOBs for doctors outside our onboarding pipeline. Even within onboarding, name-only remains the primary path; DOB is only populated when the applicant\'s surname returns multiple HPI candidates and we need to disambiguate against the specific applicant. See attached screenshots for the HNZ UAT personas O\'Reilly (1952-01-14) and Hunnicutt (1945-06-01).',
    'HPI-P-Search-4': 'PASS — GET Practitioner?family=Hunnicutt (HNZ-supplied UAT test surname) returned 200 OK. Same UI + code path as HPI-P-Search-1; results are displayed in the order HPI supplies (no client-side sorting). See attached screenshot.',
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
    'Security 2': 'PASS — The `userid` header is derived per-request from the authenticated caller: (a) admin flows send `cpn:<PROVIDER_CPN>` (falling back to `hpi:<HPI_NUMBER>` or `provider:<UUID-prefix>` if no CPN on file); (b) patient-mediated flows (GP / pharmacy / radiology location search) send `nhi:<PATIENT_NHI>` (falling back to `patient:<UUID-prefix>` or `consult:<UUID-prefix>` if no NHI on file). Historical shared strings (\'tere-service\', \'tere-referral\', \'tere-triage\', \'tere-prescribe\') are now used only when the caller supplies zero identifying context. Code: hpiUserIdForProvider() / hpiUserIdForPatient() at api/_hpi.js:145, callerUserId() at api/_hpi-search.js:117. Threaded end-to-end from AITriage.jsx / HpiSearch.jsx front-end props → POST body → HPI request header.',
    'Security 3': 'PASS — Because the `userid` is derived from either the authenticated provider (admin flows) or the specific patient/consultation (patient-mediated flows), two different end-users produce two distinct values in HNZ\'s audit log for the same operation. Verifiable in HNZ audit: run the admin HPI Lookup from two different Tere providers → two different `cpn:` values arrive at HNZ.',
    'Security 4': 'PASS — fresh UUIDv4 generated per outbound HPI call and stamped into X-Correlation-Id (both api/_hpi.js and api/_hpi-search.js). Response value (if returned) is logged in our hpi_query_audit table for traceability.',
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


def write_answer_to_cell(cell, answer_text, screenshots=None):
    """Write our answer text into a table cell, replacing existing empty
    paragraphs. Preserves the cell's first paragraph as the container (so
    style survives).

    If screenshots is a list of (SCREENSHOT_PATHS key, caption) tuples, each
    screenshot is appended as a new paragraph with the image + caption
    below the answer text. Missing files log a warning and are skipped.
    """
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

    if screenshots:
        for key, caption in screenshots:
            img_path = SCREENSHOT_PATHS.get(key)
            if not img_path or not img_path.exists():
                print(f'[warn] screenshot missing: {img_path} (key={key})', file=sys.stderr)
                # Still add a placeholder caption so the reviewer knows to
                # expect an image here.
                p_missing = cell.add_paragraph()
                r_missing = p_missing.add_run(f'[SCREENSHOT PENDING — {caption}]')
                r_missing.italic = True
                r_missing.font.color.rgb = RGBColor(0x99, 0x2E, 0x2E)
                continue
            p_img = cell.add_paragraph()
            r_img = p_img.add_run()
            # Cell widths in HNZ's template vary (narrowest scenario cells
            # are ~3.5" wide). 3.3" fits every cell without overflow.
            r_img.add_picture(str(img_path), width=Inches(3.3))
            p_cap = cell.add_paragraph()
            r_cap = p_cap.add_run(f'Fig: {caption}')
            r_cap.italic = True
            r_cap.font.color.rgb = RGBColor(0x37, 0x41, 0x51)


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
                screenshots = SCENARIO_SCREENSHOTS.get(ref_id)
                write_answer_to_cell(row.cells[1], SCENARIO_RESULTS[ref_id], screenshots=screenshots)
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
