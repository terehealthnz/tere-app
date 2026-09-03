// scripts/build-patient-protections-pdf.mjs
//
// Full-color review PDF of every patient protection Tere Health has shipped,
// split into PREEMPTIVE (stops harm before it happens) and AUDIT (detects,
// records, or reviews after the fact) — with each control tagged with the
// specific NZ regulator / Act / standard it satisfies (MCNZ, NCNZ, HDC,
// HQSC, HISO, HNZ, Medsafe, ACC, Privacy Commissioner, Coroner Act,
// Protected Disclosures Act 2022, ISO 27001, HIPAA BAA, etc.).
//
// Usage:
//   node scripts/build-patient-protections-pdf.mjs
//   → ~/Downloads/Tere_Health_Patient_Protections_Review.pdf

import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const OUT_PATH = path.join(os.homedir(), 'Downloads', 'Tere_Health_Patient_Protections_Review.pdf')

// -- Regulator catalogue -----------------------------------------------------
// Colour-coded so a reader can eyeball at a glance which body a given
// control is satisfying. Each org has a short blurb explaining the legal
// basis or standard reference.
const ORGS = {
  MCNZ:      { name: 'Medical Council of NZ',                   colour: '#0B6E76', basis: 'HPCA Act 2003 — scope, APC, supervision, competence' },
  NCNZ:      { name: 'Nursing Council of NZ',                   colour: '#0B6E76', basis: 'HPCA Act 2003 — nursing scope, APC, competence' },
  HDC:       { name: 'Health & Disability Commissioner',        colour: '#0D2B45', basis: 'Code of Health & Disability Services Consumers’ Rights 1996' },
  HQSC:      { name: 'Health Quality & Safety Commission',      colour: '#7C3AED', basis: 'SAC coding, adverse event notification, RCA cadence' },
  HNZ:       { name: 'Te Whatu Ora / Health NZ',                colour: '#DC2626', basis: 'NHI, HPI, MWS, NZePS APIs + FHIR compliance' },
  HISO:      { name: 'HISO Standards',                          colour: '#B45309', basis: 'HISO 10029 Health Information Security + 10046 Consumer Health Info' },
  Medsafe:   { name: 'Medsafe',                                 colour: '#059669', basis: 'Medicines Act 1981; Misuse of Drugs Regulations 1977; controlled drugs register' },
  ACC:       { name: 'Accident Compensation Corporation',       colour: '#0369A1', basis: 'ACC provider vetting, claim audit, evidence retention' },
  PRIV:      { name: 'Privacy Commissioner',                    colour: '#BE185D', basis: 'Privacy Act 2020 + Health Information Privacy Code (HIPC) 2020' },
  CORONER:   { name: 'Coronial Services of NZ',                 colour: '#374151', basis: 'Coroners Act 2006, Section 15 reportable deaths' },
  PDA:       { name: 'Protected Disclosures',                   colour: '#4B5563', basis: 'Protected Disclosures (Protection of Whistleblowers) Act 2022' },
  ISO27001:  { name: 'ISO/IEC 27001:2022',                      colour: '#1E40AF', basis: 'Access control, vendor mgmt, change mgmt, secure development' },
  HIPAA:     { name: 'HIPAA / BAA',                             colour: '#0891B2', basis: 'US patient surface (terecare.com) + BAA-covered subprocessors' },
  NEAC:      { name: 'NEAC 2019 Ethical Standards',             colour: '#7E22CE', basis: 'National Ethical Advisory Committee — observational research ethics' },
  HDEC:      { name: 'Health & Disability Ethics Committee',    colour: '#7E22CE', basis: 'HDEC review + Out-of-Scope determinations' },
  CARM:      { name: 'CARM (Adverse Reactions)',                colour: '#EA580C', basis: 'Centre for Adverse Reactions Monitoring — pharmacovigilance' },
  MOH:       { name: 'Ministry of Health',                      colour: '#DC2626', basis: 'Notification of new telehealth service; regulatory oversight' },
  HPCA:      { name: 'HPCA Act 2003',                           colour: '#0B6E76', basis: 'Health Practitioners Competence Assurance Act — scope of practice' },
  CoR:       { name: 'HDC Code of Rights',                      colour: '#0D2B45', basis: 'Direct citation of a specific Right (1–10) in the Code' },
}

// -- Controls ----------------------------------------------------------------
// Each control notes its type, plain-English purpose, tags, and evidence
// pointers (file path or task ID). Kept concise: this doc is a REVIEW, not
// an implementation guide.
const CONTROLS = [
  // ================ PREEMPTIVE — Identity & Provider Vetting ================
  { cat: 'preemptive', section: 'Identity & Provider Vetting',
    title: 'MCNZ registration + supervision plan enforcement',
    what: 'Every prescribing provider linked to a named MCNZ supervisor. Availability, prescribing, and countersign flows all gate on supervision status; supervised providers cannot draft prescriptions without an active supervisor session.',
    orgs: ['MCNZ', 'HPCA'], evidence: 'tasks #137–139; supervision plan PDF generator' },
  { cat: 'preemptive', section: 'Identity & Provider Vetting',
    title: 'Nursing Council of NZ (NCNZ) fields + APC expiry tracked',
    what: '`providers.nursing_council_number`, `ncnz_apc_expiry`, `ncnz_scope` columns; nightly compliance-expiry cron flags APCs approaching 30-day expiry, escalates to 7-day critical.',
    orgs: ['NCNZ', 'HPCA'], evidence: 'supabase/2026-09-03_governance_extensions.sql; api/_cron-compliance-expiry.js' },
  { cat: 'preemptive', section: 'Identity & Provider Vetting',
    title: 'HPI Practitioner verification during onboarding',
    what: 'Every new clinician is verified against the Health Provider Index (HPI FHIR API) — Get Practitioner + Search Practitioner + Get Facility — before roster admission. Compliance evidence pack IN-3502 filed with HNZ 2026-08-13.',
    orgs: ['HNZ', 'MCNZ', 'NCNZ'], evidence: 'api/_hpi.js; compliance ticket IN-3502' },
  { cat: 'preemptive', section: 'Identity & Provider Vetting',
    title: 'Provider MFA (TOTP) — required on all provider logins',
    what: 'Full TOTP flow with QR enrolment, backup codes, and admin-side MFA-disable audit. Blocks credential-stuffing + phishing pivots into the queue.',
    orgs: ['ISO27001', 'PRIV', 'HISO'], evidence: 'task #232; api/_provider-mfa.js' },
  { cat: 'preemptive', section: 'Identity & Provider Vetting',
    title: 'Provider onboarding gate (patient_access_from + practice mode)',
    what: 'Newly onboarded providers default to practice mode with no PHI access. Admin unlocks patient access with an explicit `patient_access_from` timestamp; unlock triggers a notification email trail.',
    orgs: ['ISO27001', 'MCNZ', 'PRIV'], evidence: 'task #290' },
  { cat: 'preemptive', section: 'Identity & Provider Vetting',
    title: 'Conflict of Interest Register — quarterly review',
    what: 'Providers declare external roles, ownership stakes, directorships, gifts, research funding. Admin surfaces 100-day-overdue banner in the Compliance tab. Feeds MCNZ good-practice + ISO 27001 A.15.',
    orgs: ['MCNZ', 'ISO27001'], evidence: 'task #410; ConflictOfInterestPanel.jsx' },
  { cat: 'preemptive', section: 'Identity & Provider Vetting',
    title: 'Annual PHI training attestation',
    what: 'Each provider must attest to annual PHI training. Nightly cron sends a 30-day-out reminder digest. Attestation date persisted on providers row.',
    orgs: ['HISO', 'ISO27001', 'PRIV'], evidence: 'task #384; api/_cron-compliance-expiry.js' },
  { cat: 'preemptive', section: 'Identity & Provider Vetting',
    title: 'Annual cultural safety training attestation',
    what: 'Right 1(3) cultural safety is tracked as an annual attestation on the provider record, with reminder digest 30 days out. Documented in ethics policy v1.0.',
    orgs: ['CoR', 'HDC', 'MCNZ'], evidence: 'task #400; HDC Right 1(3)' },

  // ================ PREEMPTIVE — Access Control ================
  { cat: 'preemptive', section: 'Access Control',
    title: 'Server-mediated PHI access (RLS + allowlisted API routes)',
    what: 'All PHI tables (patients, consultations, prescriptions, providers, validation_readings, spo2_calibrations, radiology_reports, HL7 messages, ACC claims, appointments, bookings, push_subscriptions, chat) are anon-SELECT-revoked. Every read/write flows through a server-side allowlisted route with x-provider-id + session validation.',
    orgs: ['HISO', 'PRIV', 'ISO27001'], evidence: '6-sub-migration server-mediation refactor 2026-07-06; tasks #63–90' },
  { cat: 'preemptive', section: 'Access Control',
    title: 'Break-glass gate on off-queue chart access',
    what: 'Chart access is blocked (HTTP 428 requires_break_glass) unless the consult is in an active queue state OR the caller is the assigned provider OR a recent (60-min) break-glass audit entry exists. Provider must select a reason + write ≥ 20 chars of justification.',
    orgs: ['CoR', 'HDC', 'PRIV', 'HISO'], evidence: 'task #414; api/_consult-break-glass.js' },
  { cat: 'preemptive', section: 'Access Control',
    title: 'PhiRevealGate — reason-for-access on admin PHI views',
    what: 'Admin surfaces show metadata by default; full clinical notes require a click-through with a reason-for-access prompt that gets audit-logged. Billing_admin sub-role has zero access to clinical notes.',
    orgs: ['PRIV', 'HISO', 'ISO27001'], evidence: 'tasks #117–119' },
  { cat: 'preemptive', section: 'Access Control',
    title: 'Just-in-time (JIT) elevation for high-sensitivity exports',
    what: 'ACC audit bundles, patient record exports, and the controlled drugs register require a fresh elevation grant (with justification) before the endpoint will fire. Elevation lasts 15 minutes.',
    orgs: ['ACC', 'Medsafe', 'PRIV'], evidence: 'task #377' },
  { cat: 'preemptive', section: 'Access Control',
    title: 'Off-hours re-authentication (22:00–06:00 NZT)',
    what: 'Elevations initiated outside business hours require fresh MFA re-auth even for authenticated providers. Deters credential-hijack access at low-oversight times.',
    orgs: ['ISO27001', 'PRIV'], evidence: 'task #378' },
  { cat: 'preemptive', section: 'Access Control',
    title: 'Per-provider daily PHI-access budget',
    what: 'Warns at 80% of the daily record-access budget; blocks at 100%. Suppresses runaway browsing (mass exfiltration signature) at the individual account layer.',
    orgs: ['PRIV', 'ISO27001'], evidence: 'task #376' },
  { cat: 'preemptive', section: 'Access Control',
    title: 'Session idle timeout + PHI-surface re-auth',
    what: 'Provider sessions expire on inactivity; PHI-heavy surfaces prompt a re-auth even inside a live session if idle threshold is crossed.',
    orgs: ['HISO', 'ISO27001', 'PRIV'], evidence: 'task #291' },
  { cat: 'preemptive', section: 'Access Control',
    title: 'Row-level lockout: one open consult per patient',
    what: 'Migration-enforced constraint prevents duplicate open consults, closing a race window where two providers could concurrently review + prescribe for the same patient.',
    orgs: ['HDC', 'MCNZ'], evidence: 'task #179' },

  // ================ PREEMPTIVE — Data Minimisation & Encryption ================
  { cat: 'preemptive', section: 'Data Minimisation & Encryption',
    title: 'NHI + name masking by default in admin views',
    what: 'Admin lists render masked NHI and initials-only names; full identity requires click-through gate + audit-log entry. Reduces "shoulder surf" + screen-share leakage.',
    orgs: ['PRIV', 'HISO'], evidence: 'task #374' },
  { cat: 'preemptive', section: 'Data Minimisation & Encryption',
    title: 'Column-level pgcrypto encryption on highest-sensitivity PHI',
    what: 'Most sensitive ACC/clinical fields encrypted at the column level via pgcrypto — a Supabase RLS bypass alone does not surface plaintext without the app-side key.',
    orgs: ['HISO', 'PRIV', 'ISO27001', 'ACC'], evidence: 'tasks #296, #381' },
  { cat: 'preemptive', section: 'Data Minimisation & Encryption',
    title: 'PDF watermarking with exporter + timestamp',
    what: 'Every PDF Tere exports (ACC bundles, prescriptions, referrals, patient records) carries a diagonal watermark naming the exporting provider + export timestamp. Leaks trace back to the account of origin.',
    orgs: ['PRIV', 'HISO'], evidence: 'task #375; api/_pdf-builders.js drawWatermark()' },
  { cat: 'preemptive', section: 'Data Minimisation & Encryption',
    title: 'Sydney (ap-southeast-2) hosting + BAA-covered subprocessors',
    what: 'Vercel serverless + Supabase both pinned to ap-southeast-2. All AI runs via AWS Bedrock Sydney (BAA-covered); outbound email via AWS SES Sydney (BAA-covered). No Anthropic direct API key on production.',
    orgs: ['HIPAA', 'PRIV', 'HISO'], evidence: 'Bedrock cutover 2026-07-08; SES cutover 2026-08-29' },
  { cat: 'preemptive', section: 'Data Minimisation & Encryption',
    title: 'Private storage buckets + signed-URL resolver',
    what: 'CVs and patient-uploaded documents live in private Supabase buckets; access served via short-lived signed URLs generated per-request. Anonymous URL sharing does not leak files.',
    orgs: ['PRIV', 'HISO'], evidence: 'task #322' },
  { cat: 'preemptive', section: 'Data Minimisation & Encryption',
    title: 'Geo-blocking of high-value exports from non-NZ IPs',
    what: 'ACC audit bundles + patient record exports are refused when the request originates outside NZ. Adds friction to overseas credential-theft workflows.',
    orgs: ['ACC', 'PRIV', 'HISO'], evidence: 'task #380' },
  { cat: 'preemptive', section: 'Data Minimisation & Encryption',
    title: 'SSRF-hardened image + signature fetch',
    what: 'PDF builders reject non-HTTPS + private-network + AWS-metadata addresses on any URL fetched during PDF generation (e.g. provider signatures). Blocks a stored-URL vector for cloud metadata theft.',
    orgs: ['ISO27001'], evidence: 'api/_pdf-builders.js isSafeSignatureUrl()' },

  // ================ PREEMPTIVE — Consent ================
  { cat: 'preemptive', section: 'Consent',
    title: 'HDC Code of Rights consent gates (bilingual)',
    what: 'Explicit consent gates for Rights 6 (information), 7 (informed choice), 9 (research). Bilingual (English + Te Reo + Samoan + more) — Right 5(4) interpreter option surfaced in triage. Rights 5(2) accessibility mode (large-text/high-contrast) available on triage.',
    orgs: ['HDC', 'CoR'], evidence: 'tasks #124, #395–399' },
  { cat: 'preemptive', section: 'Consent',
    title: 'Prescribing consent + prescribing controls',
    what: 'Patient acknowledges prescribing risks + DG signature-exempt statement before any prescription is drafted. Controlled-drug classifications checked against the register before send.',
    orgs: ['Medsafe', 'MCNZ'], evidence: 'tasks #194–199' },
  { cat: 'preemptive', section: 'Consent',
    title: 'Research consent + revocation',
    what: 'VitalsValidate opt-in gated by NEAC 2019 + HDEC Out-of-Scope letter; patient can revoke research consent from their portal at any time, with revocation propagating to future exports.',
    orgs: ['NEAC', 'HDEC', 'CoR'], evidence: 'tasks #207–211, #399' },
  { cat: 'preemptive', section: 'Consent',
    title: 'IPP12 offshore-disclosure notice on triage + privacy statement',
    what: 'IPP12 (transfer overseas) notice is surfaced on triage entry and in the privacy statement, naming AWS Sydney (Bedrock + SES) as offshore processors under BAA.',
    orgs: ['PRIV'], evidence: 'task #365' },
  { cat: 'preemptive', section: 'Consent',
    title: 'Per-disclosure consent snapshot on outbound HL7 / GP / HPI',
    what: 'Every outbound clinical transmission (Medical-Objects HL7, GP letter, HPI query) captures a consent snapshot at the moment of send, immutable in the audit trail.',
    orgs: ['PRIV', 'HISO', 'HNZ'], evidence: 'task #351' },
  { cat: 'preemptive', section: 'Consent',
    title: 'Explicit ACC consent checkbox on conversion',
    what: 'ConvertToAccModal requires the provider to tick a specific "patient consented to ACC claim" checkbox — no more implied consent on ACC pathway.',
    orgs: ['ACC', 'PRIV', 'CoR'], evidence: 'task #338' },
  { cat: 'preemptive', section: 'Consent',
    title: 'HDC Right 8: support person prompt at video-consult start',
    what: 'Provider is prompted before call-start to check whether the patient wants a support person present; flag persists on the consultation record.',
    orgs: ['CoR', 'HDC'], evidence: 'tasks #362, #398' },
  { cat: 'preemptive', section: 'Consent',
    title: 'HDC Right 7(2) capacity-to-consent screening in triage',
    what: 'Triage flow screens for capacity-to-consent concerns and routes to a support pathway when triggered.',
    orgs: ['CoR', 'HDC'], evidence: 'task #397' },

  // ================ PREEMPTIVE — Clinical Safety ================
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'WAND-certified vitals scope',
    what: 'Only HR + SpO2 + RR are surfaced clinically (WAND cert 260729-WAND-786DQ9). Any scope broadening (BP, paeds, other vitals) triggers a WAND change-notify flow before release.',
    orgs: ['MOH', 'HISO'], evidence: 'docs/regulatory/2026-08-13_WAND_260729-WAND-786DQ9_Tere_Vitals_active.pdf; task #260' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'Practice-mode default for new providers',
    what: 'New provider accounts start in practice mode — sandbox training checklist must be completed + admin approval given before real PHI ever surfaces.',
    orgs: ['MCNZ', 'NCNZ'], evidence: 'tasks #290, #327' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'Controlled drugs register view + DG signature-exempt logic',
    what: 'Real-time Medsafe-audit-ready register of controlled prescribing; PDF builder applies signature-exempt branch only when classification permits.',
    orgs: ['Medsafe'], evidence: 'tasks #196–199, #352' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'Structured allergies / meds / conditions (not free text)',
    what: 'Patient allergies, current medications, and past conditions are structured tables (not blob text) — allergies match against draft prescriptions before send, closing a common med-error vector.',
    orgs: ['MCNZ', 'HDC'], evidence: 'task #223' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'System-enforced triage divert list (must-in-person presentations)',
    what: 'Keyword-driven divert detection on every chat message (AITriage). 24 hardcoded phrases covering 8 divert categories — paediatric fever <3mo, sudden severe localised pain, head injury with features, pregnancy complications, suspected fractures, thunderclap headache / new confusion, self-harm ideation, new neuro symptoms. Match = amber divert screen (in-person needed, NOT 111) with urgent-care + GP links + "if worsening → 111". Second-tier YES/NO version also on the legacy /triage/:id page as a fallback.',
    orgs: ['CoR', 'HDC', 'MCNZ'], evidence: 'tasks #416 + #430; AITriage.jsx DIVERT_KEYWORDS + src/lib/triageSafetyGates.js' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'Safety-netting as gated field at consult close',
    what: 'Mandatory structured return-advice (min 40 chars) at consult finalise. Template picker (8 common presentations: viral URI, cellulitis, UTI, MSK, gastro, back pain, mental health, generic) that provider edits. Blocks finalise. HDC Right 6 evidence.',
    orgs: ['CoR', 'HDC'], evidence: 'task #417; src/lib/safetyNettingTemplates.js' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'Results follow-up loop (ordered → received → reviewed → actioned)',
    what: 'Every ordered investigation tracked as a first-class state machine with named reviewer + SLA. Auto-populated from radiology_referrals; HL7 receive marks received. Manual add path for labs. Load-bearing control per HDC + coronial telehealth findings.',
    orgs: ['HDC', 'MCNZ', 'CORONER', 'HQSC'], evidence: 'task #418; investigation_orders table + api/_investigation-orders.js' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'Emergency escalation with current-location capture',
    what: 'Every 111/divert fire in the AI chat flow (AITriage) attempts browser geolocation (3s timeout, best-effort) and POSTs to /api/emergency-escalations with escalation_type + matched_flags + lat/lng (or decline reason). 111 dispatch can be directed to the patient CURRENT location, not registered address. Verified end-to-end on prod 2026-09-03.',
    orgs: ['CoR', 'HDC'], evidence: 'tasks #420 + #430; emergency_escalations table + AITriage.jsx logEscalation()' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'GP-handover / continuity guarantee at close',
    what: 'Every consult must record disposition (gp_letter_sent / to_send / handover / closed_no_followup / patient_no_gp_told_to_enrol / declined). Handoff dispositions require "patient was informed" tick. Blocks finalise. HDC Right 4(4).',
    orgs: ['CoR', 'HDC', 'MCNZ'], evidence: 'task #421; continuity_* columns' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'Prescribing safety guards (early-refill + doctor-shopping)',
    what: 'Server-side checkPrescribingSafety runs before every prescribe. Blocks same-drug refill within class-specific windows (controlled A/B 30d, benzo/opioid 14d, antibiotic 3d, regular Rx warn-only). Detects 3+ providers for same drug in 90d. Provider override requires ≥20-char reason (audit-logged).',
    orgs: ['Medsafe', 'MCNZ', 'HDC'], evidence: 'task #423; api/_prescribing-safety.js' },
  { cat: 'preemptive', section: 'Clinical Safety',
    title: 'Patient identity verification at consult start',
    what: 'Provider attests per consult that the on-camera person is the NHI holder. Options: photo ID sighted (DL/passport/18+), knowledge-based (NHI+DOB+address), repeat patient, carer vouches; or three unverified variants. Prevents wrong-patient records + NHI-borrow prescribing fraud.',
    orgs: ['PRIV', 'MCNZ', 'HDC'], evidence: 'task #426; IdVerificationPanel.jsx' },

  // ================ PREEMPTIVE — Third-Party & Vendor ================
  { cat: 'preemptive', section: 'Third-Party & Vendor',
    title: 'AWS Bedrock BAA — all clinical AI',
    what: 'All 5 clinical AI endpoints (triage, red-flag, note synth, transcript summary, subtitles) run via AWS Bedrock Sydney under BAA. ANTHROPIC_API_KEY is REMOVED from production.',
    orgs: ['HIPAA', 'HISO', 'PRIV'], evidence: 'project-tere-bedrock (memory); cutover 2026-07-08' },
  { cat: 'preemptive', section: 'Third-Party & Vendor',
    title: 'AWS SES BAA — all outbound email',
    what: 'Prescription PDFs, referrals, applicant comms, all system mail route via AWS SES Sydney under BAA. Resend kept 1 week as fallback then decommissioned.',
    orgs: ['HIPAA', 'PRIV'], evidence: 'project-tere-ses-cutover (memory); 2026-08-29' },
  { cat: 'preemptive', section: 'Third-Party & Vendor',
    title: 'Vendor Management Policy (Tier 1/2/3)',
    what: 'Formal vendor register with Tier 1/2/3 assessment framework — every subprocessor scored on health-data exposure, jurisdiction, and BAA coverage. Feeds ISO 27001 A.15.',
    orgs: ['ISO27001', 'PRIV'], evidence: 'docs/regulatory/vendor-management-policy.md; task #406' },
  { cat: 'preemptive', section: 'Third-Party & Vendor',
    title: 'HealthLink EDI onboarding + Medical-Objects HL7 receive',
    what: 'Standards-based interop for inbound reports (Capricorn Cloud HL7 v2 receive with client cert) — avoids ad-hoc email or fax that break provenance.',
    orgs: ['HISO', 'HNZ'], evidence: 'project-tere-medical-objects (memory); tasks #249, #266' },

  // ================ PREEMPTIVE — Physical / Devices ================
  { cat: 'preemptive', section: 'Physical / Devices',
    title: 'BYOD Policy — minimum device baseline + loss reporting',
    what: 'Any personal device with PHI must meet the baseline (FDE, screen lock, up-to-date OS, no shared account); attestation on file; loss must be reported < 4 hours.',
    orgs: ['ISO27001', 'HISO', 'PRIV'], evidence: 'docs/regulatory/byod-policy.md; task #409' },

  // ================ AUDIT — Access Logs & Trails ================
  { cat: 'audit', section: 'Access Logs & Trails',
    title: 'audit_logs table on every PHI access',
    what: 'Every provider chart-open, admin view, PDF export, HL7 send, HPI query, ACC bundle, break-glass grant, MFA disable is logged with provider ID, IP, user-agent, reason, resource ID.',
    orgs: ['PRIV', 'HISO', 'ISO27001'], evidence: 'api/_audit.js; tasks #340, #414' },
  { cat: 'audit', section: 'Access Logs & Trails',
    title: 'Patient-facing "who saw my data" view (Right 6(f))',
    what: 'Patients can view a live log of every provider who accessed their record, when, and (where applicable) why. Directly implements Code Right 6(f).',
    orgs: ['CoR', 'HDC', 'PRIV'], evidence: 'task #350; PatientAccessHistoryModal.jsx' },
  { cat: 'audit', section: 'Access Logs & Trails',
    title: 'Per-patient access-history modal on provider chart',
    what: 'Any provider viewing a chart can pull up the full access history for that patient in one click — supports peer review + patient enquiry response.',
    orgs: ['HDC', 'PRIV'], evidence: 'tasks #342, #343' },
  { cat: 'audit', section: 'Access Logs & Trails',
    title: 'AuditLogPanel with provider + NHI filters',
    what: 'Admin surface for auditing PHI access across the org, filterable by provider or by patient NHI, with 90-day retention window enforced by cron.',
    orgs: ['PRIV', 'ISO27001'], evidence: 'task #341' },
  { cat: 'audit', section: 'Access Logs & Trails',
    title: 'HPI query audit + rate-limit view',
    what: 'Every HPI Practitioner / Facility lookup is logged; per-provider rate limit prevents scraping the HPI directory.',
    orgs: ['HNZ', 'ISO27001'], evidence: 'tasks #388, #389' },
  { cat: 'audit', section: 'Access Logs & Trails',
    title: 'HL7 message audit — consolidated inbound timeline',
    what: 'All inbound HL7 v2 messages from Medical-Objects surface in a single admin timeline with match-status + patient-link visibility.',
    orgs: ['HISO', 'HNZ'], evidence: 'task #390' },

  // ================ AUDIT — Anomaly & Break-in Detection ================
  { cat: 'audit', section: 'Anomaly & Break-in Detection',
    title: 'Nightly audit_log anomaly cron',
    what: 'Statistical scan of the previous 24h against per-provider baselines — flags outlier chart-open volume, out-of-hours activity, unusual patient breadth.',
    orgs: ['PRIV', 'ISO27001'], evidence: 'task #292' },
  { cat: 'audit', section: 'Anomaly & Break-in Detection',
    title: 'ACC-specific anomaly detection',
    what: 'Second cron dedicated to ACC bundles — flags export bursts, cross-provider claim access, unusual jurisdictions.',
    orgs: ['ACC', 'PRIV'], evidence: 'task #379' },
  { cat: 'audit', section: 'Anomaly & Break-in Detection',
    title: 'Failed-auth brute-force alerting',
    what: 'Failed provider login attempts trigger a security_events row; repeated failures escalate to immediate admin email + SMS.',
    orgs: ['ISO27001', 'PRIV'], evidence: 'task #293' },
  { cat: 'audit', section: 'Anomaly & Break-in Detection',
    title: 'Real-time break-in alerting (security_events)',
    what: 'Any high-severity security event fires immediate admin email + SMS via SES + SNS, not just a database write.',
    orgs: ['PRIV', 'HISO'], evidence: 'task #359' },
  { cat: 'audit', section: 'Anomaly & Break-in Detection',
    title: 'Nightly compliance-expiry digest cron',
    what: 'One consolidated 08:30 NZT email covering PHI training expiry, cultural safety expiry, NCNZ APC expiry (30-day + 7-day critical), MCNZ APC expiry, and COI declarations > 100 days without review. Silent when nothing actionable.',
    orgs: ['MCNZ', 'NCNZ', 'HDC', 'CoR', 'ISO27001'], evidence: 'task #413; api/_cron-compliance-expiry.js' },
  { cat: 'audit', section: 'Anomaly & Break-in Detection',
    title: 'Nightly results-reconciliation cron',
    what: 'Scans investigation_orders for three failure modes: orders past SLA with no result; results received but not reviewed >48h; abnormal-reviewed unactioned >24h (auto-escalated with security_events row). Silent when clean.',
    orgs: ['HDC', 'MCNZ', 'CORONER'], evidence: 'task #418; api/_cron-results-reconciliation.js' },
  { cat: 'audit', section: 'Anomaly & Break-in Detection',
    title: 'Nightly clinical anomaly cron (re-presentation + abandonment)',
    what: 'Detects re-presentation within 72h with similar chief complaint (missed-diagnosis warning); discharged-then-deteriorated (escalation within 7d of close); red-flag/divert abandonment (unresolved escalation with no consult completion after 2h). Silent when clean.',
    orgs: ['HDC', 'HQSC', 'MCNZ'], evidence: 'tasks #422, #425; api/_cron-clinical-anomalies.js' },
  { cat: 'audit', section: 'Anomaly & Break-in Detection',
    title: 'Emergency escalation outcome tracking',
    what: 'Admin panel records outcome for every 111/ED/UC divert (attended ED, seen by GP, refused care, unable to contact, etc.). Without outcome tracking, the "prove your red-flag system works" question has no answer.',
    orgs: ['HDC', 'CoR', 'HQSC'], evidence: 'task #420; EmergencyEscalationsPanel.jsx' },
  { cat: 'audit', section: 'Anomaly & Break-in Detection',
    title: 'Patient-level prescribing surveillance',
    what: 'Cross-provider aggregated view surfaces doctor-shopping + polypharmacy signatures (3+ providers for same drug, cumulative controlled qty). Filter by controlled / benzo-opioid / all + window. JIT elevation required.',
    orgs: ['Medsafe', 'HDC', 'PRIV'], evidence: 'task #424; api/_prescribing-surveillance.js' },

  // ================ AUDIT — Complaints & Adverse Events ================
  { cat: 'audit', section: 'Complaints & Adverse Events',
    title: 'HDC Right 10 complaint workflow — 20-day timeline',
    what: 'Structured complaint intake with an enforced 20-working-day acknowledgement + response clock, escalation triggers, and auto-reference to the HDC Advocacy Service in complaint responses.',
    orgs: ['CoR', 'HDC'], evidence: 'tasks #361, #392' },
  { cat: 'audit', section: 'Complaints & Adverse Events',
    title: 'Complaint themes dashboard (anonymised aggregation)',
    what: 'Aggregate view of complaint themes for internal learning — supports HDC Advisory 5-year auto-publish of sanitised summaries.',
    orgs: ['HDC'], evidence: 'tasks #368, #393' },
  { cat: 'audit', section: 'Complaints & Adverse Events',
    title: 'HDC adverse event vs complaint routing distinction',
    what: 'UI-level distinction between "complaint" and "adverse event" — routes adverse events into the HQSC pathway automatically instead of pooling them with complaints.',
    orgs: ['HDC', 'HQSC'], evidence: 'task #394' },
  { cat: 'audit', section: 'Complaints & Adverse Events',
    title: 'HQSC SAC severity coding on incidents',
    what: 'incidents.sac_severity CHECK constraint (SAC1/SAC2/SAC3/SAC4) + hqsc_notified_at + hqsc_reference; SAC1/SAC2 must be notified to HQSC within 15 working days per SSA SOP.',
    orgs: ['HQSC'], evidence: 'task #411; docs/regulatory/hqsc-ssa-reporting-sop.md' },
  { cat: 'audit', section: 'Complaints & Adverse Events',
    title: 'CARM adverse reactions reporting SOP',
    what: 'Standing procedure for reporting adverse medicine reactions to the Centre for Adverse Reactions Monitoring; captured against the prescription record.',
    orgs: ['CARM', 'Medsafe'], evidence: 'docs/regulatory/carm-reporting-sop.md; task #355' },
  { cat: 'audit', section: 'Complaints & Adverse Events',
    title: 'Coroner death reporting SOP (Section 15 Coroners Act 2006)',
    what: 'Flow for any reportable death: preserve records, notify Coronial Services, engage MPS. Section 15 obligations documented + rehearsed.',
    orgs: ['CORONER'], evidence: 'docs/regulatory/coroner-death-reporting-sop.md; task #403' },
  { cat: 'audit', section: 'Complaints & Adverse Events',
    title: 'Standalone whistleblowing policy (Protected Disclosures Act 2022)',
    what: 'Distinct disclosure pathway for staff concerns — outside the normal manager chain, with statutory protections cited verbatim.',
    orgs: ['PDA'], evidence: 'docs/regulatory/whistleblowing-policy.md; task #404' },

  // ================ AUDIT — Records, Retention, Peer Review ================
  { cat: 'audit', section: 'Records, Retention & Peer Review',
    title: 'Records Management + Retention Policy',
    what: 'WHAT / HOW-LONG / WHERE matrix classifying every record type; ties back to the automated retention cron below.',
    orgs: ['HISO', 'PRIV'], evidence: 'docs/regulatory/records-management-policy.md; task #405' },
  { cat: 'audit', section: 'Records, Retention & Peer Review',
    title: 'HIPC Rule 9 retention/deletion cron',
    what: '10-year health record retention, 7-year payment retention, 24-month security event retention — enforced automatically, not manually.',
    orgs: ['PRIV', 'HISO'], evidence: 'task #360' },
  { cat: 'audit', section: 'Records, Retention & Peer Review',
    title: 'Section 22F full-record FHIR Bundle export',
    what: 'Patient request → single-click export of the full record as a Section 22F Bundle; disclosure captured on the audit trail with per-disclosure consent snapshot.',
    orgs: ['PRIV', 'HISO', 'HNZ'], evidence: 'tasks #349, #391' },
  { cat: 'audit', section: 'Records, Retention & Peer Review',
    title: 'Consult peer-review workflow',
    what: 'Consults sampled + peer-reviewed against a structured rubric; findings feed Clinical Governance Framework quarterly review.',
    orgs: ['MCNZ', 'HDC'], evidence: 'task #348; docs/regulatory/clinical-governance-framework.md' },
  { cat: 'audit', section: 'Records, Retention & Peer Review',
    title: 'Imaging peer-review workflow',
    what: 'Radiology reports (RHCNZ inbound via Medical-Objects) enter a peer-review queue before being filed to the chart.',
    orgs: ['MCNZ', 'HDC'], evidence: 'RHCNZ integration; project-tere-rhcnz-imaging' },
  { cat: 'audit', section: 'Records, Retention & Peer Review',
    title: 'ACC audit bundle + case-manager comms log',
    what: 'Per-claim evidence bundle assembled server-side + comms log linking every inbound/outbound ACC touch to the claim. Speeds regulator queries + patient enquiry response.',
    orgs: ['ACC'], evidence: 'tasks #332, #347, #369' },

  // ================ AUDIT — Reviews & Governance ================
  { cat: 'audit', section: 'Governance & Reviews',
    title: 'Clinical Governance Framework — quarterly CGM cadence',
    what: 'Clinical-lead-owned CGM cadence, credentialling checklist, peer review, AI governance, regulator engagement matrix.',
    orgs: ['MCNZ', 'HDC', 'HQSC'], evidence: 'docs/regulatory/clinical-governance-framework.md; task #401' },
  { cat: 'audit', section: 'Governance & Reviews',
    title: 'CGM minutes log + cadence tracker (evidence-of-operation)',
    what: 'Admin surface for logging CGM / peer review / M&M / audit meeting minutes (min 200 chars). Per-type cadence tiles turn red when overdue (CGM & M&M 90d, peer review 30d, audit 180d). Turns "documented cadence" into "evidence of operation" — what a regulator asks for when they read the framework and want to see the minutes.',
    orgs: ['MCNZ', 'HDC', 'HQSC', 'ISO27001'], evidence: 'task #427; cgm_meetings table + CgmMeetingsPanel.jsx' },
  { cat: 'audit', section: 'Governance & Reviews',
    title: 'Quarterly access review cron',
    what: 'Automated 90-day review of every provider’s access rights + admin roles; report emailed to the clinical lead + compliance owner for sign-off.',
    orgs: ['ISO27001', 'PRIV'], evidence: 'task #383' },
  { cat: 'audit', section: 'Governance & Reviews',
    title: 'ISO 27001 pathway plan + Phase 1 evidence',
    what: 'Formal roadmap to certification; controls mapped to Annex A; evidence pack under docs/regulatory/.',
    orgs: ['ISO27001'], evidence: 'docs/regulatory/iso-27001-pathway-plan.md; task #321' },
  { cat: 'audit', section: 'Governance & Reviews',
    title: 'HISO 10029 conformance evidence pack',
    what: 'Point-by-point conformance mapping for HISO 10029 (health information security framework) with pointer to the controls that satisfy each clause.',
    orgs: ['HISO'], evidence: 'docs/regulatory/hiso-10029-conformance.md; task #354' },
  { cat: 'audit', section: 'Governance & Reviews',
    title: 'Change Management Policy — 4-tier change categories',
    what: 'standard / normal / major / emergency change categories with corresponding approval + rollback + notify requirements.',
    orgs: ['ISO27001'], evidence: 'docs/regulatory/change-management-policy.md; task #407' },
  { cat: 'audit', section: 'Governance & Reviews',
    title: 'Media & Communications Policy',
    what: 'Who speaks to media, social media guardrails, marketing sign-off — reduces inadvertent PHI + regulatory misstep risk.',
    orgs: ['HDC', 'PRIV'], evidence: 'docs/regulatory/media-communications-policy.md; task #408' },
  { cat: 'audit', section: 'Governance & Reviews',
    title: 'Ethics policy v1.0 (pending advisor sign-off)',
    what: 'Standing ethics policy covering research + AI + cultural safety, awaiting Māori advisor + clinical ethics advisor review before v2.0.',
    orgs: ['NEAC', 'HDC', 'CoR'], evidence: 'docs/regulatory/ethics-policy-v1.md; task #211' },

  // ================ AUDIT — Breach & Incident Response ================
  { cat: 'audit', section: 'Breach & Incident Response',
    title: 'Privacy Act 2020 breach notification runbook',
    what: 'Step-by-step runbook for notifiable breach: contain → assess (Privacy Commissioner threshold) → notify affected individuals → notify OPC. Timeline + templates included.',
    orgs: ['PRIV'], evidence: 'docs/regulatory/privacy-breach-runbook.md; task #353' },
  { cat: 'audit', section: 'Breach & Incident Response',
    title: 'Rollback runbook (post-deploy safety)',
    what: 'Documented rollback procedure with revert-to-tag steps + Supabase PITR restore path; rehearsed after the 2026-08-15 VitalsValidate delete incident.',
    orgs: ['ISO27001'], evidence: 'task #234; PITR recovery task #264' },
  { cat: 'audit', section: 'Breach & Incident Response',
    title: 'Internal + external pen testing programme',
    what: '5-part internal pen test complete (API auth, RLS, frontend, business logic, config); P2 deferred items closed; external quotes with Aura + Bastion Security pending.',
    orgs: ['ISO27001', 'PRIV', 'HISO'], evidence: 'tasks #298–318; project-tere-pentest-p2-closeout' },
]

// -- Rendering ---------------------------------------------------------------
const CSS = `
  @page { size: A4; margin: 22mm 16mm 22mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1A2A33; font-size: 10.25pt; line-height: 1.55; margin: 0; }
  h1 { color: #0B6E76; font-size: 22pt; margin: 0 0 4px; letter-spacing: .01em; }
  h2 { color: #0B6E76; font-size: 15pt; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 2px solid #0B6E76; }
  h3 { color: #0D2B45; font-size: 12pt; margin: 14pt 0 6pt; }
  p, ul { margin: 0 0 8pt; }
  ul { padding-left: 18pt; }
  li { margin: 3pt 0; }
  code { background: #F1F5F9; padding: 1pt 4pt; border-radius: 3px; font-family: 'SF Mono', Menlo, monospace; font-size: 9pt; color: #0B4F5A; }
  strong { color: #0D2B45; }

  .cover { page-break-after: always; padding: 30mm 6mm 12mm; text-align: center; }
  .cover .brand { font-size: 28pt; font-weight: 800; color: #0D2B45; letter-spacing: .04em; margin-bottom: 6pt; }
  .cover .title { font-size: 24pt; color: #0B6E76; font-weight: 700; margin-bottom: 20pt; line-height: 1.15; }
  .cover .sub { font-size: 13pt; color: #6B7280; margin-bottom: 24pt; }
  .cover .divider { height: 3px; background: #0B6E76; width: 60%; margin: 0 auto 30pt; }
  .cover .stats { display: flex; gap: 12pt; justify-content: center; margin: 20pt 0 30pt; flex-wrap: wrap; }
  .cover .stat { background: #0D2B45; color: white; padding: 10pt 18pt; border-radius: 10px; min-width: 120pt; }
  .cover .stat.accent { background: #0B6E76; }
  .cover .stat .n { font-size: 22pt; font-weight: 800; display: block; }
  .cover .stat .l { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; opacity: .9; }
  .cover .meta { margin: 20pt auto 0; max-width: 460pt; text-align: left; border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0; }
  .cover .meta-row { display: flex; padding: 8pt 12pt; border-bottom: 1px solid #F1F5F9; }
  .cover .meta-row:last-child { border-bottom: none; }
  .cover .meta-row:nth-child(even) { background: #F8FAFC; }
  .cover .meta-label { background: #0D2B45; color: white; font-weight: 700; padding: 6pt 10pt; width: 150pt; margin: -8pt 12pt -8pt -12pt; font-size: 9.5pt; display: flex; align-items: center; }
  .cover .meta-value { flex: 1; padding: 2pt 0; font-size: 10pt; color: #1A2A33; }

  .catbanner { padding: 14pt 16pt; border-radius: 8px; margin: 22pt 0 8pt; color: white; font-weight: 800; font-size: 14pt; letter-spacing: .02em; }
  .catbanner.preemptive { background: linear-gradient(135deg, #0B6E76 0%, #0D2B45 100%); }
  .catbanner.audit      { background: linear-gradient(135deg, #7C3AED 0%, #0D2B45 100%); }
  .catbanner .sublabel  { display: block; font-weight: 600; font-size: 9.5pt; opacity: .85; margin-top: 3pt; letter-spacing: 0; }

  .section-header { font-weight: 700; color: #0D2B45; font-size: 12pt; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px dashed #CBD5E1; }

  .ctrl { border: 1px solid #E2E8F0; border-radius: 8px; padding: 10pt 12pt; margin: 6pt 0 8pt; page-break-inside: avoid; background: white; }
  .ctrl .title { font-weight: 700; color: #0D2B45; font-size: 10.5pt; margin-bottom: 4pt; }
  .ctrl .what  { font-size: 9.75pt; color: #374151; line-height: 1.5; margin-bottom: 6pt; }
  .ctrl .tags  { display: flex; gap: 4pt; flex-wrap: wrap; margin-bottom: 4pt; }
  .ctrl .tag   { color: white; padding: 2pt 8pt; border-radius: 10px; font-size: 8pt; font-weight: 700; letter-spacing: .02em; }
  .ctrl .evidence { font-size: 8pt; color: #6B7280; margin-top: 6pt; padding-top: 4pt; border-top: 1px solid #F1F5F9; }
  .ctrl .evidence .label { font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: .05em; margin-right: 4pt; }

  table.orgs { width: 100%; border-collapse: collapse; margin: 8pt 0 14pt; font-size: 9pt; }
  table.orgs th { background: #0D2B45; color: white; text-align: left; padding: 6pt 8pt; font-weight: 700; font-size: 8.5pt; }
  table.orgs td { padding: 6pt 8pt; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  table.orgs tr:nth-child(even) td { background: #F8FAFC; }
  table.orgs td.badge-cell { white-space: nowrap; }
  table.orgs .tag { color: white; padding: 2pt 8pt; border-radius: 10px; font-size: 8pt; font-weight: 700; }

  .toc { margin: 12pt 0 20pt; }
  .toc-row { display: flex; justify-content: space-between; padding: 4pt 0; border-bottom: 1px dotted #E2E8F0; font-size: 9.5pt; }
  .toc-row .name { color: #0D2B45; font-weight: 600; }
  .toc-row .count { color: #6B7280; }
  .toc-heading { color: #0B6E76; font-weight: 700; font-size: 10pt; margin: 12pt 0 4pt; text-transform: uppercase; letter-spacing: .05em; }
`

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function tag(orgKey) {
  const o = ORGS[orgKey]
  if (!o) return `<span class="tag" style="background:#9CA3AF" title="unknown">${escapeHtml(orgKey)}</span>`
  return `<span class="tag" style="background:${o.colour}" title="${escapeHtml(o.name)}">${escapeHtml(orgKey)}</span>`
}

function controlBlock(c) {
  return `
    <div class="ctrl">
      <div class="tags">${c.orgs.map(tag).join('')}</div>
      <div class="title">${escapeHtml(c.title)}</div>
      <div class="what">${escapeHtml(c.what)}</div>
      <div class="evidence"><span class="label">Evidence</span>${escapeHtml(c.evidence)}</div>
    </div>`
}

function categoryBlock(category, catLabel, catSub) {
  const controls = CONTROLS.filter(c => c.cat === category)
  const sections = [...new Set(controls.map(c => c.section))]
  return `
    <div class="catbanner ${category}">${catLabel}<span class="sublabel">${escapeHtml(catSub)}</span></div>
    ${sections.map(sec => {
      const rows = controls.filter(c => c.section === sec)
      return `
        <div class="section-header">${escapeHtml(sec)} <span style="color:#9CA3AF;font-weight:500;font-size:9pt">(${rows.length})</span></div>
        ${rows.map(controlBlock).join('')}
      `
    }).join('')}
  `
}

async function main() {
  const nPreempt = CONTROLS.filter(c => c.cat === 'preemptive').length
  const nAudit   = CONTROLS.filter(c => c.cat === 'audit').length
  const allOrgs  = [...new Set(CONTROLS.flatMap(c => c.orgs))]

  const orgTableRows = Object.entries(ORGS)
    .filter(([k]) => allOrgs.includes(k))
    .map(([k, o]) => `
      <tr>
        <td class="badge-cell">${tag(k)}</td>
        <td><strong>${escapeHtml(o.name)}</strong></td>
        <td>${escapeHtml(o.basis)}</td>
        <td style="text-align:right;color:#6B7280">${CONTROLS.filter(c => c.orgs.includes(k)).length}</td>
      </tr>`).join('')

  const preemptSections = [...new Set(CONTROLS.filter(c => c.cat === 'preemptive').map(c => c.section))]
  const auditSections   = [...new Set(CONTROLS.filter(c => c.cat === 'audit').map(c => c.section))]

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Tere Health — Patient Protections Review</title><style>${CSS}</style></head>
<body>
  <section class="cover">
    <div class="brand">TERE HEALTH</div>
    <div class="title">Patient Protections<br>Review</div>
    <div class="sub">Preemptive + Audit Controls, mapped to each NZ regulator</div>
    <div class="divider"></div>
    <div class="stats">
      <div class="stat"><span class="n">${nPreempt}</span><span class="l">Preemptive controls</span></div>
      <div class="stat accent"><span class="n">${nAudit}</span><span class="l">Audit controls</span></div>
      <div class="stat"><span class="n">${allOrgs.length}</span><span class="l">Regulators / frameworks</span></div>
    </div>
    <div class="meta">
      <div class="meta-row"><div class="meta-label">Prepared for</div><div class="meta-value">Tere Health Ltd — internal governance review</div></div>
      <div class="meta-row"><div class="meta-label">Compliance owner</div><div class="meta-value">Dr Patrick Herling (Chief Medical Officer)</div></div>
      <div class="meta-row"><div class="meta-label">Generated</div><div class="meta-value">${new Date().toLocaleString('en-NZ', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Pacific/Auckland' })}</div></div>
      <div class="meta-row"><div class="meta-label">Classification</div><div class="meta-value">Confidential — internal governance use only. External sharing requires executive approval; a redacted version omitting §6 Known Gaps may be prepared for regulator/insurer requests.</div></div>
    </div>
  </section>

  <h2>1. How to read this document</h2>
  <p>This review lists every patient-protecting control Tere Health has shipped, in two categories:</p>
  <ul>
    <li><strong>Preemptive</strong> — controls that <em>prevent</em> harm, unauthorised access, or regulatory breach before it happens (technical gates, role limits, encryption, consent, vetting, <strong>clinical safety gates</strong>).</li>
    <li><strong>Audit</strong> — controls that <em>detect, record, or review</em> events after the fact (access logs, anomaly detection, complaint workflow, adverse event reporting, retention, <strong>clinical anomaly detection</strong>).</li>
  </ul>
  <p>Every control is tagged with the specific regulator, statute, or standard it satisfies. Tag colours match the legend below. Where a control satisfies multiple bodies (common), all tags are listed.</p>
  <p style="background:#F8FAFC;border-left:3px solid #0B6E76;padding:10pt 12pt;margin-top:12pt;font-size:9.5pt">
    <strong>Note on the shape of this list.</strong> Historically the weight of Tere's controls sat on information security and privacy (MFA, RLS, encryption, break-glass, audit logs). A 2026-09-03 review flagged that in telehealth, real patient harm is more often from a missed diagnosis, failed escalation, or a dropped result than a data breach. The <em>Clinical Safety</em> subsection under Preemptive has been substantially expanded in response — results follow-up loop, safety-netting as a gated field, triage divert list, emergency-escalation location capture, GP-handover continuity, prescribing safety guards, patient identity verification, plus paired audit crons for results reconciliation, re-presentation, and prescribing surveillance. Read the two categories together as a single safety posture, not just a security posture.
  </p>

  <h2>2. Regulators &amp; frameworks in scope</h2>
  <table class="orgs">
    <tr><th style="width:60pt">Tag</th><th style="width:170pt">Body</th><th>Basis / standard</th><th style="text-align:right;width:60pt">Controls</th></tr>
    ${orgTableRows}
  </table>

  <h2>3. Contents</h2>
  <div class="toc">
    <div class="toc-heading">Preemptive controls (${nPreempt})</div>
    ${preemptSections.map(s => `
      <div class="toc-row"><span class="name">${escapeHtml(s)}</span><span class="count">${CONTROLS.filter(c => c.cat === 'preemptive' && c.section === s).length} control(s)</span></div>
    `).join('')}
    <div class="toc-heading">Audit controls (${nAudit})</div>
    ${auditSections.map(s => `
      <div class="toc-row"><span class="name">${escapeHtml(s)}</span><span class="count">${CONTROLS.filter(c => c.cat === 'audit' && c.section === s).length} control(s)</span></div>
    `).join('')}
  </div>

  <h2>4. Preemptive controls</h2>
  ${categoryBlock('preemptive', 'PREEMPTIVE CONTROLS', 'Prevent harm, unauthorised access, or regulatory breach before it happens')}

  <h2>5. Audit controls</h2>
  ${categoryBlock('audit', 'AUDIT CONTROLS', 'Detect, record, or review events after the fact')}

  <h2>6. Known gaps &amp; work in flight</h2>
  <p style="font-size:9.5pt;color:#6B7280">This section is deliberately explicit for internal governance. Redact before external sharing.</p>
  <ul>
    <li><strong>External pen test</strong> — quotes pending from Aura + Bastion Security + Blacklock (NZ-based, CREST). Preferred: one-off narrative-report engagement for ISO 27001 evidence + insurance procurement (task #297).</li>
    <li><strong>Cloudflare Zero Trust for /admin</strong> — planned, not yet configured (task #294).</li>
    <li><strong>Cloudflare rate-limit rules on PHI endpoints</strong> — planned (task #295).</li>
    <li><strong>Ethics policy v2.0</strong> — needs Māori advisor + clinical ethics advisor sign-off (task #211).</li>
    <li><strong>Clinical governance evidence-of-operation</strong> — CGM cadence tracker + minutes log is shipped (task #427). What's still pending is <em>actual meetings</em> — the framework's credibility with a regulator rests on minutes being logged, not on the tool being deployed.</li>
    <li><strong>ISO 27001 certification</strong> — pathway plan filed; Stage 1 audit not yet booked.</li>
    <li><strong>WAND scope</strong> — currently HR + SpO2 + RR only; BP + paediatric + other vitals would require a fresh change-notify (task #260).</li>
    <li><strong>NZF prescribing licence</strong> — task #229 blocks the full drug-drug interaction check. Partial coverage shipped: max-quantity + early-refill + doctor-shopping (task #423).</li>
    <li><strong>Patient identity verification — AI face-compare</strong> — v1 is provider attestation only (task #426). AI face-match against uploaded photo ID is future work.</li>
    <li><strong>MOH new-service notification evidence</strong> — task #172 marked complete but no receipt / reference in the repo. See docs/regulatory/moh-notification-verification-needed.md — Patrick to confirm reference number + date, or file if not actually filed (task #428).</li>
    <li><strong>Divert keyword coverage</strong> — AI chat divert uses ~24 hardcoded phrases (task #430). Broader coverage would benefit from an LLM-based safety classifier layer, which would need a fresh WAND change-notify. Tracked at task #288.</li>
  </ul>

  <h2>7. Contact</h2>
  <p><strong>Compliance owner:</strong> Dr Patrick Herling, Chief Medical Officer<br>
     <strong>Email:</strong> hello@terehealth.co.nz<br>
     <strong>Registered office:</strong> Tere Health Limited, NZ<br>
     <strong>Corporate site:</strong> tere.co.nz &nbsp;·&nbsp; <strong>Patient site:</strong> terehealth.co.nz</p>

</body></html>`

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({
    path: OUT_PATH, format: 'A4', printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    footerTemplate: `<div style="width:100%;font-size:8pt;color:#9CA3AF;padding:0 14mm;display:flex;justify-content:space-between;"><span>Tere Health Limited · Patient Protections Review</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    headerTemplate: '<div></div>',
  })
  await browser.close()
  console.log(`Wrote ${OUT_PATH}`)
  console.log(`  ${nPreempt} preemptive · ${nAudit} audit · ${allOrgs.length} regulators`)
}

main().catch(err => { console.error(err); process.exit(1) })
