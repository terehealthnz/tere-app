import React, { useState, useEffect, useCallback } from 'react'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const AUTO_MS = 4000

export function useDemo(count) {
  const [step, setStep] = useState(0)
  const [auto, setAuto] = useState(true)
  const [progress, setProgress] = useState(0)

  const next = useCallback(() => setStep(s => Math.min(s + 1, count - 1)), [count])
  const prev = useCallback(() => setStep(s => Math.max(s - 1, 0)), [])

  useEffect(() => {
    setProgress(0)
    if (!auto) return
    let elapsed = 0
    const interval = setInterval(() => {
      elapsed += 80
      setProgress(Math.min((elapsed / AUTO_MS) * 100, 100))
      if (elapsed >= AUTO_MS) {
        setStep(s => (s < count - 1 ? s + 1 : s))
        elapsed = 0
        setProgress(0)
      }
    }, 80)
    return () => clearInterval(interval)
  }, [auto, step, count])

  return { step, auto, setAuto, next, prev, progress }
}

export function DemoBanner() {
  return (
    <div style={{ background: '#D97706', color: 'white', textAlign: 'center', padding: '7px 1rem', fontSize: '.8125rem', fontWeight: 700, letterSpacing: '.04em', flexShrink: 0 }}>
      DEMO MODE — No real data
    </div>
  )
}

export function NarrationBar({ step, total, title, narration, onPrev, onNext, auto, onToggleAuto, progress }) {
  return (
    <div style={{ background: NAVY, padding: '1rem 1.25rem', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ height: 3, background: 'rgba(255,255,255,.12)', borderRadius: 99, marginBottom: '.875rem', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: TEAL, width: auto ? `${progress}%` : '0%', transition: 'width .08s linear', borderRadius: 99 }} />
      </div>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.35)', marginBottom: '.2rem', textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Step {step + 1} / {total}
          </div>
          <div style={{ color: '#D4EEF0', fontWeight: 700, fontSize: '.9375rem', marginBottom: '.2rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{title}</div>
          <div style={{ color: 'rgba(212,238,240,.6)', fontSize: '.8125rem', lineHeight: 1.5, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{narration}</div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexShrink: 0, alignItems: 'center', marginTop: '.125rem' }}>
          <button onClick={onPrev} disabled={step === 0} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: step === 0 ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.8)', padding: '7px 12px', borderRadius: 8, cursor: step === 0 ? 'default' : 'pointer', fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>←</button>
          <button onClick={onNext} disabled={step === total - 1} style={{ background: step === total - 1 ? 'rgba(255,255,255,.08)' : TEAL, border: 'none', color: 'white', padding: '7px 14px', borderRadius: 8, cursor: step === total - 1 ? 'default' : 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Next →</button>
          <button onClick={onToggleAuto} title={auto ? 'Pause auto-advance' : 'Resume auto-advance'} style={{ background: auto ? 'rgba(217,119,6,.35)' : 'rgba(255,255,255,.08)', border: `1px solid ${auto ? '#D97706' : 'transparent'}`, color: 'white', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '.8125rem' }}>
            {auto ? '⏸' : '▶'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: '.875rem' }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ width: i === step ? 18 : 6, height: 6, borderRadius: 99, background: i === step ? TEAL : 'rgba(255,255,255,.2)', transition: 'all .2s' }} />
        ))}
      </div>
    </div>
  )
}

export function Msg({ role, text, highlight, badge }) {
  const isTere = role === 'tere'
  return (
    <div style={{ display: 'flex', justifyContent: isTere ? 'flex-start' : 'flex-end', marginBottom: '.5rem' }}>
      <div style={{
        maxWidth: '84%',
        background: isTere ? (highlight ? '#ECFDF5' : '#F3F4F6') : TEAL,
        border: highlight ? '1.5px solid #6EE7B7' : 'none',
        color: isTere ? '#111827' : 'white',
        borderRadius: isTere ? '14px 14px 14px 2px' : '14px 14px 2px 14px',
        padding: '.575rem .875rem',
        fontSize: '.875rem', lineHeight: 1.55,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}>
        {text}
        {badge && <span style={{ display: 'inline-block', marginLeft: 6, background: '#D1FAE5', color: '#065F46', fontSize: '.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>{badge}</span>}
      </div>
    </div>
  )
}

export function ChatShell({ messages, inputValue, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: NAVY, padding: '.875rem 1rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem' }}>🩺</div>
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.1rem', lineHeight: 1 }}>Tere</div>
            <div style={{ color: 'rgba(212,238,240,.45)', fontSize: '.7rem' }}>AI Health Assistant · Online</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '.875rem' }}>
        {messages.map((m, i) => <Msg key={i} {...m} />)}
        {children}
      </div>
      {inputValue !== undefined && (
        <div style={{ padding: '.75rem', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '.5rem' }}>
          <div style={{ flex: 1, background: '#F9FAFB', border: '1.5px solid #E5E7EB', borderRadius: 24, padding: '.5rem 1rem', fontSize: '.875rem', color: inputValue ? '#111' : '#9CA3AF', fontFamily: 'Plus Jakarta Sans, sans-serif', minHeight: 38, display: 'flex', alignItems: 'center' }}>
            {inputValue || 'Type your message…'}
          </div>
          <button style={{ background: TEAL, border: 'none', color: 'white', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', fontSize: '1rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>→</button>
        </div>
      )}
    </div>
  )
}
