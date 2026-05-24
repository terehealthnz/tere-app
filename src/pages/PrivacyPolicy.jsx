import React from 'react'
import { Link } from 'react-router-dom'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76' }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.375rem', color: BRAND.navy, marginBottom: '.625rem', fontWeight: 700 }}>{title}</h2>
      <div style={{ fontSize: '.9375rem', color: '#374151', lineHeight: 1.8, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{children}</div>
    </div>
  )
}

function Rule({ num, title, content }) {
  return (
    <div style={{ borderRadius: 8, border: '1px solid #E2E8F0', padding: '.875rem 1rem', marginBottom: '.5rem', background: 'white' }}>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#EFF9F9', color: BRAND.teal, fontWeight: 700, fontSize: '.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{num}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '.875rem', color: BRAND.navy, marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.55 }}>{content}</div>
        </div>
      </div>
    </div>
  )
}

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: BRAND.navy, padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.4rem' }}>Tere Health</span>
        </Link>
        <Link to="/triage" style={{ background: BRAND.teal, color: 'white', textDecoration: 'none', padding: '7px 16px', borderRadius: 99, fontSize: '.875rem', fontWeight: 700 }}>
          Book consultation
        </Link>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 5vw, 2.75rem)', color: BRAND.navy, marginBottom: '.5rem', fontWeight: 700 }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: '.875rem', color: '#9CA3AF' }}>Tere Health Limited · Version 2.0 · Last updated: May 2026</p>
        </div>

        <div style={{ background: '#EFF9F9', border: '1px solid #0B6E76', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '2.5rem' }}>
          <strong style={{ color: BRAND.navy, display: 'block', marginBottom: '.375rem' }}>Plain-language summary</strong>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '.9rem', color: '#374151', lineHeight: 1.8 }}>
            <li>We collect your health information to provide your consultation — nothing else</li>
            <li>Your information is never sold or used for advertising</li>
            <li>Only your doctor and authorised Tere staff can see your records</li>
            <li>You can access, correct, or request deletion of your information at any time</li>
            <li>Records are kept for 10 years as required by NZ law, then securely deleted</li>
            <li>You can complain to us, the Privacy Commissioner, or the HDC at any time</li>
          </ul>
        </div>

        <Section title="1. Who we are">
          <p><strong>Tere Health Limited</strong> is a New Zealand telehealth company. We provide acute telehealth consultations via video, phone, and written message.</p>
          <p style={{ marginTop: '.75rem' }}><strong>Privacy Officer:</strong> Patrick Herling<br />
          <strong>Email:</strong> <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a><br />
          <strong>General:</strong> <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal }}>terehealthnz@gmail.com</a><br />
          <strong>Address:</strong> Tere Health Limited, Marlborough Sounds, New Zealand</p>
        </Section>

        <Section title="2. Health Information Privacy Code 2020 — How we comply">
          <p style={{ marginBottom: '.875rem' }}>We handle your health information in accordance with the Health Information Privacy Code 2020 (HIPC 2020) and the Privacy Act 2020. The 12 rules of the Code and how we apply them:</p>
          <Rule num="1" title="Purpose of collection" content="We collect health information solely to provide your telehealth consultation, prepare your doctor, generate clinical records, lodge ACC claims, arrange prescriptions and referrals, and notify you when care is available. We tell you the purpose before collecting your information." />
          <Rule num="2" title="Source of information" content="We collect health information directly from you during triage and consultation. We may also receive information from your GP or previous provider if you consent to this." />
          <Rule num="3" title="Collection from individual" content="Before you provide health information, we tell you what we collect, why we collect it, who can access it, and your rights. This is disclosed at the start of your consultation." />
          <Rule num="4" title="Manner of collection" content="We do not collect information by unlawful, unfair, or intrusive means. We do not use misleading forms or deceptive practices." />
          <Rule num="5" title="Storage and security" content="All health data is stored in an encrypted database (AES-256 at rest, TLS 1.3 in transit) hosted in Sydney, Australia by Supabase. Video is end-to-end encrypted via LiveKit WebRTC. Access is restricted to authorised staff only." />
          <Rule num="6" title="Access to your information" content="You have the right to access your health records held by Tere Health. Email terehealthnz@gmail.com. We will respond within 20 working days. Your consultation summary is available via a secure link sent after your consultation." />
          <Rule num="7" title="Correction" content="If you believe information we hold about you is incorrect, you have the right to request a correction. We will correct errors promptly or attach a note of disagreement if we do not agree with the requested correction." />
          <Rule num="8" title="Accuracy" content="We take reasonable steps to ensure health information is accurate, up to date, complete, and not misleading. Clinical notes are prepared by a registered doctor and reviewed before finalisation." />
          <Rule num="9" title="Retention" content="Health records are retained for a minimum of 10 years from the date of last consultation in accordance with the Health (Retention of Health Information) Regulations 1996. After the retention period, records are securely deleted. Anonymised analytics data is deleted after 24 months." />
          <Rule num="10" title="Limits on use" content="Your health information is used only for the purposes for which it was collected (your care). We do not use it for research, marketing, or any secondary purpose without your explicit consent." />
          <Rule num="11" title="Limits on disclosure" content="We disclose health information only to: your treating clinician; pharmacies (for prescriptions); ACC (for accident claims); radiology providers (for referrals); your GP (if you request it or it is clinically necessary); and where required by law. We never sell health data." />
          <Rule num="12" title="Unique identifiers" content="We collect your NHI (National Health Index) number to accurately identify your health records. We use NHI only for health care purposes and do not assign or use other unique identifiers beyond what is necessary." />
        </Section>

        <Section title="3. What we collect">
          <p>We collect the following categories of information:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}><strong>Identity:</strong> Name, date of birth, NHI number</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Contact:</strong> Email address, phone number</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Location:</strong> General area (for ACC and emergency referral purposes)</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Health:</strong> Symptoms, medical history, medications, allergies, photos (if provided), vital signs</li>
            <li style={{ marginBottom: '.375rem' }}><strong>ACC:</strong> Employer name, injury details, injury date and mechanism</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Clinical:</strong> Consultation notes, prescriptions, referrals, medical certificates</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Payment:</strong> Transaction records (card details are held by Stripe — we do not store card numbers)</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Technical:</strong> Device type, browser, session ID (anonymised — no IP address linked to health data)</li>
          </ul>
        </Section>

        <Section title="4. AI and automated processing">
          <p>Tere Health uses AI to assist with:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Initial triage — AI guides you through symptom questions</li>
            <li style={{ marginBottom: '.375rem' }}>Clinical note-taking — AI transcribes and drafts consultation notes for the doctor to review</li>
            <li style={{ marginBottom: '.375rem' }}>Drug interaction checking — AI checks prescribed medications against known interactions</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}><strong>No clinical decision is made by AI without a registered doctor reviewing and approving it.</strong> The treating doctor is always responsible for your care.</p>
          <p style={{ marginTop: '.75rem' }}>AI transcription occurs on consultation recordings. You will be asked to consent to recording before your consultation begins. You may decline without affecting your access to care. Recordings are deleted after clinical notes are finalised (within 48 hours).</p>
        </Section>

        <Section title="5. Tere Vitals — Indicative screening only">
          <p>The Tere Vitals camera-based vital signs function uses your smartphone camera to estimate heart rate and breathing rate.</p>
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '.875rem 1rem', marginTop: '.75rem' }}>
            <strong style={{ color: '#92400E' }}>Important:</strong>
            <span style={{ color: '#92400E', fontSize: '.9rem' }}> Tere Vitals provides indicative screening estimates only. Results are not a substitute for medical-grade devices and must be interpreted by a registered clinician. Do not make clinical decisions based solely on Tere Vitals readings.</span>
          </div>
          <p style={{ marginTop: '.75rem' }}>Vital signs data is used only for your consultation and is stored as part of your clinical record. It is not used for research or benchmarking without your consent.</p>
        </Section>

        <Section title="6. Overseas storage">
          <p>Your health information is stored in Sydney, Australia using Supabase (built on AWS). Australia has comparable privacy protections to New Zealand and is considered an approved jurisdiction under the Privacy Act 2020 for health data storage.</p>
          <p style={{ marginTop: '.75rem' }}>Data transferred to or processed by third parties (Stripe, LiveKit, Resend) is subject to data processing agreements requiring them to maintain equivalent security and privacy standards.</p>
        </Section>

        <Section title="7. Data retention and deletion">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem', marginTop: '.5rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Data type</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Retention period</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Clinical consultation records', '10 years (HIRC Regulations 1996)'],
                ['Prescriptions', '10 years'],
                ['ACC claim records', '10 years'],
                ['Consultation recordings', 'Deleted within 48 hours of note finalisation'],
                ['Payment transaction records', '7 years (tax compliance)'],
                ['Consent records', '10 years'],
                ['Anonymised analytics', '24 months'],
                ['Session cookies', 'Deleted when browser closed'],
              ].map(([type, period]) => (
                <tr key={type} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '7px 8px', color: '#374151' }}>{type}</td>
                  <td style={{ padding: '7px 8px', color: '#6B7280' }}>{period}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: '.75rem', fontSize: '.875rem', color: '#6B7280' }}>After the retention period, data is securely deleted using industry-standard deletion methods.</p>
        </Section>

        <Section title="8. Cookies and analytics">
          <p>Tere Health uses the following:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.5rem' }}><strong>Session storage (not cookies):</strong> We use browser sessionStorage to hold your consultation progress. This is deleted when you close your browser tab. No personal information is stored in sessionStorage.</li>
            <li style={{ marginBottom: '.5rem' }}><strong>Anonymous analytics:</strong> We track anonymised funnel events (e.g., "triage started", "consultation completed") using a random session ID. No name, NHI, or health information is linked to analytics data.</li>
            <li style={{ marginBottom: '.5rem' }}><strong>No advertising cookies:</strong> We do not use advertising, tracking, or third-party analytics cookies.</li>
            <li style={{ marginBottom: '.5rem' }}><strong>Stripe:</strong> Payment processing may set cookies for fraud prevention. See <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer" style={{ color: BRAND.teal }}>stripe.com/privacy</a>.</li>
          </ul>
        </Section>

        <Section title="9. Data breach notification">
          <p>If a data breach occurs that is likely to cause serious harm to you, we will:</p>
          <ol style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Notify the Office of the Privacy Commissioner as soon as practicable (within 72 hours of discovery)</li>
            <li style={{ marginBottom: '.375rem' }}>Notify you directly within 10 working days of confirming the breach</li>
            <li style={{ marginBottom: '.375rem' }}>Tell you what information was affected, how it happened, and what we are doing to fix it</li>
            <li style={{ marginBottom: '.375rem' }}>Take immediate steps to contain and remediate the breach</li>
          </ol>
          <p style={{ marginTop: '.75rem' }}>To report a suspected breach: <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a></p>
        </Section>

        <Section title="10. Your rights">
          <p>Under the Privacy Act 2020 and Health Information Privacy Code 2020, you have the right to:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}><strong>Access</strong> your health information — email us and we will respond within 20 working days</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Correct</strong> information you believe is wrong or incomplete</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Request deletion</strong> of your information (subject to our retention obligations)</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Withdraw consent</strong> to recording or AI processing at any time</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Complain</strong> about how we handle your information</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>Contact our Privacy Officer: <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a></p>
        </Section>

        <Section title="11. How to complain about privacy">
          <p>If you are unhappy with how we handle your information, contact our Privacy Officer first. If you are not satisfied with our response, you may contact:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}><strong>Office of the Privacy Commissioner:</strong> <a href="https://privacy.org.nz" target="_blank" rel="noreferrer" style={{ color: BRAND.teal }}>privacy.org.nz</a> · 0800 803 909</li>
            <li style={{ marginBottom: '.375rem' }}><strong>Health and Disability Commissioner:</strong> <a href="https://hdc.org.nz" target="_blank" rel="noreferrer" style={{ color: BRAND.teal }}>hdc.org.nz</a> · 0800 11 22 33</li>
          </ul>
        </Section>

        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
          <p style={{ fontSize: '.8125rem', color: '#9CA3AF' }}>
            <strong style={{ color: '#6B7280' }}>Tere Health Limited</strong> · Marlborough Sounds, New Zealand ·{' '}
            <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal }}>terehealthnz@gmail.com</a>
          </p>
          <p style={{ fontSize: '.8125rem', color: '#9CA3AF', marginTop: '.25rem', fontStyle: 'italic' }}>He tere, he ora — swift action, healthy lives.</p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <Link to="/terms" style={{ color: BRAND.teal, textDecoration: 'none', fontSize: '.875rem', fontWeight: 600 }}>Terms of Service</Link>
          <Link to="/complaints" style={{ color: BRAND.teal, textDecoration: 'none', fontSize: '.875rem', fontWeight: 600 }}>Complaints</Link>
          <Link to="/accessibility" style={{ color: BRAND.teal, textDecoration: 'none', fontSize: '.875rem', fontWeight: 600 }}>Accessibility</Link>
        </div>
      </div>

      <footer style={{ background: BRAND.navy, padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['Home', '/'], ['Terms', '/terms'], ['Complaints', '/complaints'], ['Accessibility', '/accessibility']].map(([label, path]) => (
            <Link key={label} to={path} style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.875rem' }}>{label}</Link>
          ))}
        </div>
      </footer>
    </div>
  )
}
