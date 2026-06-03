import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { t, getLangMeta } from '../lib/i18n'
import { apiFetch } from '../lib/api'

async function resizeImageToBase64(file, maxWidth = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

async function translateText(text, targetLang, sourceLang) {
  try {
    const res = await apiFetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target_lang: targetLang, source_lang: sourceLang }),
    })
    const d = await res.json()
    return d.translated_text || null
  } catch { return null }
}

export default function ChatPanel({
  consultationId,
  sender,            // 'patient' | 'provider'
  patientLanguage = 'en',
  onPhotoReceived,   // callback(photoDataUrl) when patient sends photo — provider side only
  style = {},
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoData, setPhotoData] = useState(null)
  const [showOriginals, setShowOriginals] = useState(new Set())
  const fileRef = useRef(null)
  const bottomRef = useRef(null)
  const channelRef = useRef(null)

  const patientLangMeta = getLangMeta(patientLanguage)
  const needsTranslation = patientLanguage !== 'en'
  // Patient reads in their own language; provider reads in English
  const myLang = sender === 'patient' ? patientLanguage : 'en'

  const addMessage = useCallback((msg) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev
      return [...prev, msg]
    })
  }, [])

  useEffect(() => {
    if (!consultationId) return
    supabase
      .from('messages')
      .select('*')
      .eq('consultation_id', consultationId)
      .order('created_at')
      .then(({ data }) => setMessages(data || []))

    channelRef.current = supabase
      .channel(`chat-${consultationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `consultation_id=eq.${consultationId}`,
      }, ({ new: msg }) => {
        addMessage(msg)
        if (!open) setUnread(u => u + 1)
        if (msg.sender !== sender && msg.photo_url && onPhotoReceived) {
          onPhotoReceived(msg.photo_url)
        }
      })
      .subscribe()

    return () => { channelRef.current?.unsubscribe() }
  }, [consultationId, sender, onPhotoReceived])

  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [open, messages])

  async function handleSend() {
    if (!input.trim() && !photoData) return
    setSending(true)
    try {
      const text = input.trim()
      let translated_text = null

      if (text && needsTranslation) {
        if (sender === 'patient') {
          // Patient writes in their language → translate to English for provider
          translated_text = await translateText(text, 'en', patientLanguage)
        } else {
          // Provider writes in English → translate to patient's language
          translated_text = await translateText(text, patientLanguage, 'en')
        }
      }

      await supabase.from('messages').insert({
        consultation_id: consultationId,
        sender,
        message: text || null,
        photo_url: photoData || null,
        translated_text: translated_text || null,
        detected_language: sender === 'patient' ? patientLanguage : 'en',
      })
      setInput('')
      setPhotoData(null)
      setPhotoPreview(null)
    } catch (e) { console.error('Chat send error:', e) }
    setSending(false)
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const b64 = await resizeImageToBase64(file)
      setPhotoPreview(b64)
      setPhotoData(b64)
    } catch { alert('Could not load image.') }
  }

  function toggleOriginal(id) {
    setShowOriginals(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // For own messages always show original; for other's messages prefer translated_text
  function displayText(m) {
    if (m.sender === sender) return m.message
    if (showOriginals.has(m.id)) return m.message
    return m.translated_text || m.message
  }

  function hasTranslation(m) {
    return needsTranslation && m.sender !== sender && m.translated_text && m.translated_text !== m.message
  }

  const btnStyle = {
    position: 'absolute', bottom: 72, right: 12,
    background: 'var(--teal)', border: 'none', color: 'white',
    width: 44, height: 44, borderRadius: '50%', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,.35)',
    zIndex: 10, ...style,
  }

  return (
    <>
      {/* Toggle button */}
      <button onClick={() => setOpen(o => !o)} style={btnStyle} aria-label={t('chat_label', myLang)}>
        💬
        {unread > 0 && !open && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#DC2626', color: 'white', borderRadius: '50%',
            width: 18, height: 18, fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{unread}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 300,
          background: 'white', borderLeft: '1px solid rgba(255,255,255,.1)',
          display: 'flex', flexDirection: 'column', zIndex: 9,
          overflow: 'hidden',
          boxShadow: '-4px 0 12px rgba(0,0,0,.2)',
          direction: patientLangMeta.rtl && sender === 'patient' ? 'rtl' : 'ltr',
        }}>
          {/* Header */}
          <div style={{ background: 'var(--navy)', padding: '.625rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'white', fontWeight: 600, fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{t('chat_label', myLang)}</span>
              {needsTranslation && (
                <span style={{ fontSize: '.75rem', background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.8)', borderRadius: 4, padding: '1px 5px' }}>
                  {patientLangMeta.flag} {patientLangMeta.nativeName}
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontSize: '1rem', minWidth: 44, minHeight: 44, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>

          {/* Translation disclaimer */}
          {needsTranslation && (
            <div style={{ padding: '.5rem .75rem', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', fontSize: '.7rem', color: '#92400E', lineHeight: 1.4, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {t('translation_disclaimer', myLang)}
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch', padding: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '.8125rem', marginTop: '2rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                No messages yet
              </div>
            )}
            {messages.map(m => {
              const isMine = m.sender === sender
              const text = displayText(m)
              const translated = hasTranslation(m)
              const showingOriginal = showOriginals.has(m.id)
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '.5rem .75rem',
                    borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: isMine ? 'var(--teal)' : '#F3F4F6',
                    color: isMine ? 'white' : '#1A2A33',
                    fontSize: '.8125rem', lineHeight: 1.5,
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                  }}>
                    <div style={{ fontSize: '.625rem', opacity: 0.6, marginBottom: m.photo_url || m.message ? 3 : 0, textTransform: 'uppercase', letterSpacing: '.04em', display: 'flex', gap: 4, alignItems: 'center' }}>
                      {translated && <span>{patientLangMeta.flag}</span>}
                      {m.sender === 'patient' ? 'Patient' : 'Provider'} · {new Date(m.created_at).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {m.photo_url && (
                      <img src={m.photo_url} alt="Attached" style={{ maxWidth: '100%', borderRadius: 6, marginBottom: m.message ? 4 : 0, display: 'block' }} />
                    )}
                    {text && <div>{text}</div>}
                    {translated && (
                      <button onClick={() => toggleOriginal(m.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.6rem', opacity: 0.65, marginTop: 3, padding: 0, color: 'inherit', textDecoration: 'underline', display: 'block' }}>
                        {showingOriginal ? t('hide_original', myLang) : t('show_original', myLang)}
                      </button>
                    )}
                    {translated && showingOriginal && m.message && (
                      <div style={{ marginTop: 4, fontSize: '.7rem', opacity: 0.7, fontStyle: 'italic', borderTop: '1px solid rgba(0,0,0,.1)', paddingTop: 4 }}>
                        {m.message}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Photo preview */}
          {photoPreview && (
            <div style={{ padding: '.5rem .75rem', background: '#F9FAFB', borderTop: '1px solid #E5E7EB', position: 'relative' }}>
              <img src={photoPreview} alt="Preview" style={{ maxHeight: 80, borderRadius: 6 }} />
              <button onClick={() => { setPhotoPreview(null); setPhotoData(null) }}
                style={{ position: 'absolute', top: 4, right: 8, background: 'rgba(0,0,0,.5)', border: 'none', color: 'white', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '.625rem', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
            <button onClick={() => fileRef.current?.click()}
              aria-label="Send photo"
              style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', fontSize: '1rem', flexShrink: 0, minWidth: 44, minHeight: 44, display:'flex', alignItems:'center', justifyContent:'center' }}>
              📷
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
            <textarea
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Type a message…" rows={1}
              autoComplete="off" autoCorrect="off" spellCheck="false"
              style={{ flex: 1, resize: 'none', border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '7px 10px', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '1rem', outline: 'none', maxHeight: 80 }}
            />
            <button onClick={handleSend} disabled={sending || (!input.trim() && !photoData)}
              aria-label="Send message"
              style={{ background: 'var(--teal)', border: 'none', color: 'white', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontWeight: 700, opacity: (sending || (!input.trim() && !photoData)) ? 0.5 : 1, flexShrink: 0, minWidth: 44, minHeight: 44, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {sending ? t('translating', myLang).split('…')[0] + '…' : '↑'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
