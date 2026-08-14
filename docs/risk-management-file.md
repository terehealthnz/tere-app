# Tere Vitals — Risk Management File

**Document version:** 1.0
**Date:** 2026-08-14
**Owner:** Dr Patrick Herling (Chief Medical Officer, Risk Management Lead)
**Review cadence:** Every twelve months, or immediately following any change to the intended purpose, algorithm, delivery channel, or post-market surveillance signal indicating a new hazard
**Standard alignment:** ISO 14971:2019 (Medical devices — Application of risk management to medical devices)
**Companion documents:** [`quality-management-system.md`](./quality-management-system.md), [`software-lifecycle-file.md`](./software-lifecycle-file.md), [`incident-response-plan.md`](./incident-response-plan.md)

---

## 1. Scope and device description

This file applies to **Tere Vitals** — the SaMD notified to MedSafe under WAND `260729-WAND-786DQ9` (GMDN 57960, Class IIa), being a browser-based software module that uses the front-facing camera of a consumer smartphone or laptop to estimate heart rate (HR), peripheral oxygen saturation (SpO₂), and respiratory rate (RR) via remote photoplethysmography (rPPG), for use as an adjunct to remote clinical triage during telehealth consultations with adult patients (18+).

**Deliberate scope exclusions**, each carrying its own risk implication:

- **Blood pressure** is estimated by the underlying model but **not displayed in the clinical workflow** until the algorithm is validated to ISO 81060-2 and the WAND scope is amended. BP display is feature-flagged off in the production intake path.
- **Paediatric and neonatal populations** are excluded — the algorithm has not been validated for the different vital-sign reference ranges, skin thickness, or motion patterns of children.
- **Continuous monitoring** is not supported — every reading is a discrete spot-check.
- **Standalone diagnosis** is explicitly not the intended use — the registered clinician remains the decision-maker.

## 2. Risk management team

| Role | Person |
|---|---|
| Risk Management Lead | Dr Patrick Herling |
| Clinical safety input | Dr Rachel Thomas (FACEM) |
| Software risk analysis | Patrick + contracted software team |

## 3. Risk management plan

The risk management process follows ISO 14971:2019 with the following cycle:

1. **Identify hazards** (§5)
2. **Estimate risks** (severity × probability) (§6)
3. **Evaluate against acceptability criteria** (§7)
4. **Implement risk controls** (§8)
5. **Verify residual risk** (§9)
6. **Feed post-market surveillance signals back into the cycle** (§11)

Reviews are triggered by (a) the annual cadence, (b) any material change to the algorithm, (c) any incident indicating a new hazard, (d) any change to the intended purpose or delivery channel, and (e) any change to a sub-processor or infrastructure component that materially affects availability, confidentiality, or integrity.

## 4. Intended use and reasonably foreseeable misuse

**Intended use** (as notified to MedSafe): estimation and display of HR, SpO₂, and RR from a smartphone or laptop camera, as an adjunct to remote clinical triage in adults 18+, in ambulatory non-critical settings, during a Tere Health telehealth consultation.

**Reasonably foreseeable misuse** (each treated as a distinct hazard in §5–8):

- Use by a clinician outside a consultation to "spot check" a friend/family member.
- Use by a patient on their own child (paediatric misuse).
- Use in a critical-care or emergency setting where lab-grade accuracy is required.
- Clinical decision made purely on Tere Vitals output, without corroborating history and examination (automation bias).
- Use in poor lighting conditions, extreme motion, or with the camera occluded.
- Use on patients with medical conditions (arrhythmias, poor peripheral perfusion, dark skin tone with poor lighting) where rPPG accuracy is known to degrade.
- Use of a stored calibration file from a different device.
- Screenshot/exfiltration of a reading, presented to a third party (e.g., insurer) as authoritative.

## 5. Hazard identification

The hazard analysis table (§10) enumerates hazards under five categories:

1. **Clinical/measurement hazards** — the device produces a reading that misleads a clinician.
2. **Population/scope hazards** — the device is used outside its notified scope.
3. **Software/availability hazards** — the device fails to function, or functions incorrectly due to a defect.
4. **Data protection hazards** — patient PHI is disclosed, lost, or tampered with.
5. **Human-factors / usability hazards** — user or clinician misuses or misinterprets the device.

## 6. Risk analysis method

For each hazard, the file records:

- **Cause(s)** — the sequence of events that lead to the hazard.
- **Harm** — the injury or health outcome to the patient.
- **Severity (S)** — 1 (negligible) to 4 (catastrophic), per ISO 14971 §D.3.1 guidance.
- **Probability (P)** — 1 (rare) to 4 (frequent), based on our clinical population and evidence.
- **Risk score (S × P)** — 1–16, mapped to acceptability bands in §7.
- **Risk controls** — the technical, organisational, or informational mitigations in place.
- **Residual risk** — the risk score after controls are applied.

## 7. Risk acceptability criteria

| Score band | Acceptability | Action required |
|---|---|---|
| 1–3 | Broadly acceptable | Document; monitor. |
| 4–8 | As-Low-As-Reasonably-Practicable (ALARP) — acceptable with controls | Document risk controls; verify effectiveness; monitor for signal changes. |
| 9–16 | Not acceptable | Additional controls **must** be implemented before deployment or continued use. If residual risk remains ≥9 despite all reasonable controls, the capability is disabled or the intended purpose is narrowed. |

## 8. Risk control principles

Controls are applied in the ISO 14971 hierarchy: **inherent safety by design > protective measures > information for safety** (labelling/IFU/training).

Concrete control mechanisms available to Tere Vitals include:

- **Feature flags** (Supabase `flags` table + `/api/flags`) — capabilities can be enabled/disabled per environment, per cohort, or globally in seconds.
- **Server-side allowlists** on all clinical writes (see [`security-compliance.md`](./security-compliance.md)).
- **Signal-quality gating** — rPPG readings below the SNR threshold are hidden rather than displayed with false precision (`formatSpO2Display` and equivalents).
- **Client-side format validation** on NHI + prescription inputs.
- **Intended-purpose enforcement in the UI** — labelling emphasises "adjunct only; not a substitute for clinical judgement".
- **MFA on all clinician logins**; PIN + device-remember pattern with 30-day expiry.
- **Audit logging** of every PHI reveal + patient search + NHI lookup (see [`audit-log-retention-policy.md`](./audit-log-retention-policy.md)).
- **PhiRevealGate** requiring reason-picker before admin non-billing reveal of clinical detail.
- **Sub-processor certifications** inherited (see QMS §5.2 + Appendix B).

## 9. Overall residual risk evaluation

Following application of all controls documented in the hazard analysis table (§10), the overall residual risk of Tere Vitals is judged **acceptable** for the notified intended purpose. This judgement is grounded in:

- No hazard retains a residual risk score ≥9.
- The device is positioned as **adjunct** (not diagnostic, not autonomous), preserving human clinical decision-making as the final gate.
- The scope is deliberately narrow (excludes BP, paeds, continuous, critical-care) — future-broadening triggers a WAND amendment and a fresh risk cycle.
- Sub-processors handling PHI are certified to relevant standards (SOC 2, ISO 27001, HIPAA BAA); we do not build primary safety controls ourselves where a certified sub-processor already provides them.

## 10. Hazard analysis table

### 10.1 Clinical / measurement hazards

| ID | Hazard | Causes | Harm | S | P | Score | Controls | Residual | Res. band |
|---|---|---|---|---|---|---|---|---|---|
| C-01 | HR reading materially wrong | Poor rPPG signal (low light, motion, skin tone bias, arrhythmia) | Clinician reassured despite tachycardia/bradycardia; delayed escalation | 3 | 2 | 6 | Signal-quality gating hides low-confidence; IFU flags rPPG limitations; clinician-facing UI copy "adjunct — verify against clinical picture"; validation via VitalsValidate | 3 (S3×P1) | ALARP |
| C-02 | SpO₂ reading falsely reassuring | Model bias, calibration drift, poor perfusion, dark skin tone in low light | Clinician misses hypoxia; delayed escalation | 4 | 2 | 8 | Per-device calibration file; `formatSpO2Display` hides low-confidence; validation-readings track drift; IFU explicitly excludes reliance in acute respiratory presentations | 4 (S4×P1) | ALARP |
| C-03 | RR reading materially wrong | FFT/autocorr noise, respiratory pattern outside model training envelope | Clinician misses tachypnoea (sepsis, PE, pneumonia) | 4 | 2 | 8 | Detrend + FFT/autocorr consensus (commit 1ee0089); IFU flags RR as least-reliable of the three; clinician-facing UI recommends direct observation for suspected respiratory pathology | 4 (S4×P1) | ALARP |
| C-04 | BP inadvertently displayed | Feature-flag misconfiguration | Clinician acts on unvalidated BP reading | 4 | 1 | 4 | BP feature-flagged off in prod; verified on every release; task #260 blocks re-enable without WAND amendment | 2 (S4×P0.5) | Acceptable |

### 10.2 Population / scope hazards

| ID | Hazard | Causes | Harm | S | P | Score | Controls | Residual | Res. band |
|---|---|---|---|---|---|---|---|---|---|
| P-01 | Paediatric misuse | Parent uses on child; clinician trusts reading | Wrong triage decision for a child (whose reference ranges differ) | 4 | 2 | 8 | Age gate at intake (DOB required); intended purpose in IFU explicitly excludes <18; clinician training on scope; VitalsValidate accuracy stats reference an adult-only dataset | 4 (S4×P1) | ALARP |
| P-02 | Use in critical-care / physiologically unstable patient | Emergency presentation via telehealth; clinician relies on rPPG rather than urgent transfer | Delay to appropriate acute care | 4 | 2 | 8 | Intended purpose in IFU explicitly excludes critical care; clinician training emphasises transfer criteria; red-flag triage overrides the vitals surface | 4 (S4×P1) | ALARP |
| P-03 | Non-NZ patient (out of scope of MCNZ registration) | Patient overseas at consultation | Regulatory + indemnity gap; care provided under wrong jurisdiction | 3 | 2 | 6 | IP-based geo gate at consult start (`GeoGateModal` + `/api/geo-check`); attestation checkbox on top; consultation blocked if non-NZ IP and no attestation | 2 (S3×P1) | Acceptable |

### 10.3 Software / availability hazards

| ID | Hazard | Causes | Harm | S | P | Score | Controls | Residual | Res. band |
|---|---|---|---|---|---|---|---|---|---|
| S-01 | Software regression producing wrong output | Buggy release deployed | Any clinical hazard C-01…C-04 realised | 4 | 2 | 8 | SDLC in [`software-lifecycle-file.md`](./software-lifecycle-file.md); git-based change control; feature flags for staged rollout; rollback ≤ 30s; canary uptime monitor planned | 3 | ALARP |
| S-02 | Product unavailability during consult | Vercel/Supabase/Bedrock/LiveKit outage | Care disrupted; safety risk if consult was for urgent concern | 3 | 2 | 6 | Multi-AZ hosting; RTO 30 min for critical path (see DR plan); clinician can fall back to phone-only via voice bridge; patient support system captures and routes affected patients | 3 | ALARP |
| S-03 | Silent data corruption in `consultations`/`patients` | Migration bug; race condition | Clinical record shows wrong data | 4 | 1 | 4 | Server-mediated writes with column allowlists; Supabase PITR 7 days; migration review discipline (see rollback runbook) | 2 | Acceptable |

### 10.4 Data protection hazards

| ID | Hazard | Causes | Harm | S | P | Score | Controls | Residual | Res. band |
|---|---|---|---|---|---|---|---|---|---|
| D-01 | PHI breach (unauthorised access) | Credential compromise; injection; sub-processor breach | Loss of confidentiality; HIPC notifiable | 3 | 2 | 6 | MFA on all clinician logins; RLS + server-mediated writes; sub-processors under BAA/DPA; IR plan §3 + OPC notification path | 2 | Acceptable |
| D-02 | Patient identity mixup | NHI mistype; patient impersonation | Clinical action on wrong patient | 4 | 1 | 4 | NHI-first search + audit trail; DOB + name confirmation at intake; PhiRevealGate on admin reveals | 3 | Acceptable |
| D-03 | Audit trail gap | Endpoint that touches PHI without audit hook | Cannot reconstruct access during HDC/OPC investigation | 2 | 2 | 4 | `audit_logs` writes on every PHI endpoint (patient search + lookup + reveal + HPI FHIR call); quarterly audit-log completeness review | 2 | Acceptable |

### 10.5 Human factors / usability hazards

| ID | Hazard | Causes | Harm | S | P | Score | Controls | Residual | Res. band |
|---|---|---|---|---|---|---|---|---|---|
| H-01 | Automation bias | Clinician relies on Tere Vitals output without corroborating clinical examination | Missed pathology | 3 | 3 | 9 | Every reading is labelled "adjunct — confirm clinically" in UI; IFU + supervision plan emphasise clinician primacy; validation-readings + accuracy stats shared with clinicians so they see the failure modes; low-confidence readings **hidden** rather than shown with an uncertainty range (avoids false precision) | 6 (S3×P2) | ALARP |
| H-02 | Screenshot presented to insurer/employer as authoritative | Patient screenshots reading; sends to insurer | Insurer acts on unvalidated reading; downstream harm to patient (e.g. denied claim) | 2 | 3 | 6 | UI does not present readings in an "official-looking" format; IFU states the device is not for insurance/employer use; consent copy at intake states clinical-adjunct scope only | 4 | ALARP |
| H-03 | Poor-quality reading treated as good | Ambient light dim, patient moving, camera occluded, and the UI still shows a number | Wrong triage | 3 | 2 | 6 | Signal-quality gating; UI shows "not enough signal" state instead of a low-confidence reading | 3 | ALARP |

## 11. Post-market surveillance feedback

Signals monitored to feed the risk cycle:

- **`incidents` table** — any P0/P1/P2 raised triggers review of the relevant hazard's residual risk.
- **`validation_readings` drift** — quarterly aggregate accuracy vs baseline. Material drift is a P2 incident.
- **Patient complaints** via `/api/patient-support` — any complaint alleging a wrong reading triggers a hazard-file review.
- **Clinician-flagged reviews** — any note flagged by a clinician as "device output seemed wrong" surfaces at monthly review.
- **Sub-processor incident notifications** (AWS, Supabase, Vercel, LiveKit) — trigger a supply-chain risk review.
- **Regulator signals** — any correspondence from MedSafe, HDC, OPC referring to Tere Vitals or a similar device class is filed to `docs/regulatory/` and reviewed against this file.

## 12. Risk management report

The overall residual risk of Tere Vitals for its notified intended purpose is judged **acceptable**. No hazard retains a residual risk score ≥9 after controls. The device is not the sole determinant of any clinical decision; the registered clinician remains the decision-maker in every workflow. Post-market surveillance is active and any material change to the risk landscape will trigger a documented revision to this file.

## Appendix — Change history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-08-14 | Patrick Herling | Initial issue for Tere Vitals (WAND `260729-WAND-786DQ9`). Baseline hazard analysis covering clinical, population, software, data-protection, and human-factors hazards. |
