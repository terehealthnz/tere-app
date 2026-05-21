import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemo, DemoBanner, NarrationBar } from './DemoShell'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'

function Badge({ label, color = TEAL }) {
  return <span style={{ background: color + '20', color, fontSize: '.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>{label}</span>
}

function QueueScreen({ highlighted }) {
  const patients = [
    { name: 'James Taitoko', complaint: 'Twisted ankle on the barge this morning', location: 'Havelock, Marlborough Sounds', wait: '4m ago', status: 'Vitals ready', statusColor: TEAL, acc: true, vitals: { hr: 72, rr: 16 }, highlight: highlighted },
    { name: 'Aroha Williams', complaint: 'Child with fever 38.9°C for 2 days', location: 'Picton', wait: '12m ago', status: 'Waiting', statusColor: '#D97706', acc: false, vitals: null },
    { name: 'Colin McRae', complaint: 'Chest tightness after exertion', location: 'Blenheim', wait: '18m ago', status: 'Waiting', statusColor: '#D97706', acc: false, vitals: null },
  ]
  return (
    <div style={{ background: '#F8FAFC', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: NAVY, padding: '.875rem 1rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.2rem' }}>Tere</div>
          <div style={{ display: 'flex', align: 'center', gap: '.5rem' }}>
            <div style={{ background: '#22C55E20', border: '1px solid #22C55E', borderRadius: 99, padding: '3px 10px', fontSize: '.7rem', color: '#22C55E', fontWeight: 700 }}>● Available</div>
            <div style={{ color: 'rgba(212,238,240,.5)', fontSize: '.8rem' }}>Dr Herling</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '.875rem', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: '.875rem', color: '#111', marginBottom: '.625rem' }}>Patient queue · {patients.length} waiting</div>
        {patients.map((p, i) => (
          <div key={i} style={{ background: 'white', border: `2px solid ${p.highlight ? TEAL : '#E5E7EB'}`, borderLeft: `4px solid ${p.statusColor}`, borderRadius: 10, padding: '.875rem', marginBottom: '.625rem', boxShadow: p.highlight ? `0 0 0 3px ${TEAL}30` : 'none', transition: 'all .3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.375rem' }}>
              <span style={{ fontWeight: 700, fontSize: '.9375rem' }}>{p.name}</span>
              <Badge label={p.status} color={p.statusColor} />
              {p.acc && <Badge label="ACC" color="#7C3AED" />}
            </div>
            <div style={{ fontSize: '.8125rem', color: '#374151', marginBottom: '.25rem' }}>{p.complaint}</div>
            <div style={{ display: 'flex', gap: '.875rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.75rem', color: '#9CA3AF' }}>📍 {p.location}</span>
              <span style={{ fontSize: '.75rem', color: '#9CA3AF' }}>🕒 {p.wait}</span>
              {p.vitals && <span style={{ fontSize: '.75rem', color: '#22C55E', fontWeight: 600 }}>❤️ {p.vitals.hr} bpm · 🫁 {p.vitals.rr}/min</span>}
            </div>
            {p.highlight && (
              <button style={{ marginTop: '.625rem', background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Start consultation →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ConsultScreen({ phase }) {
  const vitalsReady = ['vitals', 'admit', 'call', 'notes', 'finalise'].includes(phase)
  const admitted = ['admit', 'call', 'notes', 'finalise'].includes(phase)
  const inCall = ['call', 'notes', 'finalise'].includes(phase)

  const soapNotes = phase === 'notes' || phase === 'finalise' ? {
    S: 'James Taitoko, 38yo male, right ankle injury. Slipped on wet barge deck while working at Sanford Aquaculture this morning. Reports immediate pain and swelling. Unable to weight-bear fully.',
    O: `Vitals (Tere rPPG): HR 72 bpm, RR 16 br/min, SpO₂ 98%.\nRight ankle: swelling and tenderness over lateral malleolus. Ottawa ankle rules: positive — bony tenderness on posterior lateral malleolus.`,
    A: 'Suspected lateral malleolus fracture. Ottawa rules positive. ACC-eligible workplace injury.',
    P: 'ACC45 lodged. X-ray referral to Marlborough Medical Imaging (urgent, within 24 hours). Analgesia: Ibuprofen 400mg TDS with food x 5 days. RICE. Review in 48 hours or sooner if worsening.',
  } : null

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '200px 1fr', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {/* Left panel */}
      <div style={{ background: 'white', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ background: NAVY, padding: '.75rem' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1rem' }}>Tere</div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: '.8125rem', marginTop: '.25rem' }}>James Taitoko</div>
          <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.7rem' }}>Twisted ankle · ACC</div>
        </div>
        <div style={{ padding: '.75rem', fontSize: '.75rem', flex: 1, overflowY: 'auto' }}>
          {[['NHI', 'ZKJ7823'], ['DOB', '14 Mar 1986'], ['Location', 'Havelock'], ['ACC', '✓ Eligible'], ['Employer', 'Sanford'], ['Allergies', 'None']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
              <span style={{ color: '#9CA3AF' }}>{k}</span>
              <span style={{ fontWeight: 500, color: k === 'ACC' ? '#059669' : '#111' }}>{v}</span>
            </div>
          ))}
          {vitalsReady && (
            <div style={{ marginTop: '.5rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '.5rem' }}>
              <div style={{ fontSize: '.65rem', fontWeight: 700, color: '#059669', marginBottom: '.25rem', textTransform: 'uppercase' }}>Vitals received</div>
              {[['HR', '72 bpm'], ['RR', '16/min'], ['SpO₂', '98%']].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem' }}>
                  <span style={{ color: '#6B7280' }}>{l}</span><span style={{ fontWeight: 700, color: '#059669' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
          {!vitalsReady && (
            <div style={{ marginTop: '.5rem', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '.5rem', fontSize: '.7rem', color: '#92400E' }}>
              ⏳ Waiting for vitals scan…
            </div>
          )}
          {vitalsReady && !admitted && (
            <button style={{ marginTop: '.5rem', width: '100%', background: TEAL, color: 'white', border: 'none', borderRadius: 6, padding: '7px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              ✓ Vitals confirmed
            </button>
          )}
          {admitted && !inCall && (
            <button style={{ marginTop: '.375rem', width: '100%', background: '#065F46', color: 'white', border: 'none', borderRadius: 6, padding: '7px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Admit patient →
            </button>
          )}
          {inCall && soapNotes && (
            <div style={{ marginTop: '.5rem' }}>
              {['S','O','A','P'].map(k => (
                <div key={k} style={{ marginBottom: '.375rem' }}>
                  <div style={{ fontSize: '.65rem', fontWeight: 700, color: TEAL, textTransform: 'uppercase', marginBottom: 2 }}>{k} {phase === 'notes' ? <span style={{ background: '#D1FAE5', color: '#059669', padding: '0 4px', borderRadius: 4, fontWeight: 600 }}>AI draft</span> : ''}</div>
                  <div style={{ fontSize: '.65rem', color: '#374151', lineHeight: 1.4, background: '#F0FDF4', borderRadius: 4, padding: '3px 5px', border: '1px solid #BBF7D0' }}>{soapNotes[k].slice(0, 60)}…</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '.5rem', borderTop: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <button style={{ background: '#EDE9FE', color: '#5B21B6', border: 'none', padding: '6px', borderRadius: 6, fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>💊 Rx</button>
          <button style={{ background: '#FEF3C7', color: '#92400E', border: 'none', padding: '6px', borderRadius: 6, fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>🩻 XR</button>
          <button style={{ background: '#D1FAE5', color: '#065F46', border: 'none', padding: '6px', borderRadius: 6, fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', gridColumn: '1/-1' }}>✓ ACC</button>
        </div>
      </div>

      {/* Right panel — video */}
      <div style={{ background: '#0D1117', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '5px .875rem', background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: inCall ? '#22C55E' : '#6B7280' }} />
          <span style={{ color: 'rgba(255,255,255,.6)', fontSize: '.75rem' }}>Tere Video · LiveKit WebRTC · encrypted</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '.75rem', padding: '1rem' }}>
          {inCall ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', width: '100%' }}>
                <div style={{ background: '#1a1f2e', borderRadius: 10, aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', position: 'relative' }}>
                  🧑‍🌾
                  <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,.6)', color: 'white', fontSize: '.6rem', padding: '2px 6px', borderRadius: 4 }}>James Taitoko</div>
                </div>
                <div style={{ background: '#1a1f2e', borderRadius: 10, aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', position: 'relative' }}>
                  👨‍⚕️
                  <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,.6)', color: 'white', fontSize: '.6rem', padding: '2px 6px', borderRadius: 4 }}>Dr Herling</div>
                </div>
              </div>
              {phase === 'notes' && (
                <div style={{ background: 'rgba(11,110,118,.2)', border: '1px solid rgba(11,110,118,.4)', borderRadius: 8, padding: '.5rem .875rem', width: '100%', textAlign: 'center' }}>
                  <div style={{ color: '#D4EEF0', fontSize: '.75rem', fontWeight: 600 }}>🎙 Tere Scribe — generating notes…</div>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: '.375rem' }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: TEAL, animation: `bounce .6s ${i*.15}s infinite` }} />)}
                  </div>
                </div>
              )}
              {phase === 'finalise' && (
                <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 8, padding: '.5rem .875rem', width: '100%', textAlign: 'center' }}>
                  <div style={{ color: '#065F46', fontSize: '.75rem', fontWeight: 700 }}>✓ Notes complete — ready to finalise</div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.3)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📹</div>
              <div style={{ fontSize: '.8125rem' }}>{admitted ? 'Patient joining…' : 'Video room ready'}</div>
            </div>
          )}
        </div>
        <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}`}</style>
      </div>
    </div>
  )
}

const STEPS = [
  {
    title: 'Provider dashboard — patient queue',
    narration: 'Dr Herling opens the dashboard. Three patients are waiting. James Taitoko is at the top — vitals complete, ACC flagged.',
    screen: <QueueScreen highlighted={false} />,
  },
  {
    title: 'James Taitoko highlighted — vitals ready',
    narration: 'Tere highlights the next patient automatically. Vitals are shown on the card — HR 72, RR 16 — before the call even starts.',
    screen: <QueueScreen highlighted={true} />,
  },
  {
    title: 'ConsultView opens — waiting for vitals',
    narration: "Dr Herling clicks 'Start'. The consultation view opens showing patient history, ACC details, allergies, and a prompt to wait for the vitals scan.",
    screen: <ConsultScreen phase="waiting" />,
  },
  {
    title: 'Vitals received from patient',
    narration: "James completes his 30-second scan. The results appear live in the panel — HR 72, RR 16, SpO₂ 98%. Dr Herling reviews and confirms.",
    screen: <ConsultScreen phase="vitals" />,
  },
  {
    title: 'Patient admitted to video call',
    narration: "Dr Herling clicks 'Admit patient'. The LiveKit encrypted video room starts. James's screen automatically switches to the video call.",
    screen: <ConsultScreen phase="admit" />,
  },
  {
    title: 'Live encrypted video consultation',
    narration: "Both parties are connected via LiveKit WebRTC — end-to-end encrypted. Dr Herling can prescribe, order X-rays, or lodge an ACC claim from the action buttons.",
    screen: <ConsultScreen phase="call" />,
  },
  {
    title: 'Tere Scribe generating notes',
    narration: "Dr Herling clicks 'Stop' on the AI Scribe. The consultation audio is transcribed and SOAP notes are generated automatically — ready to review.",
    screen: <ConsultScreen phase="notes" />,
  },
  {
    title: 'Notes finalised and sent',
    narration: "Dr Herling reviews and accepts the AI draft. Notes are saved, ACC45 lodged, X-ray referral sent to Marlborough Medical Imaging. Patient receives an email summary.",
    screen: <ConsultScreen phase="finalise" />,
  },
]

export default function DemoProvider() {
  const navigate = useNavigate()
  const { step, auto, setAuto, next, prev, progress } = useDemo(STEPS.length)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <DemoBanner />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {STEPS[step].screen}
      </div>
      <NarrationBar
        step={step} total={STEPS.length}
        title={STEPS[step].title} narration={STEPS[step].narration}
        onPrev={prev} onNext={next}
        auto={auto} onToggleAuto={() => setAuto(a => !a)}
        progress={progress}
      />
      <button onClick={() => navigate('/demo')} style={{ position: 'fixed', top: 36, left: '1rem', background: 'rgba(0,0,0,.4)', border: 'none', color: 'white', padding: '5px 12px', borderRadius: 99, fontSize: '.75rem', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', zIndex: 50 }}>
        ← Demo home
      </button>
    </div>
  )
}
