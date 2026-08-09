import React from 'react'

// Tere Care — HIPAA Notice of Privacy Practices (NPP).
//
// Required under 45 CFR 164.520. Provided to every patient at or
// before the first delivery of service. This page is what the
// intake-flow HIPAA acknowledgment checkbox references.
//
// This is the CURRENT (v1.0, effective 2026-08-09) version. Any
// material change requires: (a) new effective date, (b) prominent
// notice on the website, (c) provision to existing patients on next
// service delivery.

const EFFECTIVE_DATE = 'August 9, 2026'
const VERSION = '1.0'

const C = {
  ink:    '#0F2029',
  ink2:   '#2A3B44',
  muted:  '#5B6B72',
  cream:  '#FBF7EF',
  cream2: '#F1EADB',
  line:   '#DED6C4',
  teal:   '#1C6E63',
  gold:   '#C9A24A',
}

const Section = ({ title, children }) => (
  <section style={{ marginBottom: '2rem' }}>
    <h2 style={{
      fontFamily: 'Cormorant Garamond, Georgia, serif',
      fontSize: '1.4rem', fontWeight: 500,
      color: C.ink, margin: '0 0 .5rem',
      letterSpacing: '-.005em',
    }}>{title}</h2>
    <div style={{ fontSize: '.95rem', lineHeight: 1.65, color: C.ink2 }}>
      {children}
    </div>
  </section>
)

export default function HipaaNotice() {
  return (
    <div style={{
      minHeight: '100dvh', background: C.cream,
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      color: C.ink, padding: '2rem 1.5rem 4rem',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <a href="/" style={{
          textDecoration: 'none', fontSize: '.85rem',
          color: C.teal, fontWeight: 600,
          display: 'inline-block', marginBottom: '1.5rem',
        }}>← Back to Tere Care</a>

        <header style={{
          borderBottom: `1.5px solid ${C.line}`, paddingBottom: '1.5rem', marginBottom: '2rem',
        }}>
          <div style={{
            fontSize: '.75rem', letterSpacing: '.14em', textTransform: 'uppercase',
            color: C.teal, fontWeight: 700, marginBottom: '.5rem',
          }}>Tere Care · Legal</div>
          <h1 style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 'clamp(2rem, 5vw, 2.75rem)',
            fontWeight: 500, letterSpacing: '-.02em',
            margin: '0 0 .5rem', lineHeight: 1.15,
          }}>
            Notice of Privacy Practices
          </h1>
          <p style={{ fontSize: '.9rem', color: C.muted, margin: 0 }}>
            Version {VERSION} · Effective {EFFECTIVE_DATE}
          </p>
        </header>

        <div style={{
          background: 'rgba(28,110,99,.08)', border: '1px solid rgba(28,110,99,.2)',
          borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '2rem',
          fontSize: '.9rem', lineHeight: 1.6, color: C.ink2,
        }}>
          <strong style={{ color: C.teal }}>Plain-language summary.</strong> This document tells you how Tere Care uses and protects your health information, and what rights you have under U.S. federal law (HIPAA). If anything below is unclear, email us at <a href="mailto:hello@terecare.com" style={{ color: C.teal }}>hello@terecare.com</a>.
        </div>

        <Section title="Who this notice applies to">
          <p>
            This Notice of Privacy Practices describes how <strong>Tere Care</strong> ("we," "us," "our") may use and disclose your <strong>Protected Health Information (PHI)</strong> to carry out treatment, payment, and healthcare operations, and for other purposes permitted or required by law. It also describes your rights to access and control your PHI.
          </p>
          <p>
            We are required by the Health Insurance Portability and Accountability Act (HIPAA), 45 CFR Parts 160 and 164, to maintain the privacy of your PHI, provide you with this notice of our legal duties and privacy practices, and follow the terms of the current notice.
          </p>
        </Section>

        <Section title="What is Protected Health Information (PHI)?">
          <p>
            PHI is any information about your past, present, or future physical or mental health, the care you have received, or the payment for that care, that identifies you or could reasonably be used to identify you. For Tere Care patients, PHI typically includes:
          </p>
          <ul style={{ paddingLeft: '1.25rem', margin: '.5rem 0' }}>
            <li>Your name, date of birth, contact details, and location at the time of your visit</li>
            <li>The reason for your consultation and clinical history you share</li>
            <li>Vital signs, symptoms, and any measurements collected</li>
            <li>Video and audio of the consultation, and clinical notes written by the provider</li>
            <li>Prescriptions issued and pharmacies they are sent to</li>
            <li>Payment information (limited — full card details are handled by Stripe, not stored by us)</li>
          </ul>
        </Section>

        <Section title="How we use and disclose your PHI">
          <p>We use and disclose your PHI for the following purposes without needing your specific written authorization:</p>

          <p style={{ marginTop: '1rem' }}><strong style={{ color: C.ink }}>Treatment.</strong> To provide, coordinate, and manage your healthcare — including the video consultation, clinical decisions, prescriptions, and communications with your regular primary care provider if you request a summary be sent to them.</p>

          <p><strong style={{ color: C.ink }}>Payment.</strong> To process your payment for the consultation. Payment card details are handled by our PCI-compliant payment processor (Stripe); we retain only transaction identifiers.</p>

          <p><strong style={{ color: C.ink }}>Healthcare operations.</strong> Internal quality assurance, provider training and supervision, credentialing, audit, and clinical governance activities.</p>

          <p style={{ marginTop: '1rem' }}>We may also use or disclose your PHI in the following circumstances, as permitted or required by law:</p>
          <ul style={{ paddingLeft: '1.25rem', margin: '.5rem 0' }}>
            <li><strong>Required by law</strong> — for example, mandatory reporting of certain injuries, suspected abuse, or communicable diseases as required by state or federal law</li>
            <li><strong>Public health activities</strong> — to public health authorities authorized by law to collect the information</li>
            <li><strong>Health oversight</strong> — to agencies authorized by law to conduct audits, investigations, licensure actions, or civil / administrative / criminal proceedings</li>
            <li><strong>Judicial and administrative proceedings</strong> — in response to a valid court order, subpoena, or discovery request (with notice to you where required)</li>
            <li><strong>Law enforcement</strong> — as required by law or in response to a valid court order or warrant</li>
            <li><strong>Serious threat to health or safety</strong> — to prevent or lessen a serious and imminent threat to a person or the public</li>
            <li><strong>Coroners, medical examiners, and funeral directors</strong> — where required to carry out their duties</li>
            <li><strong>Workers' compensation</strong> — as authorized by state law</li>
          </ul>
        </Section>

        <Section title="Uses that require your written authorization">
          <p>Except as described above, we will not use or disclose your PHI without your prior written authorization. This includes:</p>
          <ul style={{ paddingLeft: '1.25rem', margin: '.5rem 0' }}>
            <li>Any sale of your PHI</li>
            <li>Use or disclosure for marketing (beyond limited exceptions under HIPAA)</li>
            <li>Most uses or disclosures of psychotherapy notes (if any exist)</li>
          </ul>
          <p>You may revoke any authorization at any time in writing, and we will stop using or disclosing your PHI for that purpose (except to the extent we have already relied on it).</p>
        </Section>

        <Section title="Where your data is stored and who can access it">
          <p>
            Your PHI is stored electronically in encrypted form on cloud infrastructure operated by Amazon Web Services (AWS) in the Sydney (ap-southeast-2) region, and processed by AWS Bedrock (for any AI-assisted features) also in the Sydney region. AWS has signed a Business Associate Agreement (BAA) with Tere Care covering all Tere Care use of AWS services.
          </p>
          <p>
            Access to your PHI within Tere Care is restricted to:
          </p>
          <ul style={{ paddingLeft: '1.25rem', margin: '.5rem 0' }}>
            <li>The clinician providing your consultation</li>
            <li>Clinical supervisors and reviewers as required for quality assurance</li>
            <li>Administrative staff for scheduling, payment, and complaint handling — with role-based restrictions on clinical detail</li>
          </ul>
          <p>
            Every access to your record is logged. We do not sell your PHI to any third party, and we do not use it for advertising.
          </p>
        </Section>

        <Section title="Your rights">
          <p><strong style={{ color: C.ink }}>Right to inspect and copy.</strong> You have the right to inspect or receive a copy of your medical record. We will respond within 30 days.</p>

          <p><strong style={{ color: C.ink }}>Right to request amendment.</strong> If you believe information in your record is incorrect or incomplete, you may request that we amend it. We will respond within 60 days.</p>

          <p><strong style={{ color: C.ink }}>Right to an accounting of disclosures.</strong> You have the right to receive a list of certain disclosures we have made of your PHI outside of treatment, payment, or healthcare operations, going back up to six years.</p>

          <p><strong style={{ color: C.ink }}>Right to request restrictions.</strong> You have the right to request restrictions on our uses or disclosures of your PHI. We are not required to agree to all restrictions, but we will if you pay in full for a service out of pocket and ask us not to disclose that information to a health plan.</p>

          <p><strong style={{ color: C.ink }}>Right to confidential communications.</strong> You have the right to request that we communicate with you in a particular way or at a particular location — for example, only by email, or only to a specific phone number.</p>

          <p><strong style={{ color: C.ink }}>Right to a paper copy of this notice.</strong> You may request a paper copy of this notice at any time, even if you have agreed to receive it electronically.</p>

          <p><strong style={{ color: C.ink }}>Right to notification of a breach.</strong> You have the right to be notified in the event of a breach of unsecured PHI concerning you, in accordance with the HITECH Act and its implementing regulations (60-day notification obligation).</p>
        </Section>

        <Section title="Our duties">
          <p>Tere Care is required by law to:</p>
          <ul style={{ paddingLeft: '1.25rem', margin: '.5rem 0' }}>
            <li>Maintain the privacy and security of your PHI</li>
            <li>Provide you with this notice of our legal duties and privacy practices</li>
            <li>Notify you in the event of a breach of unsecured PHI</li>
            <li>Follow the terms of the current version of this notice</li>
          </ul>
          <p>
            We reserve the right to change the terms of this notice at any time. Any change will apply to all PHI we maintain. When we make a material change, we will post the revised notice prominently on this website and update the effective date at the top of this page.
          </p>
        </Section>

        <Section title="Complaints">
          <p>
            If you believe your privacy rights have been violated, you may file a complaint with us in the first instance. Send complaints in writing to <a href="mailto:hello@terecare.com" style={{ color: C.teal, fontWeight: 600 }}>hello@terecare.com</a>. We will investigate and respond within 30 days.
          </p>
          <p>
            You may also file a complaint with the U.S. Department of Health and Human Services, Office for Civil Rights (HHS OCR):
          </p>
          <ul style={{ paddingLeft: '1.25rem', margin: '.5rem 0' }}>
            <li>Online: <a href="https://ocrportal.hhs.gov/ocr/smartscreen/main.jsf" style={{ color: C.teal }} target="_blank" rel="noopener noreferrer">ocrportal.hhs.gov</a></li>
            <li>Phone: 1-800-368-1019 (TDD 1-800-537-7697)</li>
            <li>Mail: 200 Independence Avenue SW, Room 509F, HHH Building, Washington, DC 20201</li>
          </ul>
          <p>
            We will not retaliate against you for filing a complaint.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            For questions about this notice, requests to exercise your rights, or any privacy concern:
          </p>
          <p style={{ marginTop: '.5rem' }}>
            <strong style={{ color: C.ink }}>Tere Care Privacy Contact</strong><br />
            Email: <a href="mailto:hello@terecare.com" style={{ color: C.teal, fontWeight: 600 }}>hello@terecare.com</a>
          </p>
        </Section>

        <footer style={{
          marginTop: '3rem', paddingTop: '1.5rem',
          borderTop: `1px solid ${C.line}`,
          fontSize: '.8rem', color: C.muted, textAlign: 'center',
        }}>
          Tere Care · Notice of Privacy Practices v{VERSION} · Effective {EFFECTIVE_DATE}
        </footer>
      </div>
    </div>
  )
}
