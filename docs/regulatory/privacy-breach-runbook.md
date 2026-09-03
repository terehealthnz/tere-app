# Privacy breach notification runbook (Tere Health Ltd)

**Owner:** Patrick Herling (Chief Medical Officer) — first responder + regulator contact.
**Backup:** Rachel Thomas (Medical Director) — clinical spokesperson if breach affects clinical care.
**Legal basis:** Privacy Act 2020 s114 (notifiable privacy breach), Health Information Privacy Code 2020 Rule 5 + Rule 11.

This runbook covers what to do when we detect (or suspect) unauthorised access, loss, or disclosure of patient information. **Response window is 72 hours from becoming aware — start the clock at first credible signal.**

---

## 0. Rapid decision tree (first 30 minutes)

1. **Is there ongoing exposure?** (e.g. a stolen credential still in use, a public S3 bucket, a compromised email account.)
   - **Yes** — go to §1 (Contain).
   - **No** — go to §2 (Assess).
2. **Could this be reasonably expected to cause serious harm to a person?** (identity theft, discrimination, loss of dignity, physical safety, financial loss.)
   - **Yes** — this is a **notifiable privacy breach**. Go to §3 (Notify) after §1–§2.
   - **No, and it's a minor internal control gap** — log to `security_events`, run §2 for record, no external notification required. Document why.

If in doubt, treat as notifiable and notify. Under-notification is riskier than over-notification.

---

## 1. Contain (first hour)

- **Revoke** the exposed credential / access token / API key. Rotate immediately.
  - Vercel env: rotate + redeploy (SUPABASE_SERVICE_ROLE_KEY, HPI_CLIENT_SECRET, TELNYX_API_KEY, WISE_API_TOKEN, STRIPE_SECRET_KEY, AWS_*, BEDROCK creds, EMAIL_PROVIDER creds, ONBOARDING_ENCRYPTION_KEY).
  - Supabase: DB password rotation via console. Delete/rotate any API keys.
  - Provider PIN: force-logout via `sessionStorage` cleardown + rotate the affected provider's password.
- **Kill session(s)** — mark provider `is_active=false` if compromised; delete active supabase sessions.
- **Block IP** at Cloudflare if targeted attack is in flight.
- **Preserve evidence** — snapshot Supabase (PITR window is 7 days on our plan), Vercel logs, security_events table. Do NOT delete anything until §5 (post-incident) complete.

## 2. Assess (first 24 hours)

Answer these in a shared doc (Google Doc or new `docs/incidents/YYYY-MM-DD-brief-name.md`):

- **What data was exposed?** (fields, tables, patient count, date range)
- **How was it exposed?** (misconfiguration, credential leak, insider, external attacker, phishing)
- **When did exposure start?** (based on audit_logs, security_events, log correlation)
- **When did it end?** (containment timestamp)
- **Who was affected?** (list of patient NHIs; if unknown, best-estimate range)
- **What harm could reasonably result?** (identity theft — needs financial/id data · discrimination — needs clinical data · physical safety — needs address + clinical · dignity — needs sensitive category)
- **Is the harm serious?** (this is the notifiability test — s114 Privacy Act 2020)

Serious harm indicators for a health-data breach in NZ:
- Any clinical mental-health, sexual-health, addiction, or reproductive-health data.
- Any identifiable NHI + address + full name combination (identity risk).
- Any child (under 16) patient data.
- Any breach affecting > 50 patients regardless of category.

## 3. Notify (72-hour window)

### 3a. Office of the Privacy Commissioner (OPC)

- Portal: <https://www.privacy.org.nz/tools/notifybreach/>
- Form fields we're always asked:
  - Reporting entity (Tere Health Ltd, NZBN 9429053723413)
  - Contact: Patrick Herling · patrickherling@gmail.com · +64 29 043 234 27
  - Date + time of breach + discovery
  - Description of data
  - Number of individuals affected
  - Containment actions taken
  - Notification plan for affected individuals
  - Support offered (credit monitoring, identity protection, counselling)
- Save the OPC reference number to the incident doc immediately.

### 3b. Affected individuals

**Timing:** as soon as practicable after §3a, and always within the 72-hour window unless OPC gives us a deferral (rare).

**Channel priority:** email (from hello@terehealth.co.nz) → SMS (via AWS SNS) → phone call (for high-risk cases). Post as last resort — we don't reliably have postal addresses.

**Template letter to affected individual:**

> Kia ora [name],
>
> We are writing to let you know about a privacy incident at Tere Health that may have affected information about you.
>
> **What happened:** [1–2 sentences plain English, no jargon]
>
> **What information was involved:** [list the specific fields — name, NHI, DOB, address, clinical notes, prescription, etc.]
>
> **What we've done:** [containment actions in plain English]
>
> **What you can do:** [practical steps — change any shared password, watch for suspicious activity, contact your bank if financial data, contact IDCare on 0800 121 068 for identity-theft support]
>
> **Support available:**
> - IDCare NZ — free identity-theft support — 0800 121 068
> - Netsafe — 0508 638 723
> - If clinical data — we can arrange support from Rachel Thomas (Medical Director) at rachel@terehealth.co.nz
>
> **Regulator:** we have notified the Office of the Privacy Commissioner. Their reference is [OPC ref].
>
> **Your rights:** you can complain directly to OPC at privacy@privacy.org.nz or 0800 803 909. You do not need to go through us to complain.
>
> **Contact:** for any questions, reply to this email or call +64 29 043 234 27.
>
> We are sorry this has happened, and we take the security of your information very seriously.
>
> Dr Patrick Herling
> Chief Medical Officer, Tere Health Limited

### 3c. Other regulators (as applicable)

- **HDC (Health and Disability Commissioner)** — if the breach affected clinical care or Right 4 (services of appropriate standard). Not automatic — use judgment. hdc@hdc.org.nz.
- **HNZ / Ministry of Health** — if the breach affected NHI, HPI, NZePS, or any HIP-connected data. Contact your onboarding coordinator + HI_Provider@tewhatuora.govt.nz.
- **MCNZ / equivalent** — if the breach relates to a specific practitioner (Patrick / Rachel) — self-refer within 7 days.
- **ACC** — if the breach affects claim data (patient_nhi + claim_number + injury data). Notify your ACC Health Procurement contact.
- **AWS/BAA** — if AWS Bedrock or SES was involved, open a support case with AWS.
- **Cyber insurer** — Delta Insurance (once policy binds) — notify within their policy window (usually 48h).

## 4. Communicate internally

- Post to Tere internal chat (`#security` or general channel) — one paragraph, no PHI.
- Update the incident doc in real time — this becomes the post-incident record.
- Do NOT discuss on external channels (LinkedIn, Twitter, patient-facing pages) unless we make a formal public statement.

## 5. Post-incident review (within 30 days)

- Root cause analysis using the "5 whys" method. Document in the incident doc.
- Corrective actions with owners + due dates. Add to task list.
- Update audit-log queries to detect the same pattern in future (add to `_cron-security-anomalies.js`).
- Update this runbook if new lesson learned.
- Report summary to OPC (they usually ask for a closure notice).

## 6. Backup runbook (Patrick unavailable)

If Patrick is unreachable within 4 hours of a breach signal, Rachel Thomas assumes the response lead. Contact chain:
1. Patrick Herling — +64 29 043 234 27 · patrickherling@gmail.com
2. Rachel Thomas — [Rachel's mobile] · rachel@terehealth.co.nz
3. External counsel — [law firm on retainer, TBD]

---

## Appendix A — Regulator contact quick-reference

| Regulator | Contact | Turnaround |
|---|---|---|
| OPC | privacy.org.nz/notifybreach · 0800 803 909 | 72h notifiable, they respond within 5 days |
| HDC | hdc@hdc.org.nz · 0800 11 22 33 | Notify within 7 days if care-affecting |
| Ministry of Health | onboarding portal → the ticket associated with your integration | Depends on integration |
| ACC | your ACC Health Procurement contact + audit@acc.co.nz | Notify within 5 days |
| MCNZ (practitioner self-report) | notifications@mcnz.org.nz | 7 days for practitioner-specific breaches |

## Appendix B — Evidence to attach to OPC notification

- Timeline (breach → discovery → containment → notification)
- Affected data schema (which columns, from which tables, over which date range)
- Number of affected individuals + how identified
- Containment log (audit_logs + security_events rows)
- Sample notification letter sent to affected individuals
- Root cause analysis + corrective actions (if available at time of notification; otherwise commit to send within 30 days)

## Change log

- 2026-09-03 — v1.0 initial draft (Patrick Herling, drafted post-pen-test cutover). Reviewed by: n/a (needs Rachel sign-off before it's authoritative).
