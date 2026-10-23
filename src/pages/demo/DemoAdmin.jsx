import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemo, DemoBanner, NarrationBar } from './DemoShell'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'

function AvailabilityScreen() {
  return (
    <div style={{ background: '#F8FAFC', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: NAVY, padding: '.875rem 1rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.2rem' }}>Tere Admin</div>
        <div style={{ color: 'rgba(212,238,240,.5)', fontSize: '.8rem' }}>Dr P. Herling</div>
      </div>
      <div style={{ padding: '1rem', flex: 1 }}>
        {/* Availability toggle */}
        <div style={{ background: 'white', border: '2px solid #22C55E', borderRadius: 12, padding: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 0 0 4px #22C55E18' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '.9375rem' }}>You are available for patients</div>
              <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>Your status is shown to patients in real time</div>
            </div>
          </div>
          <button style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', whiteSpace: 'nowrap' }}>Set unavailable</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, background: 'white', borderRadius: 8, padding: 4, border: '1px solid #E5E7EB', marginBottom: '1rem' }}>
          {['Queue', 'Messages', 'Notes', 'Approvals'].map((t, i) => (
            <div key={t} style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 6, background: i === 0 ? NAVY : 'transparent', color: i === 0 ? 'white' : '#6B7280', fontSize: '.75rem', fontWeight: 600 }}>{t}</div>
          ))}
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.625rem', marginBottom: '1rem' }}>
          {[['3', 'Waiting', '#D97706'], ['1', 'In progress', '#7C3AED'], ['6', 'Today', '#059669']].map(([n, l, c]) => (
            <div key={l} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c }}>{n}</div>
              <div style={{ fontSize: '.7rem', color: '#9CA3AF' }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '.875rem' }}>
          <div style={{ fontWeight: 700, fontSize: '.875rem', marginBottom: '.5rem' }}>Patient queue</div>
          {['James Taitoko — Vitals ready · ACC', 'Aroha Williams — Waiting · 12m', 'Colin McRae — Waiting · 18m'].map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '.8125rem' }}>
              <span style={{ color: '#374151' }}>{p}</span>
              <span style={{ color: TEAL, fontWeight: 700, fontSize: '.75rem' }}>Start →</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function NotesScreen() {
  const notes = [
    { name: 'James Taitoko', complaint: 'Lateral malleolus fracture — ACC45 lodged, X-ray ordered', date: 'Today 09:14', outcome: 'XR ordered · Rx · ACC', finalised: true },
    { name: 'Aroha Williams', complaint: 'Viral URTI — symptomatic management', date: 'Today 08:30', outcome: 'Rx', finalised: true },
    { name: 'Colin McRae', complaint: 'Exertional chest tightness — ECG recommended', date: 'Yesterday 16:55', outcome: 'Referral', finalised: false, flagged: true },
    { name: 'Marama Te Kani', complaint: 'Cellulitis right forearm — oral antibiotics', date: 'Yesterday 14:20', outcome: 'Rx', finalised: true },
  ]
  return (
    <div style={{ background: '#F8FAFC', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: NAVY, padding: '.875rem 1rem', flexShrink: 0 }}>
        <div style={{ color: '#D4EEF0', fontWeight: 700, fontSize: '.9375rem' }}>Clinical notes</div>
        <div style={{ color: 'rgba(212,238,240,.4)', fontSize: '.75rem' }}>4 consultations · 1 pending completion</div>
      </div>
      <div style={{ padding: '.875rem', flex: 1, overflowY: 'auto' }}>
        {notes.map((n, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 10, border: '1px solid #E5E7EB', borderLeft: `4px solid ${n.flagged ? '#DC2626' : n.finalised ? '#059669' : '#D97706'}`, padding: '.875rem', marginBottom: '.625rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
              <span style={{ fontWeight: 700, fontSize: '.9375rem' }}>{n.name}</span>
              {n.flagged && <span style={{ background: '#FEE2E2', color: '#DC2626', fontSize: '.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>FLAGGED</span>}
              {n.finalised && !n.flagged && <span style={{ background: '#D1FAE5', color: '#059669', fontSize: '.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>✓ SIGNED</span>}
              {!n.finalised && !n.flagged && <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: '.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>PENDING</span>}
            </div>
            <div style={{ fontSize: '.8125rem', color: '#374151', marginBottom: '.25rem' }}>{n.complaint}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.75rem', color: '#9CA3AF' }}>{n.date} · {n.outcome}</span>
              <span style={{ fontSize: '.75rem', color: TEAL, fontWeight: 700 }}>View notes →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmployersScreen() {
  const employers = [
    { name: 'Sanford Aquaculture', employees: 47, consultations: 12, spend: '$780', active: true, logo: '🐟' },
    { name: 'Marlborough Lines', employees: 23, consultations: 5, spend: '$325', active: true, logo: '⚡' },
    { name: 'Pelorus Trust', employees: 11, consultations: 2, spend: '$130', active: true, logo: '🌿' },
    { name: 'InterIslander', employees: 68, consultations: 0, spend: '$0', active: false, logo: '🚢' },
  ]
  return (
    <div style={{ background: '#F8FAFC', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: NAVY, padding: '.875rem 1rem', flexShrink: 0 }}>
        <div style={{ color: '#D4EEF0', fontWeight: 700, fontSize: '.9375rem' }}>Employer accounts</div>
        <div style={{ color: 'rgba(212,238,240,.4)', fontSize: '.75rem' }}>4 employers · 149 covered employees</div>
      </div>
      <div style={{ padding: '.875rem', flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.625rem', marginBottom: '1rem' }}>
          {[['149', 'Covered employees', TEAL], ['19', 'Consultations this month', '#7C3AED'], ['$1,235', 'Revenue this month', '#059669']].map(([n, l, c]) => (
            <div key={l} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '.75rem', gridColumn: l === 'Revenue this month' ? '1/-1' : undefined }}>
              <div style={{ fontSize: l === 'Revenue this month' ? '1.5rem' : '1.25rem', fontWeight: 700, color: c }}>{n}</div>
              <div style={{ fontSize: '.7rem', color: '#9CA3AF' }}>{l}</div>
            </div>
          ))}
        </div>
        {employers.map((e, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '.875rem', marginBottom: '.5rem', opacity: e.active ? 1 : .6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{e.logo}</span>
                <span style={{ fontWeight: 700, fontSize: '.875rem' }}>{e.name}</span>
              </div>
              <span style={{ background: e.active ? '#D1FAE5' : '#F3F4F6', color: e.active ? '#059669' : '#9CA3AF', fontSize: '.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>{e.active ? 'Active' : 'Inactive'}</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '.75rem', color: '#6B7280' }}>
              <span>👥 {e.employees} employees</span>
              <span>📋 {e.consultations} consults</span>
              <span style={{ color: '#059669', fontWeight: 600 }}>{e.spend} this month</span>
            </div>
          </div>
        ))}
        <button style={{ width: '100%', background: TEAL, color: 'white', border: 'none', borderRadius: 10, padding: '.75rem', fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', marginTop: '.25rem' }}>
          + Add employer account
        </button>
      </div>
    </div>
  )
}

function ApprovalsScreen() {
  return (
    <div style={{ background: '#F8FAFC', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: NAVY, padding: '.875rem 1rem', flexShrink: 0 }}>
        <div style={{ color: '#D4EEF0', fontWeight: 700, fontSize: '.9375rem' }}>Pending approvals</div>
        <div style={{ color: 'rgba(212,238,240,.4)', fontSize: '.75rem' }}>3 items awaiting supervisor review</div>
      </div>
      <div style={{ padding: '.875rem', flex: 1, overflowY: 'auto' }}>
        {[
          { type: 'Prescription', color: '#7C3AED', patient: 'Marama Te Kani', detail: 'Flucloxacillin 500mg QID x 7 days', by: 'Dr J. Koha (Registrar)', urgent: false },
          { type: 'Radiology', color: '#D97706', patient: 'Colin McRae', detail: 'ECG + Chest X-ray — cardiac workup', by: 'Dr J. Koha (Registrar)', urgent: true },
          { type: 'ACC Claim', color: '#059669', patient: 'James Taitoko', detail: 'ACC45: Lateral malleolus fracture, workplace injury', by: 'Dr P. Herling', urgent: false },
        ].map((item, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid #E5E7EB', borderLeft: `4px solid ${item.color}`, borderRadius: 10, padding: '.875rem', marginBottom: '.625rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.375rem' }}>
              <span style={{ background: item.color + '20', color: item.color, fontSize: '.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>{item.type}</span>
              <span style={{ fontWeight: 700, fontSize: '.875rem' }}>{item.patient}</span>
              {item.urgent && <span style={{ background: '#FEE2E2', color: '#DC2626', fontSize: '.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>32m pending</span>}
            </div>
            <div style={{ fontSize: '.8125rem', color: '#374151', marginBottom: '.25rem' }}>{item.detail}</div>
            <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginBottom: '.625rem' }}>Drafted by {item.by}</div>
            <div style={{ display: 'flex', gap: '.375rem' }}>
              <button style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>✓ Approve</button>
              <button style={{ background: '#FEF3C7', color: '#92400E', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>✎ Modify</button>
              <button style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>✕ Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const STEPS = [
  {
    title: 'Provider availability toggle',
    narration: "Dr Herling opens the dashboard. The green toggle shows he's available — patients can see this in real time before they book. One click to go unavailable.",
    screen: <AvailabilityScreen />,
  },
  {
    title: 'Clinical notes management',
    narration: "The Notes tab shows all completed consultations. Signed notes in green, flagged ones in red for review. One click to view the full SOAP notes, actions, and patient record.",
    screen: <NotesScreen />,
  },
  {
    title: 'Supervisor approvals workflow',
    narration: "Registrars and nurse practitioners can draft prescriptions, referrals, and ACC claims — but they require a supervisor countersignature before dispatch. Approvals queue is shown here.",
    screen: <ApprovalsScreen />,
  },
  {
    title: 'Employer accounts panel',
    narration: "Sanford Aquaculture, Marlborough Lines, and Pelorus Trust have employer accounts. Their employees are automatically covered when they book — no payment card needed.",
    screen: <EmployersScreen />,
  },
  {
    title: 'Revenue and analytics',
    narration: "$1,235 in employer-covered consultations this month from 4 accounts. The employer model provides predictable revenue and removes payment friction for rural workers.",
    screen: <EmployersScreen />,
  },
]

export default function DemoAdmin() {
  const navigate = useNavigate()
  const { step, auto, setAuto, next, prev, progress } = useDemo(STEPS.length)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <DemoBanner />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E8EBF0', padding: '1.5rem' }}>
        <div style={{ width: 420, maxWidth: '100%', height: 680, maxHeight: 'calc(100vh - 220px)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.2), 0 0 0 6px #1F2937, 0 0 0 8px #374151', display: 'flex', flexDirection: 'column' }}>
          {STEPS[step].screen}
        </div>
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
