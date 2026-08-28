// TrainingBanner — shown at the top of ProviderApp when the signed-in
// provider hasn't finished their four sandbox training tasks yet.
//
// Fetches training status from /api/providers?action=training_status, which
// computes progress from actual practice-mode consult/prescription/referral
// rows. Once all four are done the endpoint stamps training_completed_at
// and admin gets an email; the provider still needs an admin to flip
// patient_access_from before they see real patients.
//
// The banner is dismissible per-session — the underlying gate is
// patient_access_from, not this UI.

import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

const TASKS = [
  { key: 'take_consult',  label: 'Take a fake consult end-to-end', hint: 'Open a practice-mode patient from the queue and connect the call.' },
  { key: 'write_rx',      label: 'Write a fake prescription',      hint: 'From the practice consult, prescribe any test medication.' },
  { key: 'complete_note', label: 'Complete a fake consult + note', hint: 'Finish the consult (status → completed) with a note attached.' },
  { key: 'send_referral', label: 'Send a fake RHCNZ referral',     hint: 'Use the referral builder inside a practice-mode consult.' },
]

export default function TrainingBanner({ providerId }) {
  const [status, setStatus] = useState(null)   // { tasks, completed, training_completed_at } | null
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!providerId) return
    let cancelled = false
    async function refresh() {
      try {
        const res = await apiFetch(`/api/providers?action=training_status&provider_id=${encodeURIComponent(providerId)}`, { method: 'POST' })
        const body = await res.json()
        if (!cancelled && res.ok) setStatus(body)
      } catch { /* ignore */ }
    }
    refresh()
    // Poll every 60s — provider might complete a task then look back at the banner.
    const iv = setInterval(refresh, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [providerId])

  if (!status || dismissed) return null
  if (status.training_completed_at) {
    // Already trained — no banner. Real-patient gate is separate.
    return null
  }

  const doneCount = TASKS.filter(t => status.tasks?.[t.key]).length

  return (
    <div style={{
      background: doneCount === 4 ? '#065F46' : '#B45309',
      color: 'white',
      padding: '.6rem 1rem',
      fontSize: '.85rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '.75rem',
      flexShrink: 0,
      zIndex: 300,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700 }}>🎓 Training</span>
        <span>{doneCount}/4 tasks done — practice mode is on until all four are ticked and an admin unlocks patients.</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: 'white', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '.75rem', fontWeight: 700, fontFamily: 'inherit' }}>
          {expanded ? 'Hide' : 'View'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          title="Hide for this session"
          style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: 'white', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '.85rem', lineHeight: 1, fontFamily: 'inherit' }}>
          ×
        </button>
      </div>
      {expanded && (
        <div style={{
          position: 'absolute', left: '1rem', right: '1rem', top: '100%',
          background: 'white', color: '#0D2B45',
          borderRadius: '0 0 8px 8px', boxShadow: '0 6px 20px rgba(0,0,0,.15)',
          padding: '.9rem 1.1rem', zIndex: 400,
          maxWidth: 640, marginTop: 0,
        }}>
          <div style={{ fontSize: '.85rem', color: '#6B7280', marginBottom: 10 }}>
            Complete all four in practice mode. Progress ticks automatically as you do the action against a fake patient.
          </div>
          {TASKS.map(t => {
            const done = !!status.tasks?.[t.key]
            return (
              <div key={t.key} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid #F1F5F9', alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: done ? '#065F46' : '#E2E8F0', color: 'white', textAlign: 'center', lineHeight: '22px', fontSize: '.85rem', fontWeight: 700 }}>{done ? '✓' : ''}</div>
                <div>
                  <div style={{ fontSize: '.9rem', fontWeight: 700, color: done ? '#065F46' : '#0D2B45' }}>{t.label}</div>
                  <div style={{ fontSize: '.78rem', color: '#6B7280', marginTop: 2 }}>{t.hint}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
