import React from 'react'
import { Link } from 'react-router-dom'

// VitalsValidate Participant Information Sheet — the full text a
// participant reads before consenting to a submission. Linked from the
// ethics blurb on /vitals-validate. Mirrors
// docs/vitals-validate-participant-information-sheet.md (v1.0). If that
// doc changes materially, update this page in the same PR.

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const BG   = '#F7F5F0'
const FF   = 'Plus Jakarta Sans, sans-serif'

function H2({ children }) {
  return <h2 style={{ fontSize: '1.15rem', color: NAVY, fontWeight: 800, margin: '2rem 0 .5rem' }}>{children}</h2>
}
function P({ children, muted }) {
  return <p style={{ fontSize: '.95rem', color: muted ? '#4B5563' : '#1F2937', lineHeight: 1.7, margin: '0 0 .75rem' }}>{children}</p>
}

export default function VitalsValidateParticipantInfo() {
  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FF, padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.5rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: '1.1rem', fontWeight: 900 }}>V</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.05rem' }}>Tere Vitals Validation</div>
            <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Participant Information Sheet</div>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 14, padding: '1.5rem 1.75rem', border: '1px solid #E5E7EB' }}>
          <h1 style={{ fontSize: '1.5rem', color: NAVY, fontWeight: 800, margin: '0 0 .25rem' }}>Participant Information Sheet</h1>
          <div style={{ fontSize: '.85rem', color: '#6B7280', marginBottom: '1.25rem' }}>Version 1.0 · 2026-08-04</div>

          <div style={{ background: '#F0F9FA', border: `1px solid ${TEAL}33`, borderRadius: 8, padding: '.75rem .9rem', fontSize: '.85rem', color: NAVY, marginBottom: '1.5rem' }}>
            <strong>Ethics status:</strong> Reviewed by the New Zealand Health and Disability Ethics Committee (HDEC) and determined <strong>out of scope</strong> on 3 August 2026 — anonymous, low-risk observational research. Bound by the National Ethical Standards for Health and Disability Research (NEAC 2019).
          </div>

          <H2>1. What is this study about?</H2>
          <P>Tere Health has built a system that estimates a person's vital signs — heart rate, respiratory rate, oxygen saturation, and (experimentally) blood pressure — from a short video of their face captured by a standard smartphone camera. This is called remote photoplethysmography, or rPPG.</P>
          <P>We need to check how accurate this measurement is across a wide range of people — different ages, sexes, body shapes, skin tones, and health conditions. That's what VitalsValidate is for.</P>
          <P>We invite members of the public to take a short measurement with their phone at the same time as taking a reference measurement with a standard blood-pressure cuff at home, at a pharmacy, or at their GP.</P>

          <H2>2. What will you be asked to do?</H2>
          <ol style={{ fontSize: '.95rem', color: '#1F2937', lineHeight: 1.7, paddingLeft: '1.25rem', margin: '0 0 .75rem' }}>
            <li>Enter a small amount of anonymous information about yourself: age, sex, height, weight, Fitzpatrick skin scale (a 1–6 scale of skin tone), whether you have high or low blood pressure, and any other relevant conditions.</li>
            <li>Take a reference cuff reading: enter your systolic blood pressure, diastolic blood pressure, and heart rate from a standard cuff device.</li>
            <li>Take a 30-second facial video with your phone's camera using our web app. The app processes the video on your device to extract a vital-signs estimate.</li>
          </ol>
          <P>The entire process takes about 5–10 minutes.</P>

          <H2>3. Do we collect anything that identifies you?</H2>
          <P><strong>No.</strong> We do not collect your name, email, address, phone number, or any other identifying information. Each submission is stored with an anonymous internal identifier only.</P>
          <P>The information we do collect is limited to the demographics and readings listed above, plus device-and-browser metadata sent automatically by your web browser (approximate location by IP, user-agent string). We do not retain the raw video — only the numeric vital-signs values extracted from it.</P>

          <H2>4. Withdrawal — important</H2>
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '.85rem 1rem', color: '#78350F', fontSize: '.95rem', lineHeight: 1.6, margin: '0 0 .75rem' }}>
            Because the study is anonymous, <strong>once you submit a measurement we cannot identify which record is yours</strong>. This means we cannot withdraw an individual submission on request.
          </div>
          <P>You can stop the study at any point <em>before</em> pressing Submit — nothing is saved until you do.</P>

          <H2>5. Risks and burdens</H2>
          <ul style={{ fontSize: '.95rem', color: '#1F2937', lineHeight: 1.7, paddingLeft: '1.25rem', margin: '0 0 .75rem' }}>
            <li>No physical intervention. The reference cuff reading you take is one you would take yourself at home or at a pharmacy; we do not ask you to do anything additional.</li>
            <li>No medicines, no interventions, no diagnostic decisions based on the measurement. VitalsValidate is not a clinical tool.</li>
            <li>The reading you get from Tere's rPPG system is a research measurement — do not use it to make decisions about your health. If you are concerned about your blood pressure, see your GP or call Healthline (<a href="tel:0800611116" style={{ color: TEAL }}>0800 611 116</a>).</li>
          </ul>

          <H2>6. Benefits</H2>
          <ul style={{ fontSize: '.95rem', color: '#1F2937', lineHeight: 1.7, paddingLeft: '1.25rem', margin: '0 0 .75rem' }}>
            <li>No direct benefit to you as an individual participant.</li>
            <li>Aggregate benefit: your submission helps validate a piece of NZ-developed health technology that, if accurate, can improve access to vital-signs monitoring for rural and remote patients across Aotearoa.</li>
            <li>Aggregate results will be published (see §10) so the wider community can see what the study found.</li>
          </ul>

          <H2>7. Privacy, confidentiality, and data storage</H2>
          <ul style={{ fontSize: '.95rem', color: '#1F2937', lineHeight: 1.7, paddingLeft: '1.25rem', margin: '0 0 .75rem' }}>
            <li>Data is stored in Tere Health's Supabase database in Sydney (<code>ap-southeast-2</code>) under an executed Data Processing Addendum.</li>
            <li>Access to the raw study data is restricted to the principal investigator (Dr Herling) and any designated study statistician. Every access is audit-logged in an append-only table.</li>
            <li>No third party will receive individual-level data. Any research collaborator receiving data will receive aggregate statistics only.</li>
          </ul>

          <H2>8. How long is data kept?</H2>
          <P>Anonymous VitalsValidate records are retained for <strong>10 years</strong> from the date of last data addition, in line with the Health (Retention of Health Information) Regulations 1996 as applied to research data. After 10 years the data is permanently deleted.</P>

          <H2>9. Cultural safety and Te Tiriti o Waitangi</H2>
          <P>Tere Health acknowledges its obligations under Te Tiriti o Waitangi and to Māori Data Sovereignty. Specific to VitalsValidate:</P>
          <ul style={{ fontSize: '.95rem', color: '#1F2937', lineHeight: 1.7, paddingLeft: '1.25rem', margin: '0 0 .75rem' }}>
            <li>The demographic set collected does not include ethnicity or iwi affiliation, deliberately, to keep the record fully anonymous. This means we cannot report validation accuracy stratified by ethnicity from this dataset.</li>
            <li>If you are Māori and would like to give feedback about the study or how your community's data is handled, please contact <a href="mailto:hello@terehealth.co.nz" style={{ color: TEAL }}>hello@terehealth.co.nz</a>.</li>
          </ul>

          <H2>10. Publication of results</H2>
          <P>We commit to publishing aggregate results within 12 months of achieving the target sample size. Publication venues under consideration include the New Zealand Medical Journal, peer-reviewed international digital-health journals, and the Tere Health public research page. Because participants are anonymous, results will be made public rather than sent individually.</P>

          <H2>11. Complaints and concerns</H2>
          <P>If you have a question or concern about the study, please contact:</P>
          <P><strong>Dr Patrick Herling</strong> — <a href="mailto:patrickherling@gmail.com" style={{ color: TEAL }}>patrickherling@gmail.com</a><br/>Founding Medical Officer, Tere Health Limited</P>
          <P>If you are not satisfied with the response, you can contact:</P>
          <ul style={{ fontSize: '.95rem', color: '#1F2937', lineHeight: 1.7, paddingLeft: '1.25rem', margin: '0 0 .75rem' }}>
            <li><strong>Health and Disability Commissioner (HDC)</strong> — <a href="tel:0800112233" style={{ color: TEAL }}>0800 11 22 33</a> · <a href="mailto:hdc@hdc.org.nz" style={{ color: TEAL }}>hdc@hdc.org.nz</a></li>
            <li><strong>Health and Disability Ethics Committee (HDEC)</strong> — <a href="mailto:hdecs@health.govt.nz" style={{ color: TEAL }}>hdecs@health.govt.nz</a></li>
            <li><strong>Office of the Privacy Commissioner (OPC)</strong> — <a href="tel:0800803909" style={{ color: TEAL }}>0800 803 909</a> · <a href="mailto:privacy@privacy.org.nz" style={{ color: TEAL }}>privacy@privacy.org.nz</a></li>
          </ul>

          <H2>12. Consent</H2>
          <P>By pressing "Save & start scan" in the app, you confirm that:</P>
          <ul style={{ fontSize: '.95rem', color: '#1F2937', lineHeight: 1.7, paddingLeft: '1.25rem', margin: '0 0 .75rem' }}>
            <li>You have read and understood this information sheet.</li>
            <li>You are aged 18 or over. (VitalsValidate does not recruit minors.)</li>
            <li>You are participating voluntarily.</li>
            <li>You understand you can stop at any time before submitting.</li>
            <li>You understand that once submitted, an individual anonymous record cannot be withdrawn.</li>
            <li>You agree to your anonymous data being used as described above.</li>
          </ul>
          <P muted>There is no financial payment for participation.</P>

          <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #E5E7EB' }}>
            <Link to="/vitals-validate" style={{ display: 'inline-block', background: TEAL, color: 'white', textDecoration: 'none', padding: '.75rem 1.25rem', borderRadius: 99, fontWeight: 700, fontSize: '.95rem', fontFamily: FF }}>
              ← Back to VitalsValidate
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
