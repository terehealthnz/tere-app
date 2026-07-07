import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemo, DemoBanner, NarrationBar, ChatShell, Msg } from './DemoShell'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'

const MSGS = {
  intro: [],
  name: [
    { role: 'tere', text: "Kia ora! I'm Tere, your health assistant. What's your full name?" },
    { role: 'user', text: 'James Taitoko' },
  ],
  dob: [
    { role: 'tere', text: "Kia ora! I'm Tere, your health assistant. What's your full name?" },
    { role: 'user', text: 'James Taitoko' },
    { role: 'tere', text: "And your date of birth, James? (e.g. 14 March 1986)" },
    { role: 'user', text: '14 March 1986' },
    { role: 'tere', text: '✓ Checking employer coverage…', highlight: true },
    { role: 'tere', text: '🎉 Great news — your consultation is covered by Sanford Aquaculture. No payment needed.', highlight: true, badge: 'Covered' },
  ],
  contact: [
    { role: 'tere', text: "Kia ora! I'm Tere, your health assistant. What's your full name?" },
    { role: 'user', text: 'James Taitoko' },
    { role: 'tere', text: "And your date of birth, James? (e.g. 14 March 1986)" },
    { role: 'user', text: '14 March 1986' },
    { role: 'tere', text: '🎉 Your consultation is covered by Sanford Aquaculture.', highlight: true, badge: 'Covered' },
    { role: 'tere', text: "What's your mobile number?" },
    { role: 'user', text: '021 555 0183' },
    { role: 'tere', text: "And your email address?" },
    { role: 'user', text: 'james.taitoko@sanford.co.nz' },
  ],
  complaint: [
    { role: 'tere', text: "What's your mobile number?" },
    { role: 'user', text: '021 555 0183' },
    { role: 'tere', text: "And your email address?" },
    { role: 'user', text: 'james.taitoko@sanford.co.nz' },
    { role: 'tere', text: "What brings you to see a doctor today?" },
    { role: 'user', text: 'Twisted my ankle on the barge this morning — really swollen and painful, can hardly put weight on it' },
    { role: 'tere', text: "⚡ This may be an ACC claim. Are you at work or was this a work-related injury?", highlight: true },
    { role: 'user', text: 'Yes, I was working on the barge at Sanford — slipped on the wet deck' },
    { role: 'tere', text: '✓ ACC injury noted. I\'ll make sure your doctor has all the information needed to lodge a claim.', highlight: true },
  ],
  location: [
    { role: 'tere', text: "✓ ACC injury noted — your doctor can lodge the claim directly.", highlight: true },
    { role: 'tere', text: "What's your nearest town or location?" },
    { role: 'user', text: 'Havelock, Marlborough Sounds' },
    { role: 'tere', text: "Do you have any known allergies or regular medications?" },
    { role: 'user', text: "No allergies, no regular meds" },
    { role: 'tere', text: "Thanks James! I've got everything I need. A doctor will review your details and be with you shortly.", highlight: true },
    { role: 'tere', text: "Please keep this screen open. Your doctor will ask you to scan your vital signs when they're ready." },
  ],
}

function IntroScreen() {
  return (
    <div style={{ background: NAVY, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'Plus Jakarta Sans, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: TEAL, opacity: .06, top: -80, right: -80 }} />
      <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: TEAL, opacity: .06, bottom: -50, left: -50 }} />
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '2.4rem', marginBottom: '2.5rem' }}>Tere Health</div>
      <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.75rem', marginBottom: '.375rem' }}>🧑‍🌾</div>
          <div style={{ fontSize: '.65rem', color: 'rgba(212,238,240,.45)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Patient</div>
        </div>
        <div style={{ textAlign: 'center', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: '.25rem' }}>
            {[5,8,11,8,5].map((h, i) => <div key={i} style={{ width: 3, height: h, background: TEAL, borderRadius: 1 }} />)}
          </div>
          <div style={{ fontSize: '.6rem', color: 'rgba(11,110,118,.7)', letterSpacing: '.05em' }}>SECURE</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.75rem', marginBottom: '.375rem' }}>👨‍⚕️</div>
          <div style={{ fontSize: '.65rem', color: 'rgba(212,238,240,.45)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Doctor</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '2rem', width: '100%', maxWidth: 280 }}>
        {['Chat with Tere AI','Scan your vitals','See a doctor, fast'].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.625rem', color: 'rgba(212,238,240,.7)', fontSize: '.875rem' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(11,110,118,.3)', border: '1px solid rgba(11,110,118,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', color: '#D4EEF0', fontWeight: 700, flexShrink: 0 }}>{i+1}</div>
            {s}
          </div>
        ))}
      </div>
      <button style={{ background: TEAL, color: 'white', border: 'none', padding: '.8rem 2.25rem', borderRadius: 50, fontSize: '.9375rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        Get started →
      </button>
    </div>
  )
}

function VitalsScan() {
  return (
    <div style={{ background: '#0D1117', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: 'rgba(0,0,0,.4)', padding: '.875rem 1rem', flexShrink: 0 }}>
        <div style={{ color: '#D4EEF0', fontWeight: 700, fontSize: '.9375rem' }}>Tere Vitals™</div>
        <div style={{ color: 'rgba(212,238,240,.4)', fontSize: '.75rem' }}>30-second facial scan · indicative screening only</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div style={{ position: 'relative', width: 160, height: 160, marginBottom: '1.5rem' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${TEAL}`, opacity: .3, animation: 'ping 2s infinite' }} />
          <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: `2px solid ${TEAL}`, opacity: .5 }} />
          <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', background: 'rgba(11,110,118,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem' }}>
            😊
          </div>
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: '#22C55E', color: 'white', borderRadius: 99, padding: '2px 8px', fontSize: '.65rem', fontWeight: 700 }}>SCANNING</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', width: '100%', maxWidth: 280 }}>
          {[
            { label: 'Heart Rate', value: '72', unit: 'bpm', color: '#22C55E' },
            { label: 'SpO₂', value: '98', unit: '%', color: '#22C55E' },
            { label: 'Resp. Rate', value: '16', unit: '/min', color: '#22C55E' },
            { label: 'Confidence', value: '94', unit: '%', color: TEAL },
          ].map(({ label, value, unit, color }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: '.75rem', textAlign: 'center', border: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.25rem' }}>{label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.3)' }}>{unit}</div>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes ping{75%,100%{transform:scale(1.4);opacity:0}}`}</style>
    </div>
  )
}

function ConsultTypeScreen() {
  return (
    <div style={{ background: '#F8FAFC', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: NAVY, padding: '.875rem 1rem', flexShrink: 0 }}>
        <div style={{ color: '#D4EEF0', fontWeight: 700, fontSize: '.9375rem' }}>Choose consultation type</div>
        <div style={{ color: 'rgba(212,238,240,.4)', fontSize: '.75rem' }}>James Taitoko · Ankle injury</div>
      </div>
      <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
        <div style={{ background: '#D1FAE5', border: '1.5px solid #6EE7B7', borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.875rem', color: '#065F46', fontWeight: 600 }}>
          🎉 Covered by Sanford Aquaculture — no payment required
        </div>
        {[
          { icon: '📹', type: 'Video', desc: 'Face-to-face with your doctor via encrypted video call', price: 'Covered', recommended: true },
          { icon: '📞', type: 'Phone', desc: 'Audio-only consultation', price: 'Covered', recommended: false },
          { icon: '💬', type: 'Message', desc: 'Send a message and receive a written response', price: 'Covered', recommended: false },
        ].map(({ icon, type, desc, price, recommended }) => (
          <div key={type} style={{ background: 'white', border: `2px solid ${recommended ? TEAL : '#E5E7EB'}`, borderRadius: 12, padding: '1rem', marginBottom: '.75rem', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{icon}</span>
                <span style={{ fontWeight: 700, fontSize: '.9375rem', color: '#111' }}>{type}</span>
                {recommended && <span style={{ background: TEAL + '20', color: TEAL, fontSize: '.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>Recommended</span>}
              </div>
              <span style={{ fontWeight: 700, color: '#059669', fontSize: '.875rem' }}>{price}</span>
            </div>
            <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>{desc}</div>
            {recommended && <div style={{ marginTop: '.625rem', background: TEAL, color: 'white', textAlign: 'center', borderRadius: 8, padding: '.5rem', fontSize: '.875rem', fontWeight: 700 }}>Continue with Video — Covered →</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function WaitingScreen() {
  return (
    <div style={{ background: '#F8FAFC', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: NAVY, padding: '.875rem 1rem', flexShrink: 0 }}>
        <div style={{ color: '#D4EEF0', fontWeight: 700, fontSize: '.9375rem' }}>Tere Health</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ position: 'relative', width: 80, height: 80, marginBottom: '1.5rem' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${TEAL}`, opacity: .4, animation: 'ping 1.5s infinite' }} />
          <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', background: TEAL + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem' }}>🩺</div>
        </div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#111', marginBottom: '.5rem', textAlign: 'center' }}>Your doctor will be with you shortly</div>
        <div style={{ color: '#6B7280', fontSize: '.875rem', textAlign: 'center', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Hi James, you're in the queue. Dr Herling has received your details and vital signs.
        </div>
        <div style={{ background: 'white', borderRadius: 12, padding: '1rem', border: '1px solid #E5E7EB', width: '100%', maxWidth: 300 }}>
          <div style={{ fontWeight: 700, fontSize: '.875rem', marginBottom: '.5rem' }}>While you wait:</div>
          {['Camera and microphone are working', 'Find a quiet, well-lit space', 'Video will start automatically on this screen'].map(tip => (
            <div key={tip} style={{ display: 'flex', gap: '.5rem', fontSize: '.8125rem', color: '#374151', marginBottom: '.375rem' }}>
              <span style={{ color: TEAL, flexShrink: 0 }}>✓</span>{tip}
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem', color: '#9CA3AF', fontSize: '.8125rem' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #9CA3AF', borderTopColor: TEAL, animation: 'spin .8s linear infinite' }} />
          Waiting for Dr Herling…
        </div>
      </div>
      <style>{`@keyframes ping{75%,100%{transform:scale(1.5);opacity:0}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

const STEPS = [
  {
    title: 'Patient opens the Tere app',
    narration: 'James Taitoko, a mussel farmer on the Pelorus Sound, opens Tere Health on his phone after injuring his ankle on the barge.',
    screen: <IntroScreen />,
  },
  {
    title: 'Tere AI introduces itself',
    narration: 'Tere greets James in plain English. He types his name — the AI picks up the first step of the intake process.',
    screen: <ChatShell messages={MSGS.name} inputValue="" />,
  },
  {
    title: 'Employer coverage detected',
    narration: "James enters his date of birth. Tere checks Sanford Aquaculture's employee list in real time — James is covered. No payment needed.",
    screen: <ChatShell messages={MSGS.dob} inputValue="" />,
  },
  {
    title: 'Contact details collected',
    narration: 'Tere collects phone and email. The whole intake takes under two minutes — no forms, no PDFs, just a conversation.',
    screen: <ChatShell messages={MSGS.contact} inputValue="" />,
  },
  {
    title: 'Complaint & ACC flag',
    narration: "James describes his ankle injury. Tere detects it's a work accident and flags ACC eligibility automatically — the doctor will have everything ready.",
    screen: <ChatShell messages={MSGS.complaint} inputValue="" />,
  },
  {
    title: 'Location & booking confirmed',
    narration: 'James confirms his location — Havelock, Marlborough Sounds. Tere wraps up intake and puts him in the queue.',
    screen: <ChatShell messages={MSGS.location} inputValue="" />,
  },
  {
    title: 'Vital signs scan',
    narration: "Tere Vitals™ uses the phone camera to estimate heart rate, SpO₂, and respiratory rate. Takes 30 seconds. The doctor sees these before the call starts.",
    screen: <VitalsScan />,
  },
  {
    title: 'Consultation type',
    narration: "James chooses video — the recommended option. Because he's a Sanford employee, the consultation is fully covered. No payment screen.",
    screen: <ConsultTypeScreen />,
  },
  {
    title: 'Waiting for the doctor',
    narration: 'James is in the queue. The video call will start automatically on this screen when Dr Herling admits him. No app download required.',
    screen: <WaitingScreen />,
  },
]

export default function DemoPatient() {
  const navigate = useNavigate()
  const { step, auto, setAuto, next, prev, progress } = useDemo(STEPS.length)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <DemoBanner />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Phone frame */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#E8EBF0' }}>
          <div style={{ width: 360, maxWidth: '100%', height: 680, maxHeight: 'calc(100vh - 260px)', borderRadius: 32, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.25), 0 0 0 8px #1F2937, 0 0 0 10px #374151', display: 'flex', flexDirection: 'column' }}>
            {STEPS[step].screen}
          </div>
        </div>
      </div>

      <NarrationBar
        step={step} total={STEPS.length}
        title={STEPS[step].title} narration={STEPS[step].narration}
        onPrev={prev} onNext={next}
        auto={auto} onToggleAuto={() => setAuto(a => !a)}
        progress={progress}
      />

      <button onClick={() => navigate('/demo')} style={{ position: 'fixed', top: 36, left: '1rem', background: 'rgba(0,0,0,.4)', border: 'none', color: 'white', padding: '5px 12px', borderRadius: 99, fontSize: '.75rem', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        ← Demo home
      </button>
    </div>
  )
}
