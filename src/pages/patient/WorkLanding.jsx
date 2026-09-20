import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { createConsultation } from '../../lib/supabase'
import { LANGUAGES, t } from '../../lib/i18n'
import MaoriFlagIcon from '../../components/MaoriFlagIcon'

// /work/[slug] — B2B employer-covered consultation entry point.
//
// Isolation-by-design: this route is a completely separate front door
// from the paying-patient flow (`/`, `/start`). The URL is the credential;
// no email allowlist, no employee roster to maintain. Workers arrive here
// (from an employer poster / SMS / email), the slug is validated against
// the employers table, and a pre_triage consult is created with
// employer_id + employer_paid=true stashed in sessionStorage. The rest of
// the flow (consent → triage → vitals → provider queue) is the SAME
// components as the paying flow — the only difference is that
// ConsultationType.jsx sees `employer_paid=true` in sessionStorage and
// routes to /waiting instead of /payment.
//
// Security notes:
//   1. Slug validated server-side by /api/employer-lookup (returns 404
//      for missing/inactive so a probe can't distinguish).
//   2. Employer_id is stashed in sessionStorage but re-verified again
//      inside /api/create-consultation (task #71 fraud check stays).
//   3. Monthly cap enforced at slug lookup — once hit, patients see a
//      clear "contact your employer" message rather than an error.

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const TEAL_LIGHT = '#D4EEF0'
const FF = 'Plus Jakarta Sans, sans-serif'
const SERIF = 'Cormorant Garamond, Georgia, serif'

// Local translation map for the phrases specific to the /work/[slug]
// welcome card. Kept local (not in i18n.js) because these strings are
// employer-flow-only — no other component needs them. Covers all
// languages currently in LANGUAGES so no worker gets stranded on English.
// Falls back to English if a key or language is missing.
const COPY = {
  en:  { welcome: 'Welcome, {company} team',    covered: 'Your consultation is covered',        blurb: 'An Emergency Medicine specialist will see you on video or phone. No payment needed. ACC claims lodged automatically for injuries.', cta: 'Start consultation', starting: 'Starting…', emerg: 'Emergency? Call 111 immediately.' },
  mi:  { welcome: 'Nau mai, tīma {company}',     covered: 'Kua utua tō uiuinga',                  blurb: 'Ka kite tētahi mātanga hauora ohotata i a koe mā te whakaata, mā te waea rānei. Kāore he utu. Ka tukuna aunoatia ngā kerēme ACC mō ngā whara.', cta: 'Tīmata te uiuinga', starting: 'E tīmata ana…', emerg: 'He ohotata? Waea atu ki te 111 ināianei.' },
  sm:  { welcome: 'Afio mai, ‘au a le {company}', covered: 'Ua totogia lau feiloa‘iga fa‘afoma‘i', blurb: 'O le a asiasi mai se foma‘i fa‘apitoa i fa‘alavelave fa‘afuase‘i i le vitio pe telefoni. E le manaomia se totogi. E fa‘amauina otometi tagi ACC mo manu‘a.', cta: 'Amata le feiloa‘iga', starting: 'E amata…', emerg: 'Fa‘alavelave? Vala‘au le 111 nei loa.' },
  zh:  { welcome: '{company} 团队，欢迎',        covered: '您的就诊费用已由雇主支付',              blurb: '急诊医学专科医生将通过视频或电话为您就诊。无需付款。工伤将自动申报 ACC 理赔。',           cta: '开始就诊',           starting: '正在开始…',    emerg: '紧急情况？请立即拨打 111。' },
  yue: { welcome: '{company} 團隊，歡迎',        covered: '你嘅診症費用已由僱主支付',              blurb: '急症科專科醫生會透過視像或電話為你診症。無需付款。工傷會自動申報 ACC 賠償。',           cta: '開始診症',           starting: '正在開始…',    emerg: '緊急情況？請即刻打 111。' },
  ja:  { welcome: '{company} チームの皆様、ようこそ', covered: '診察費は雇用主が負担します',          blurb: '救急医療の専門医がビデオまたは電話で診察します。お支払いは不要です。労働災害は自動的にACCに申請されます。', cta: '診察を開始',         starting: '開始しています…', emerg: '緊急ですか？すぐに111に電話してください。' },
  ko:  { welcome: '{company} 팀 여러분, 환영합니다',   covered: '진료 비용은 회사가 부담합니다',        blurb: '응급의학 전문의가 화상 또는 전화로 진료합니다. 결제할 필요가 없습니다. 부상에 대한 ACC 청구는 자동으로 접수됩니다.', cta: '진료 시작',           starting: '시작 중…',      emerg: '응급 상황인가요? 즉시 111에 전화하세요.' },
  de:  { welcome: 'Willkommen, {company} Team',   covered: 'Ihre Konsultation ist abgedeckt',       blurb: 'Ein Facharzt für Notfallmedizin wird Sie per Video oder Telefon sehen. Keine Zahlung erforderlich. ACC-Ansprüche werden bei Verletzungen automatisch eingereicht.', cta: 'Konsultation starten', starting: 'Wird gestartet…', emerg: 'Notfall? Rufen Sie sofort 111 an.' },
  nl:  { welcome: 'Welkom, {company} team',       covered: 'Uw consult wordt vergoed',              blurb: 'Een spoedeisende-hulp specialist ziet u via video of telefoon. Geen betaling nodig. ACC-claims worden bij letsel automatisch ingediend.', cta: 'Consult starten',    starting: 'Wordt gestart…', emerg: 'Noodgeval? Bel onmiddellijk 111.' },
  fr:  { welcome: 'Bienvenue, équipe {company}',  covered: 'Votre consultation est couverte',       blurb: 'Un spécialiste en médecine d’urgence vous consultera par vidéo ou téléphone. Aucun paiement requis. Les demandes ACC pour blessures sont déposées automatiquement.', cta: 'Commencer la consultation', starting: 'Démarrage…',    emerg: 'Urgence ? Appelez le 111 immédiatement.' },
  es:  { welcome: 'Bienvenido, equipo {company}', covered: 'Su consulta está cubierta',             blurb: 'Un especialista en medicina de urgencias le atenderá por videollamada o teléfono. No se requiere pago. Las reclamaciones ACC por lesiones se registran automáticamente.', cta: 'Iniciar consulta',   starting: 'Iniciando…',    emerg: '¿Emergencia? Llame al 111 inmediatamente.' },
  ar:  { welcome: 'مرحباً بفريق {company}',        covered: 'استشارتك مغطاة بالكامل',                 blurb: 'سيقوم طبيب مختص في طب الطوارئ بمعاينتك عبر الفيديو أو الهاتف. لا حاجة للدفع. يتم تسجيل مطالبات ACC للإصابات تلقائياً.', cta: 'ابدأ الاستشارة',    starting: 'جارٍ البدء…',   emerg: 'حالة طوارئ؟ اتصل بـ 111 فوراً.' },
  hi:  { welcome: '{company} टीम, स्वागत है',      covered: 'आपका परामर्श कवर है',                    blurb: 'एक आपातकालीन चिकित्सा विशेषज्ञ आपको वीडियो या फ़ोन पर देखेगा। कोई भुगतान आवश्यक नहीं। चोटों के लिए ACC दावे स्वचालित रूप से दर्ज किए जाते हैं।', cta: 'परामर्श शुरू करें', starting: 'शुरू हो रहा है…', emerg: 'आपातकाल? तुरंत 111 पर कॉल करें।' },
}

function tr(lang, key, vars) {
  const s = (COPY[lang] && COPY[lang][key]) || COPY.en[key] || ''
  if (!vars) return s
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), s)
}

export default function WorkLanding() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('checking')  // checking | ready | invalid | capped | starting
  const [employer, setEmployer] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [lang, setLang] = useState(() => sessionStorage.getItem('patient_language') || 'en')

  function selectLang(code) {
    setLang(code)
    sessionStorage.setItem('patient_language', code)
  }

  useEffect(() => {
    let cancelled = false
    async function validate() {
      try {
        const r = await apiFetch(`/api/employer-lookup?slug=${encodeURIComponent(slug || '')}`)
        if (cancelled) return
        if (r.status === 404) { setPhase('invalid'); return }
        if (r.status === 429) {
          const body = await r.json().catch(() => ({}))
          setErrorMsg(body?.error || 'This employer plan has reached its monthly cap.')
          setPhase('capped')
          return
        }
        if (!r.ok) { setPhase('invalid'); return }
        const body = await r.json()
        setEmployer(body.employer)
        setPhase('ready')
      } catch {
        if (!cancelled) setPhase('invalid')
      }
    }
    validate()
    return () => { cancelled = true }
  }, [slug])

  async function startConsultation() {
    if (!employer) return
    setPhase('starting')

    // Clear any prior consult from sessionStorage so we don't accidentally
    // resume a paying-patient consult under an employer wrapper.
    sessionStorage.removeItem('consultation_id')
    sessionStorage.removeItem('consultationId')
    sessionStorage.removeItem('paymentIntentId')

    // Stash employer context so ConsultationType.jsx picks it up and
    // routes to /waiting (bypasses Payment) after triage completes.
    sessionStorage.setItem('employer_id', employer.id)
    sessionStorage.setItem('employer_name', employer.company_name)
    sessionStorage.setItem('employer_paid', 'true')

    try {
      const pt = await createConsultation({
        status: 'pre_triage',
        patientLanguage: lang,
        employerId: employer.id,  // server re-verifies and sets employer_paid=true
      })
      if (pt?.id) sessionStorage.setItem('consultation_id', pt.id)
    } catch (e) {
      console.error('[work-landing] createConsultation failed:', e?.message || e)
      // Don't block the flow — the consult will get created downstream if
      // AITriage falls back to its own create. But log so we notice.
    }
    navigate('/consent')
  }

  return (
    <main style={{
      background: NAVY, minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '2rem 1.5rem', fontFamily: FF, textAlign: 'center',
    }}>
      {/* Bg circles for visual consistency with TereIntro */}
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: TEAL, opacity: .06, top: -80, right: -80 }} />
      <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: TEAL, opacity: .06, bottom: -60, left: -60 }} />

      <div style={{ position: 'relative', maxWidth: 460, width: '100%' }}>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '2.5rem', color: TEAL_LIGHT, marginBottom: 4 }}>Tere Health</div>
        <div style={{ fontSize: '.7rem', color: 'rgba(212,238,240,.7)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: '2.5rem' }}>
          Emergency medicine. On your phone.
        </div>

        {phase === 'checking' && (
          <div style={{ color: TEAL_LIGHT, opacity: .7 }}>Checking access…</div>
        )}

        {phase === 'invalid' && (
          <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>This link is not active</div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              The employer access link you used is no longer valid. If you believe this is an error, please contact your employer or Tere Health support.
            </div>
            <button onClick={() => navigate('/')} style={{
              background: TEAL, color: 'white', border: 'none', padding: '.75rem 1.5rem', borderRadius: 99,
              fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: FF,
            }}>Continue as a paying patient</button>
          </div>
        )}

        {phase === 'capped' && (
          <div style={{ background: 'rgba(255,193,7,.08)', border: '1px solid rgba(255,193,7,.3)', borderRadius: 16, padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📅</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Monthly cap reached</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {errorMsg}
            </div>
            <button onClick={() => navigate('/')} style={{
              background: TEAL, color: 'white', border: 'none', padding: '.75rem 1.5rem', borderRadius: 99,
              fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: FF,
            }}>Continue as a paying patient</button>
          </div>
        )}

        {(phase === 'ready' || phase === 'starting') && employer && (
          <div style={{ background: 'rgba(11,110,118,.15)', border: '1px solid rgba(11,110,118,.4)', borderRadius: 16, padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👋</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.25rem', marginBottom: 6 }}>{tr(lang, 'welcome', { company: employer.company_name })}</div>
            <div style={{ color: TEAL_LIGHT, fontSize: '.95rem', fontWeight: 600, marginBottom: '1.5rem' }}>
              {tr(lang, 'covered')}
            </div>

            {/* Language selector — order tuned for employer flow specifically:
                English + French up top (LVMH etc.), then Māori + Samoan, then
                the rest of the LANGUAGES catalogue in its original order.
                Kept local to this component so the public TereIntro order is
                unchanged. */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '.65rem', color: 'rgba(212,238,240,.82)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.625rem' }}>
                {t('choose_language', lang)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {(() => {
                  const priority = ['en', 'fr', 'mi', 'sm']
                  const priorityLangs = priority.map(c => LANGUAGES.find(l => l.code === c)).filter(Boolean)
                  const rest = LANGUAGES.filter(l => !priority.includes(l.code))
                  return [...priorityLangs, ...rest]
                })().map(l => (
                  <button key={l.code} onClick={() => selectLang(l.code)} style={{
                    background: lang === l.code ? 'rgba(11,110,118,.5)' : 'rgba(255,255,255,.07)',
                    border: `1.5px solid ${lang === l.code ? TEAL : 'rgba(255,255,255,.12)'}`,
                    borderRadius: 8, padding: '6px 4px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    transition: 'all .15s',
                  }}>
                    <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>
                      {l.customFlag === 'MaoriFlagIcon' ? <MaoriFlagIcon width={22} height={15} /> : l.flag}
                    </span>
                    <span style={{ fontSize: '.6rem', color: lang === l.code ? TEAL_LIGHT : 'rgba(212,238,240,.87)', fontFamily: FF, fontWeight: lang === l.code ? 700 : 400 }}>
                      {l.nativeName}
                    </span>
                  </button>
                ))}
              </div>
              {(() => {
                const selected = LANGUAGES.find(l => l.code === lang)
                return selected?.note ? (
                  <div style={{ fontSize: '.65rem', color: 'rgba(212,238,240,.75)', textAlign: 'center', marginTop: '.5rem', lineHeight: 1.4 }}>
                    {selected.note}
                  </div>
                ) : null
              })()}
            </div>

            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '.875rem', lineHeight: 1.6, marginBottom: '2rem', direction: (LANGUAGES.find(l => l.code === lang)?.rtl ? 'rtl' : 'ltr') }}>
              {tr(lang, 'blurb')}
            </div>
            <button onClick={startConsultation} disabled={phase === 'starting'} style={{
              background: '#F97316', color: 'white', border: 'none', padding: '1rem 2.5rem', borderRadius: 99,
              fontWeight: 700, fontSize: '1.0625rem', cursor: phase === 'starting' ? 'wait' : 'pointer',
              fontFamily: FF, boxShadow: '0 4px 20px rgba(249,115,22,.4)',
              opacity: phase === 'starting' ? .7 : 1,
            }}>
              {phase === 'starting' ? tr(lang, 'starting') : tr(lang, 'cta')}
            </button>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.75rem', marginTop: '1.5rem' }}>
              {tr(lang, 'emerg')}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
