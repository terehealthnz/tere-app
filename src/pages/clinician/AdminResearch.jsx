import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { getResearchConsentedConsults } from '../../lib/supabase'

// ── Privacy guard ─────────────────────────────────────────────────────────────
const PII_FIELDS = [
  'patient_first_name','patient_last_name','patient_dob','patient_phone',
  'patient_email','patient_nhi','patient_address','gp_name','gp_email',
  'gp_clinic','pharmacy','provider_display_name','provider_id',
]
const EXPORT_COLUMNS = [
  'research_id','age_band','region','employment_sector','consultation_month',
  'complaint_category','acc','type','duration_min','work_capacity',
  'prescription_issued','prescription_class','referral_issued','referral_type',
  'icd10','read_code','device','language',
]

function deriveRegion(location) {
  if (!location) return 'Unknown'
  const t = location.toLowerCase()
  if (/(marlborough|blenheim|picton|renwick|havelock|sounds)/.test(t)) return 'Marlborough'
  if (/(nelson|richmond|motueka|golden bay|takaka)/.test(t)) return 'Nelson'
  if (/(christchurch|canton|ashburton|timaru|kaikōura|kaikoura|westland|greymouth)/.test(t)) return 'Canterbury'
  if (/(auckland|north shore|manukau|waitakere|pukekohe)/.test(t)) return 'Auckland'
  if (/(wellington|lower hutt|upper hutt|porirua|kapiti)/.test(t)) return 'Wellington'
  if (/(waikato|hamilton|tauranga|rotorua|bay of plenty)/.test(t)) return 'Waikato/BOP'
  if (/(otago|dunedin|queenstown|invercargill|southland)/.test(t)) return 'Otago/Southland'
  return 'Other NZ'
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function pct(n, d) {
  if (!d) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

function groupBy(rows, key, fallback = 'Unknown') {
  const counts = {}
  for (const r of rows) {
    const v = r[key] || fallback
    counts[v] = (counts[v] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }))
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function BarChart({ data, color = '#0B6E76' }) {
  if (!data.length) return <div style={{ color: '#9CA3AF', fontSize: '.8125rem', padding: '.5rem 0' }}>No data</div>
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map(d => (
        <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 110, fontSize: '.75rem', color: '#6B7280', textAlign: 'right', flexShrink: 0 }}>{d.label}</div>
          <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 4, height: 18, overflow: 'hidden' }}>
            <div style={{ width: `${(d.count / max) * 100}%`, background: color, height: '100%', borderRadius: 4, transition: 'width .3s' }} />
          </div>
          <div style={{ width: 32, fontSize: '.75rem', color: '#374151', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{d.count}</div>
        </div>
      ))}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#0D2B45' }) {
  return (
    <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E2E8F0', padding: '1rem', textAlign: 'center' }}>
      <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.75rem' }}>
      <div style={{ fontWeight: 700, fontSize: '.9375rem', color: '#0D2B45', marginBottom: '1rem' }}>{title}</div>
      {children}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function AdminResearch({ embedded = false }) {
  const [rows, setRows] = useState([])
  const [consents, setConsents] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [consentPage, setConsentPage] = useState(0)
  const CONSENT_PAGE_SIZE = 20

  useEffect(() => {
    async function load() {
      try {
        const { supabase } = await import('../../lib/supabase')
        const [consultRows, { data: consentRows }] = await Promise.all([
          getResearchConsentedConsults([
            'id','created_at','patient_age_band','patient_dob','patient_location',
            'patient_employment_sector','acc_eligible','consultation_type',
            'chief_complaint','complaint_category','work_capacity',
            'prescription_issued','prescription_drug_class','referral_issued',
            'referral_type','icd10_code','acc_read_code','consultation_month',
            'consultation_duration_seconds','device_type','language_selected',
            'vitals_completed','tere_scribe_used','research_consent',
            'status','notes_finalised_at',
          ].join(',')),
          // consents table stays direct — separate follow-up task
          supabase
            .from('consents')
            .select('id,consultation_id,consent_type,granted,created_at')
            .order('created_at', { ascending: false })
            .limit(500),
        ])
        setRows((consultRows || []).slice(0, 500))
        setConsents(consentRows || [])
      } catch (e) {
        console.error('[AdminResearch] load error:', e)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function exportCsv() {
    setExporting(true)
    try {
      const date = new Date().toISOString().slice(0, 10)
      const watermark = `De-identified research dataset — Tere Health Limited — ${date} — For research purposes only`
      const csvRows = rows.map(r => [
        'TERE-' + r.id.slice(0, 8),
        r.patient_age_band || '',
        deriveRegion(r.patient_location),
        r.patient_employment_sector || '',
        r.consultation_month || r.created_at?.slice(0, 7) || '',
        r.complaint_category || '',
        r.acc_eligible === 'yes' ? 'yes' : 'no',
        r.consultation_type || '',
        r.consultation_duration_seconds ? Math.round(r.consultation_duration_seconds / 60) : '',
        r.work_capacity || '',
        r.prescription_issued ? 'yes' : 'no',
        r.prescription_drug_class || '',
        r.referral_issued ? 'yes' : 'no',
        r.referral_type || '',
        r.icd10_code || '',
        r.acc_read_code || '',
        r.device_type || '',
        r.language_selected || '',
      ])
      const csv = [watermark, EXPORT_COLUMNS.join(','), ...csvRows.map(r => r.join(','))].join('\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      a.download = `tere-research-${date}.csv`
      a.click()
      // Audit log the export
      await apiFetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'research_data_export', metadata: { record_count: rows.length } }),
      }).catch(() => {})
    } catch (e) { console.error(e) }
    setExporting(false)
  }

  async function exportConsentsCsv() {
    const date = new Date().toISOString().slice(0, 10)
    const header = 'Consultation ref,Consent type,Granted,Timestamp'
    const csvRows = consents.map(c => [
      c.consultation_id ? 'TERE-' + c.consultation_id.slice(0, 8) : '(none)',
      c.consent_type,
      c.granted ? 'yes' : 'no',
      new Date(c.created_at).toISOString(),
    ])
    const csv = [header, ...csvRows.map(r => r.join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `tere-consents-${date}.csv`
    a.click()
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        Loading research data…
      </div>
    )
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const total = rows.length
  const hdcCount = consents.filter(c => c.consent_type === 'hdc_code_of_rights').length
  const rxCount = consents.filter(c => c.consent_type === 'prescribing_limitations_acknowledged').length
  const totalConsultations = consents.reduce((s, c) => {
    s.add(c.consultation_id); return s
  }, new Set()).size

  const accRows = rows.filter(r => r.acc_eligible === 'yes')
  const prescribedRows = rows.filter(r => r.prescription_issued)
  const referredRows = rows.filter(r => r.referral_issued)
  const vitalsRows = rows.filter(r => r.vitals_completed)
  const scribeRows = rows.filter(r => r.tere_scribe_used)

  const avgDuration = total
    ? Math.round(rows.filter(r => r.consultation_duration_seconds).reduce((s, r) => s + r.consultation_duration_seconds, 0) / rows.filter(r => r.consultation_duration_seconds).length / 60)
    : 0

  // Region derived at render time from patient_location
  const regionData = (() => {
    const counts = {}
    for (const r of rows) {
      const reg = deriveRegion(r.patient_location)
      counts[reg] = (counts[reg] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }))
  })()

  const ageData = groupBy(rows, 'patient_age_band')
  const sectorData = groupBy(rows, 'patient_employment_sector')
  const categoryData = groupBy(rows, 'complaint_category')
  const typeData = groupBy(rows, 'consultation_type')
  const workCapData = groupBy(rows, 'work_capacity')
  const drugClassData = groupBy(rows.filter(r => r.prescription_drug_class), 'prescription_drug_class')
  const referralTypeData = groupBy(rows.filter(r => r.referral_type), 'referral_type')
  const deviceData = groupBy(rows, 'device_type')
  const langData = groupBy(rows, 'language_selected')

  const consentPageRows = consents.slice(consentPage * CONSENT_PAGE_SIZE, (consentPage + 1) * CONSENT_PAGE_SIZE)
  const totalConsentPages = Math.ceil(consents.length / CONSENT_PAGE_SIZE)

  return (
    <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {/* ── A: Consent overview ──────────────────────────────────────────── */}
      <Section title="A  Consent overview">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.75rem', marginBottom: '.75rem' }}>
          <StatCard label="Total consultations" value={totalConsultations} />
          <StatCard label="Research consented" value={total} sub={pct(total, totalConsultations)} color="#059669" />
          <StatCard label="HDC consents logged" value={hdcCount} />
          <StatCard label="Prescribing consents" value={rxCount} />
        </div>
        {total === 0 && (
          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '1rem', fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.6 }}>
            No research-consented completed consultations yet. Patients who click "Yes, I'm happy to contribute" on the prescribing limits screen will appear here once their consultation is complete.
          </div>
        )}
      </Section>

      {total > 0 && (<>

      {/* ── B: Demographics ──────────────────────────────────────────────── */}
      <Section title="B  Demographic breakdown (research-consented patients only)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Age distribution</div>
            <BarChart data={ageData} color="#0B6E76" />
          </div>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Region</div>
            <BarChart data={regionData} color="#7C3AED" />
          </div>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Employment sector</div>
            <BarChart data={sectorData} color="#D97706" />
          </div>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Consultation type</div>
            <BarChart data={typeData} color="#059669" />
          </div>
        </div>
      </Section>

      {/* ── C: Clinical patterns ─────────────────────────────────────────── */}
      <Section title="C  Clinical patterns">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Complaint categories</div>
            <BarChart data={categoryData} color="#0B6E76" />
          </div>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>ACC vs non-ACC</div>
            <BarChart data={[
              { label: 'ACC', count: accRows.length },
              { label: 'Private', count: total - accRows.length },
            ]} color="#1D4ED8" />
          </div>
        </div>
      </Section>

      {/* ── D: Outcomes ───────────────────────────────────────────────────── */}
      <Section title="D  Outcomes">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
          <StatCard label="Prescription rate" value={pct(prescribedRows.length, total)} sub={`${prescribedRows.length} of ${total}`} color="#7C3AED" />
          <StatCard label="Referral rate" value={pct(referredRows.length, total)} sub={`${referredRows.length} of ${total}`} color="#D97706" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Work capacity outcomes</div>
            <BarChart data={workCapData.length ? workCapData : [{ label: 'Not recorded', count: total }]} color="#059669" />
          </div>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Prescription drug classes</div>
            <BarChart data={drugClassData.length ? drugClassData : [{ label: 'None', count: 0 }]} color="#7C3AED" />
          </div>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Referral types</div>
            <BarChart data={referralTypeData.length ? referralTypeData : [{ label: 'None', count: 0 }]} color="#D97706" />
          </div>
        </div>
      </Section>

      {/* ── E: Platform data ──────────────────────────────────────────────── */}
      <Section title="E  Platform data">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
          <StatCard label="Avg duration" value={avgDuration ? `${avgDuration}m` : '—'} />
          <StatCard label="Vitals completion" value={pct(vitalsRows.length, total)} sub={`${vitalsRows.length} of ${total}`} />
          <StatCard label="Tere Scribe usage" value={pct(scribeRows.length, total)} sub={`${scribeRows.length} of ${total}`} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Device type</div>
            <BarChart data={deviceData} color="#0B6E76" />
          </div>
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: '#374151', marginBottom: '.5rem' }}>Language</div>
            <BarChart data={langData} color="#1D4ED8" />
          </div>
        </div>
      </Section>

      {/* ── F: Raw data table ─────────────────────────────────────────────── */}
      <Section title="F  De-identified research dataset">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>
            {rows.length} records · no names, no contact details, no exact dates
          </div>
          <button onClick={exportCsv} disabled={exporting}
            style={{ background: '#0B6E76', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {exporting ? '…' : '↓ Export CSV'}
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                {['Research ID','Age band','Region','Sector','Month','Category','ACC','Type','Min','Outcome','Rx','Referral','Device','Lang'].map(h => (
                  <th key={h} style={{ padding: '5px 6px', textAlign: 'left', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', fontSize: '.6875rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '5px 6px', fontFamily: 'monospace', color: '#6B7280' }}>TERE-{r.id.slice(0, 8)}</td>
                  <td style={{ padding: '5px 6px' }}>{r.patient_age_band || '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{deriveRegion(r.patient_location)}</td>
                  <td style={{ padding: '5px 6px' }}>{r.patient_employment_sector || '—'}</td>
                  <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>{r.consultation_month || r.created_at?.slice(0, 7) || '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{r.complaint_category || '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{r.acc_eligible === 'yes' ? <span style={{ color: '#1D4ED8', fontWeight: 700 }}>ACC</span> : '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{r.consultation_type || '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{r.consultation_duration_seconds ? Math.round(r.consultation_duration_seconds / 60) : '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{r.work_capacity || '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{r.prescription_issued ? <span style={{ color: '#7C3AED', fontWeight: 700 }}>Rx</span> : '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{r.referral_issued ? <span style={{ color: '#D97706', fontWeight: 700 }}>Ref</span> : '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{r.device_type || '—'}</td>
                  <td style={{ padding: '5px 6px' }}>{r.language_selected || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      </>)}

      {/* ── G: Consent audit trail ────────────────────────────────────────── */}
      <Section title="G  Consent audit trail">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>
            Legal record of all consent events · {consents.length} entries
          </div>
          <button onClick={exportConsentsCsv}
            style={{ background: '#F0F9FA', color: '#0B6E76', border: '1px solid #0B6E7640', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            ↓ Export consents CSV
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                {['Consultation ref','Consent type','Granted','Timestamp'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consentPageRows.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#6B7280', fontSize: '.75rem' }}>
                    {c.consultation_id ? 'TERE-' + c.consultation_id.slice(0, 8) : '(none)'}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ background: '#F3F4F6', color: '#374151', fontSize: '.6875rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>
                      {c.consent_type?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ color: c.granted ? '#059669' : '#DC2626', fontWeight: 700 }}>
                      {c.granted ? '✓ yes' : '✗ no'}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', color: '#9CA3AF', whiteSpace: 'nowrap', fontSize: '.75rem' }}>
                    {new Date(c.created_at).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalConsentPages > 1 && (
          <div style={{ display: 'flex', gap: 6, marginTop: '.75rem', justifyContent: 'center' }}>
            <button onClick={() => setConsentPage(p => Math.max(0, p - 1))} disabled={consentPage === 0}
              style={{ background: '#F0F9FA', border: 'none', color: '#0B6E76', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem' }}>← Prev</button>
            <span style={{ fontSize: '.8125rem', color: '#6B7280', padding: '5px 8px' }}>{consentPage + 1} / {totalConsentPages}</span>
            <button onClick={() => setConsentPage(p => Math.min(totalConsentPages - 1, p + 1))} disabled={consentPage >= totalConsentPages - 1}
              style={{ background: '#F0F9FA', border: 'none', color: '#0B6E76', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem' }}>Next →</button>
          </div>
        )}

        {consents.length === 0 && (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9CA3AF', fontSize: '.8125rem' }}>
            No consent records yet. Run the research migration SQL first.
          </div>
        )}
      </Section>
    </div>
  )
}
