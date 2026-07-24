import React from 'react'
import { Link } from 'react-router-dom'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76' }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.5rem', color: BRAND.navy, marginBottom: '.75rem', fontWeight: 700 }}>{title}</h2>
      <div style={{ fontSize: '.9375rem', color: '#374151', lineHeight: 1.8, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{children}</div>
    </div>
  )
}

export default function Terms() {
  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: BRAND.navy, padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.4rem' }}>Tere Health</span>
        </Link>
        <Link to="/start" style={{ background: BRAND.teal, color: 'white', textDecoration: 'none', padding: '7px 16px', borderRadius: 99, fontSize: '.875rem', fontWeight: 700 }}>
          Book consultation
        </Link>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 5vw, 2.75rem)', color: BRAND.navy, marginBottom: '.5rem', fontWeight: 700 }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: '.9rem', color: '#9CA3AF' }}>Last updated: May 2026</p>
        </div>

        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '2.5rem' }}>
          <strong style={{ color: '#991B1B', display: 'block', marginBottom: '.375rem' }}>In an emergency, call 111.</strong>
          <span style={{ fontSize: '.9rem', color: '#7F1D1D' }}>Tere Health is not an emergency service. If your life or someone else's life is at risk, stop and call 111 immediately.</span>
        </div>

        <Section title="1. What Tere Health is">
          <p>Tere Health Limited provides tele-emergency care — emergency medicine consultations by video call, phone, or written message with New Zealand-registered doctors. We serve patients anywhere in New Zealand.</p>
          <p style={{ marginTop: '.75rem' }}>Our service is led by <strong>Dr Rachel Thomas FACEM</strong> (Medical Director, Emergency Medicine). All consultations are conducted under FACEM-led oversight by MCNZ-registered doctors holding current Annual Practising Certificates. The standard of care is equivalent to an in-person emergency medicine consultation, within the limitations of the telehealth modality.</p>
          <p style={{ marginTop: '.75rem' }}>We can issue prescriptions, ACC claims, referrals, and medical certificates where clinically appropriate.</p>
          <p style={{ marginTop: '.75rem' }}><strong>Service is available to patients in New Zealand only.</strong> Consultations are conducted by doctors physically located in New Zealand at the time of the consultation.</p>
          <p style={{ marginTop: '.75rem' }}>Tere Health operates in accordance with the Medical Council of New Zealand's Statement on Telehealth (August 2023).</p>
        </Section>

        <Section title="2. What we are not">
          <p>Tere Health is <strong>not an emergency service</strong> and is not a substitute for emergency care. We do not provide ongoing general practice care or chronic disease management as a primary care provider.</p>
          <p style={{ marginTop: '.75rem' }}>Consultations are provided by independent registered clinicians. Tere Health is the platform operator. The treating clinician is responsible for the clinical care provided.</p>
          <p style={{ marginTop: '.75rem' }}><strong>Tere Health is not suitable for:</strong></p>
          <ul style={{ marginTop: '.375rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.25rem' }}>Chest pain, suspected heart attack, or stroke — call 111</li>
            <li style={{ marginBottom: '.25rem' }}>Difficulty breathing or severe allergic reaction — call 111</li>
            <li style={{ marginBottom: '.25rem' }}>Major trauma, unconsciousness, or severe blood loss — call 111</li>
            <li style={{ marginBottom: '.25rem' }}>Active suicidal crisis — call or text 1737 (mental health support line)</li>
            <li style={{ marginBottom: '.25rem' }}>Suspected poisoning or overdose — call 0800 764 766 (Poisons Centre) or 111</li>
          </ul>
        </Section>

        <Section title="2a. Telehealth limitations — informed consent">
          <p>By using Tere Health, you acknowledge and accept the following limitations of remote consultation:</p>
          <ul style={{ marginTop: '.375rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Your doctor cannot physically examine you — some conditions require in-person assessment</li>
            <li style={{ marginBottom: '.375rem' }}>Diagnoses made via telehealth are based on the information you provide and visible findings only</li>
            <li style={{ marginBottom: '.375rem' }}>Your doctor may determine during or after triage that you need to be seen in person and may refer you to an ED, GP, or specialist</li>
            <li style={{ marginBottom: '.375rem' }}>Controlled drugs (Class A, B, and C) cannot be prescribed via telehealth</li>
            <li style={{ marginBottom: '.375rem' }}>Technical failures (poor internet, video drop) may affect the quality of the consultation — your doctor will advise if a different modality is needed</li>
            <li style={{ marginBottom: '.375rem' }}>Vital signs measured by the Tere Vitals camera function are indicative screening estimates only — not a substitute for medical-grade devices</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>If your video connection drops during a consultation, your doctor will attempt to continue by phone. If the connection cannot be restored, you will receive a full refund.</p>
          <p style={{ marginTop: '.75rem' }}><strong>Physical examination:</strong> Tere Health has established pathways for arranging physical examinations when clinically required. If your presentation requires in-person assessment, your Tere provider will advise you of the most appropriate local service and arrange referral. In an emergency, always call 111.</p>
        </Section>

        <Section title="2b. Prescribing limitations">
          <p>Tere Health doctors can prescribe many common medications via telehealth. However, the following <strong>cannot</strong> be prescribed through this service:</p>
          <ul style={{ marginTop: '.375rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}><strong>Controlled drugs</strong> under the Misuse of Drugs Act 1975 — including opioids (codeine, tramadol, morphine, oxycodone, fentanyl), benzodiazepines (diazepam/Valium, temazepam, alprazolam/Xanax), and stimulants (methylphenidate/Ritalin, dexamphetamine)</li>
            <li style={{ marginBottom: '.375rem' }}><strong>GLP-1 weight loss injections</strong> (semaglutide/Ozempic/Wegovy and similar) — these require specialist-led programmes with ongoing clinical monitoring not available via this telehealth service</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>New Zealand law requires an in-person clinical relationship before controlled drugs may be prescribed. If you need these medications, please consult your GP or a specialist in person. By proceeding with a Tere Health consultation you acknowledge these limitations.</p>
          <p style={{ marginTop: '.75rem' }}>Tere Health doctors can still help with many other medications and will advise you on appropriate alternatives or referral pathways if a requested treatment falls outside what can be provided via telehealth.</p>
        </Section>

        <Section title="3. Payment and fees">
          <p>Consultation fees (all prices in NZ dollars, inclusive of GST):</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}><strong>Consultation:</strong> $60 flat. Video or audio at the doctor's discretion inside the call.</li>
            <li style={{ marginBottom: '.375rem' }}><strong>ACC-eligible consultation:</strong> $20 Tere administrative fee (see Section 5). The consultation itself is billed directly to ACC by Tere and is not charged to you.</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>Payment is processed securely by our payment provider. We do not store your card details.</p>
        </Section>

        <Section title="4. Refund policy">
          <p>You may cancel and receive a full refund at any time before your consultation begins. Once a clinician has opened your consultation and started reviewing your notes, no refund is available — the clinician's time has been committed.</p>
          <p style={{ marginTop: '.75rem' }}>If a clinician determines they cannot assist with your query and closes the consultation without providing care, you will receive a full refund. We exercise this discretion fairly.</p>
        </Section>

        <Section title="5. ACC claims and the $20 administrative fee">
          <p>For injuries eligible under the Accident Compensation Act 2001, Tere Health will file an ACC claim on your behalf at no additional charge. Tere Health is registered with ACC as a specialist telehealth provider and bills the applicable ACC schedule fee (MST1 for an initial consultation, MST3 for a follow-up) directly to ACC. You are not charged for the consultation itself.</p>
          <p style={{ marginTop: '.75rem' }}>A <strong>$20 administrative fee</strong> applies to every ACC-eligible consultation. This fee is separate from and additional to the ACC-covered consultation, and covers services that are not included in the ACC schedule fee:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Access to the Tere Health digital platform, including secure video/audio infrastructure, subtitles in twelve languages, and the patient app.</li>
            <li style={{ marginBottom: '.375rem' }}>Administrative processing of prescriptions, referrals, medical certificates, and pharmacy coordination on your behalf.</li>
            <li style={{ marginBottom: '.375rem' }}>Extended availability &mdash; consultations are offered outside standard business hours, seven days a week.</li>
            <li style={{ marginBottom: '.375rem' }}>SMS and email notifications, including consultation join links, joining reminders, and post-consultation summaries.</li>
            <li style={{ marginBottom: '.375rem' }}>Long-term digital retention of your consultation records for the period required by New Zealand health information law.</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>The $20 fee is disclosed to you at three points before payment: on this Terms page, on our pricing page, and again on the payment screen at time of booking. You may decline any ACC-eligible consultation before booking if you do not wish to pay the administrative fee.</p>
          <p style={{ marginTop: '.75rem' }}>Eligibility for ACC cover is determined by ACC, not by Tere Health. If, after clinical assessment, your presentation is not eligible for ACC cover, the full private consultation fee ($60) applies instead of the $20 administrative fee. Your card will be charged accordingly and this will be shown on your post-consultation billing summary.</p>
        </Section>

        <Section title="6. Your responsibilities">
          <p>By using Tere Health you agree to:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Provide accurate and complete information about your symptoms and medical history</li>
            <li style={{ marginBottom: '.375rem' }}>Consult a clinician only for genuine health concerns</li>
            <li style={{ marginBottom: '.375rem' }}>Not use the platform for emergency situations — call 111 instead</li>
            <li style={{ marginBottom: '.375rem' }}>Follow up with your GP for ongoing or complex conditions</li>
            <li style={{ marginBottom: '.375rem' }}>Be 18 or older, or have parental/guardian consent</li>
          </ul>
        </Section>

        <Section title="7. Privacy">
          <p>We collect and store health information about you to provide the service. Your information is handled in accordance with the Health Information Privacy Code 2020 and the Privacy Act 2020.</p>
          <p style={{ marginTop: '.75rem' }}>With your consent, Tere Health will share a summary of your consultation with your regular GP or health provider. If you do not have a regular provider, we will provide you with a written record of your care. We do not sell or share your health information with third parties for commercial purposes.</p>
          <p style={{ marginTop: '.75rem' }}>View our full <Link to="/privacy" style={{ color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</Link> for details.</p>
        </Section>

        <Section title="8. Recording consent">
          <p>Video and audio consultations may be recorded for clinical quality assurance and training purposes. You will be asked to consent to recording before your consultation begins. You may decline without affecting your access to care.</p>
        </Section>

        <Section title="9. Limitation of liability">
          <p>To the extent permitted by New Zealand law, Tere Health's liability is limited to the amount you paid for the consultation in question. We are not liable for indirect, consequential, or special damages.</p>
          <p style={{ marginTop: '.75rem' }}>Nothing in these terms limits your rights under the Consumer Guarantees Act 1993 or the Fair Trading Act 1986. Under the Consumer Guarantees Act, services must be provided with reasonable care and skill. If we fail to meet this standard, you are entitled to a remedy.</p>
        </Section>

        <Section title="10. Your rights to complain">
          <p>If you are unhappy with your care or our service, you have the right to complain. We take all complaints seriously and will respond within 5 working days.</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}><strong>Email:</strong> <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a></li>
            <li style={{ marginBottom: '.375rem' }}><strong>HDC (independent):</strong> <a href="https://hdc.org.nz/complaints" target="_blank" rel="noreferrer" style={{ color: BRAND.teal }}>hdc.org.nz/complaints</a> · 0800 11 22 33</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Privacy Commissioner:</strong> <a href="https://privacy.org.nz" target="_blank" rel="noreferrer" style={{ color: BRAND.teal }}>privacy.org.nz</a> · 0800 803 909</li>
            <li style={{ marginBottom: '.375rem' }}><strong>MCNZ (doctor conduct):</strong> <a href="https://mcnz.org.nz" target="_blank" rel="noreferrer" style={{ color: BRAND.teal }}>mcnz.org.nz</a> · 0800 286 801</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>See our full <Link to="/complaints" style={{ color: BRAND.teal, fontWeight: 600 }}>Complaints Policy</Link> for more detail.</p>
        </Section>

        <Section title="11. Cancellation and refunds">
          <p>You may cancel and receive a full refund at any time before a clinician has meaningfully begun reviewing your consultation (i.e., before clinical notes have been opened). If you cancel after meaningful clinical review has begun, no refund is available — the clinician's time has been committed.</p>
          <p style={{ marginTop: '.75rem' }}>If a technical failure (dropped video, server error) prevents your consultation from proceeding, you will receive a full refund within 5 working days. Refunds are processed via the original payment method by Stripe, which typically takes 3–5 business days to appear in your account.</p>
          <p style={{ marginTop: '.75rem' }}>If a clinician determines they cannot assist with your query and ends the consultation without providing clinical care, you will receive a full refund.</p>
        </Section>

        <Section title="12. Changes to these terms">
          <p>We may update these terms from time to time. Material changes will be communicated via email if you have an account with us. Continued use of Tere Health after changes are published constitutes acceptance.</p>
        </Section>

        <Section title="13. Governing law and dispute resolution">
          <p>These terms are governed by the laws of New Zealand. Any disputes will be resolved in the courts of New Zealand.</p>
          <p style={{ marginTop: '.75rem' }}>Before commencing formal proceedings, we encourage you to contact us directly. If a dispute cannot be resolved directly, we are happy to engage in mediation. You may also refer fee disputes to the Disputes Tribunal (claims up to NZD 30,000).</p>
        </Section>

        <Section title="14. Mental health and crisis resources">
          <p>If you are experiencing a mental health crisis, please contact:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}><strong>1737</strong> — Free call or text, 24/7 mental health support</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Lifeline:</strong> 0800 543 354</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Youthline:</strong> 0800 376 633</li>
            <li style={{ marginBottom: '.375rem' }}><strong>111</strong> — For immediate risk to life</li>
          </ul>
        </Section>

        <Section title="Contact us">
          <p>Questions about these terms?</p>
          <p style={{ marginTop: '.5rem' }}>
            <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>terehealthnz@gmail.com</a><br />
            <span style={{ color: '#9CA3AF' }}>Tere Health Limited · Marlborough Sounds, New Zealand</span>
          </p>
        </Section>
      </div>

      <footer style={{ background: BRAND.navy, padding: '1.5rem 1.5rem 2rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '.875rem' }}>
          {[['Privacy', '/privacy'], ['Complaints', '/complaints'], ['Home', '/']].map(([label, path]) => (
            <Link key={label} to={path} style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{label}</Link>
          ))}
        </div>
        <div style={{ fontSize: '.75rem', color: 'rgba(212,238,240,.35)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Practising in accordance with MCNZ Telehealth Standards August 2023 · All doctors MCNZ registered with current APC
        </div>
      </footer>
    </div>
  )
}
