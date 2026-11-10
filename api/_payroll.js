// Payroll API — calculate, approve, mark paid, payslips, emails.
//
// Contract per-consult model (on-demand, no shifts, contractor not
// employee — Schedule 4 of the Holidays Act 2003 exempts contractors
// from statutory leave entitlements; we compensate in the per-consult
// rate). Rate is per-provider, stored in providers.base_rate, editable
// from AdminPayroll. All consult types are billed at the same flat rate.
//
// Legacy providers.hourly_rate / holiday_pay_pct columns exist for
// historical reasons but are not read here.
import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { sendEmail , hasEmailProvider} from './_email-client.js'

const FALLBACK_RATE = 25.00   // used only if a provider row has null base_rate

// Every payroll endpoint reads sensitive pay data. Non-admin callers may
// only see their OWN provider_id — anything else is a 403. Admin callers
// (billing_admin included) get full visibility.
function canSeeProvider(auth, requestedProviderId) {
  if (!auth?.provider) return false
  if (auth.provider.is_admin || auth.provider.is_billing_admin) return true
  return String(auth.provider.id) === String(requestedProviderId)
}

// Reference Monday for fortnightly calculations (2024-01-01 is a Monday)
const REF_MS = new Date('2024-01-01T00:00:00Z').getTime()

function getFortnight(dateStr) {
  const dMs = new Date(dateStr + 'T00:00:00Z').getTime()
  const idx = Math.floor((dMs - REF_MS) / (14 * 86400000))
  const start = new Date(REF_MS + idx * 14 * 86400000)
  const end   = new Date(REF_MS + (idx + 1) * 14 * 86400000 - 86400000)
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end:   end.toISOString().slice(0, 10),
  }
}

function getPastFortnights(count = 13) {
  const seen = new Set()
  const result = []
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.now() - i * 14 * 86400000)
    const f = getFortnight(d.toISOString().slice(0, 10))
    if (!seen.has(f.period_start)) { seen.add(f.period_start); result.push(f) }
  }
  return result
}

async function buildSummaries(supabase, period_start, period_end) {
  const [{ data: providers }, { data: consultations }, { data: payrollRows }] = await Promise.all([
    supabase.from('providers').select('id,first_name,last_name,credential,color,email,base_rate,gst_registered,gst_number').eq('is_active', true).order('first_name'),
    supabase.from('consultations').select('provider_id').eq('status', 'complete').not('provider_id', 'is', null)
      .eq('payment_test_mode', false)
      .eq('is_practice', false)
      .gte('created_at', period_start + 'T00:00:00.000Z')
      .lte('created_at', period_end + 'T23:59:59.999Z'),
    supabase.from('payroll_periods').select('*').eq('period_start', period_start).eq('period_end', period_end),
  ])

  const countMap = {}
  for (const c of consultations || []) {
    countMap[c.provider_id] = (countMap[c.provider_id] || 0) + 1
  }
  const savedMap = {}
  for (const r of payrollRows || []) savedMap[r.provider_id] = r

  return (providers || []).map(p => {
    const count = countMap[p.id] || 0
    const rate  = Number(p.base_rate ?? FALLBACK_RATE)
    const saved = savedMap[p.id]
    const total = parseFloat((count * rate).toFixed(2))
    // Tere covers GST for GST-registered contractors — additional 15% on
    // top of the base fee (see Ian Mallett query 2026-09-20; TripleO model).
    // If a saved payroll row already has a frozen gst_amount, prefer that
    // (protects against provider toggling GST status after payroll was
    // calculated). Otherwise compute from current provider state.
    const gstEligible  = !!p.gst_registered
    const gstAmount    = saved?.gst_amount != null
      ? Number(saved.gst_amount)
      : (gstEligible ? parseFloat((total * 0.15).toFixed(2)) : 0)
    const totalPayable = parseFloat((total + gstAmount).toFixed(2))
    return {
      id:                 saved?.id || null,
      provider_id:        p.id,
      provider_name:      [p.first_name, p.last_name, p.credential].filter(Boolean).join(' '),
      provider_email:     p.email || null,
      provider_color:     p.color || '#0B6E76',
      period_start,
      period_end,
      consultation_count: count,
      base_rate:          rate,
      total_amount:       total,           // base fees only (services)
      gst_registered:     gstEligible,
      gst_number:         p.gst_number || null,
      gst_amount:         gstAmount,       // 15% uplift where applicable
      total_payable:      totalPayable,    // what Tere actually pays out
      status:             saved?.status || 'draft',
      paid_at:            saved?.paid_at || null,
      notes:              saved?.notes || null,
    }
  })
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const isAdminLike = !!(auth.provider?.is_admin || auth.provider?.is_billing_admin)
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // ── GET ───────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { type, period_start, period_end, provider_id } = req.query

    if (type === 'fortnights') {
      return res.status(200).json({ fortnights: getPastFortnights(13) })
    }

    if (type === 'summary') {
      if (!period_start || !period_end) return res.status(400).json({ error: 'Missing period' })
      // Per-provider self-view (ProviderEarnings) — return just one row.
      if (provider_id) {
        if (!canSeeProvider(auth, provider_id)) return res.status(403).json({ error: 'Forbidden' })
        const summaries = await buildSummaries(supabase, period_start, period_end)
        const one = summaries.find(s => s.provider_id === provider_id) || null
        return res.status(200).json({ summary: one })
      }
      // Full-org overview — admin only.
      if (!isAdminLike) return res.status(403).json({ error: 'Admin role required' })
      const summaries = await buildSummaries(supabase, period_start, period_end)
      const total_payroll       = parseFloat(summaries.reduce((s, x) => s + x.total_amount, 0).toFixed(2))
      const total_consultations = summaries.reduce((s, x) => s + x.consultation_count, 0)
      const active_providers    = summaries.filter(x => x.consultation_count > 0).length
      const top_provider        = summaries.reduce((top, x) => x.consultation_count > (top?.consultation_count || 0) ? x : top, null)
      return res.status(200).json({
        summaries,
        overview: { total_payroll, total_consultations, active_providers, top_provider },
      })
    }

    if (type === 'history') {
      if (!provider_id) return res.status(400).json({ error: 'Missing provider_id' })
      if (!canSeeProvider(auth, provider_id)) return res.status(403).json({ error: 'Forbidden' })
      const { data } = await supabase.from('payroll_periods').select('*').eq('provider_id', provider_id)
        .order('period_start', { ascending: false }).limit(24)
      return res.status(200).json({ periods: data || [] })
    }

    if (type === 'ytd') {
      if (!provider_id) return res.status(400).json({ error: 'Missing provider_id' })
      if (!canSeeProvider(auth, provider_id)) return res.status(403).json({ error: 'Forbidden' })
      const year = new Date().getFullYear()
      const { data } = await supabase.from('payroll_periods').select('total_amount,consultation_count,period_start,period_end,status')
        .eq('provider_id', provider_id).gte('period_start', `${year}-01-01`).lte('period_end', `${year}-12-31`)
      const periods = data || []
      return res.status(200).json({
        ytd_total:         parseFloat(periods.reduce((s, p) => s + (p.total_amount || 0), 0).toFixed(2)),
        ytd_consultations: periods.reduce((s, p) => s + (p.consultation_count || 0), 0),
        periods,
      })
    }

    if (type === 'gst_watchlist') {
      // Rolling 12-month contractor earnings vs the IRD $60k GST-mandatory
      // threshold. IRD requires anyone with taxable turnover of $60k+ in
      // ANY 12-month window (past or forecast) to register within 21 days.
      // We only see the contractor's Tere earnings, so flag when Tere alone
      // approaches or crosses the threshold — the contractor may already
      // be over from other work, but this at least catches the obvious cases.
      //
      // Bands:
      //   ok         — under $48k (80% of threshold)
      //   approaching— $48k–$59.99k (nudge them to register or watch)
      //   exceeded   — $60k+ (mandatory registration, contact them today)
      //
      // Providers who are already gst_registered are excluded from the
      // watchlist entirely — they're covered.
      if (!isAdminLike) return res.status(403).json({ error: 'Admin role required' })
      const THRESHOLD = 60000
      const WARN      = THRESHOLD * 0.8    // 48000
      const cutoff    = new Date()
      cutoff.setDate(cutoff.getDate() - 365)
      const cutoffIso = cutoff.toISOString().slice(0, 10)

      const [{ data: periods }, { data: provs }] = await Promise.all([
        supabase.from('payroll_periods')
          .select('provider_id,total_amount,period_start')
          .gte('period_start', cutoffIso),
        supabase.from('providers')
          .select('id,first_name,last_name,credential,email,gst_registered,gst_number,is_active,is_provider')
          .eq('is_active', true),
      ])

      const byProvider = new Map()
      for (const p of periods || []) {
        byProvider.set(p.provider_id, (byProvider.get(p.provider_id) || 0) + Number(p.total_amount || 0))
      }

      const watchlist = (provs || [])
        .filter(p => p.is_provider && !p.gst_registered)
        .map(p => {
          const rolling12m = parseFloat((byProvider.get(p.id) || 0).toFixed(2))
          let band = 'ok'
          if (rolling12m >= THRESHOLD)  band = 'exceeded'
          else if (rolling12m >= WARN)  band = 'approaching'
          return {
            provider_id:   p.id,
            name:          [p.first_name, p.last_name].filter(Boolean).join(' '),
            credential:    p.credential,
            email:         p.email,
            rolling_12m:   rolling12m,
            threshold:     THRESHOLD,
            band,
            headroom:      parseFloat((THRESHOLD - rolling12m).toFixed(2)),
          }
        })
        // Only surface providers with any non-trivial earnings — no point
        // listing a fresh hire with $0 rolling.
        .filter(w => w.rolling_12m >= 1000)
        .sort((a, b) => b.rolling_12m - a.rolling_12m)

      return res.status(200).json({
        watchlist,
        counts: {
          exceeded:    watchlist.filter(w => w.band === 'exceeded').length,
          approaching: watchlist.filter(w => w.band === 'approaching').length,
          ok:          watchlist.filter(w => w.band === 'ok').length,
        },
        threshold: THRESHOLD,
        warn_at:   WARN,
      })
    }

    if (type === 'consultations') {
      if (!provider_id || !period_start || !period_end) return res.status(400).json({ error: 'Missing params' })
      if (!canSeeProvider(auth, provider_id)) return res.status(403).json({ error: 'Forbidden' })
      const { data } = await supabase.from('consultations')
        .select('id,created_at,patient_first_name,patient_last_name,consultation_type,acc_eligible,patient_joined_at,started_at,last_attempt_at,encounter_completed_at,completed_at,notes_finalised_at,clinical_notes')
        .eq('status', 'complete').eq('provider_id', provider_id).eq('payment_test_mode', false).eq('is_practice', false)
        .gte('created_at', period_start + 'T00:00:00.000Z').lte('created_at', period_end + 'T23:59:59.999Z')
        .order('created_at')
      // Derive audit signals per consult so the review modal can show
      // provider-saw-patient evidence without schema changes. Keep clinical
      // notes OUT of the response (summary metrics only — admin opens the
      // full chart if they need to read the notes).
      const enriched = (data || []).map(c => {
        const startT = c.last_attempt_at || c.started_at || c.patient_joined_at || null
        const endT   = c.encounter_completed_at || c.completed_at || null
        let durationMin = null
        if (startT && endT) {
          const diffMs = new Date(endT).getTime() - new Date(startT).getTime()
          if (diffMs > 0 && diffMs < 6 * 60 * 60 * 1000) durationMin = Math.round(diffMs / 60000)
        }
        // SOAP word count from clinical_notes { S, O, A, P } — guards against
        // non-object / missing / null fields.
        let wordCount = 0
        const notes = c.clinical_notes || {}
        for (const k of ['S','O','A','P','subjective','objective','assessment','plan']) {
          const v = notes?.[k]
          if (typeof v === 'string' && v.trim()) wordCount += v.trim().split(/\s+/).length
        }
        return {
          id: c.id,
          created_at: c.created_at,
          patient_first_name: c.patient_first_name,
          patient_last_name: c.patient_last_name,
          consultation_type: c.consultation_type,
          acc_eligible: c.acc_eligible,
          duration_min:         durationMin,
          patient_joined:       !!c.patient_joined_at,
          notes_signed_at:      c.notes_finalised_at || c.encounter_completed_at || null,
          notes_word_count:     wordCount,
          short_id:             (c.id || '').slice(0, 8),
        }
      })
      return res.status(200).json({ consultations: enriched })
    }

    return res.status(400).json({ error: 'Invalid type' })
  }

  // ── POST ──────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action } = req.body

    // Every mutating POST here is admin-only EXCEPT payslip which non-admin
    // providers can self-request for their own periods (checked below).
    if (['calculate','approve','approve_all','mark_paid','mark_all_paid','confirm_paid','send_email'].includes(action)) {
      if (!isAdminLike) return res.status(403).json({ error: 'Admin role required' })
    }

    if (action === 'calculate') {
      const { period_start, period_end } = req.body
      if (!period_start || !period_end) return res.status(400).json({ error: 'Missing period' })
      const summaries = await buildSummaries(supabase, period_start, period_end)

      // Pull provider GST + BCTI-consent state so we can assign a BCTI number
      // to GST-registered + consented providers at calculate time (not at
      // confirm_paid). One BCTI per provider per fortnight, number stays with
      // the row for its lifetime. If the row already has a bcti_number from
      // a previous calculate, reuse it (idempotent recalc).
      const providerIds = summaries.map(s => s.provider_id).filter(Boolean)
      const [{ data: provs }, { data: existingRows }] = await Promise.all([
        supabase.from('providers').select('id,gst_registered,gst_bcti_consent_at').in('id', providerIds),
        supabase.from('payroll_periods').select('provider_id,bcti_number').eq('period_start', period_start).eq('period_end', period_end),
      ])
      const provMap    = Object.fromEntries((provs || []).map(p => [p.id, p]))
      const existingBc = Object.fromEntries((existingRows || []).map(r => [r.provider_id, r.bcti_number]))

      // For any new BCTI assignments this calc needs a fresh number; grab
      // the current highest and increment per-row below.
      const { data: topBc } = await supabase.from('payroll_periods')
        .select('bcti_number').not('bcti_number', 'is', null)
        .order('bcti_number', { ascending: false }).limit(1)
      let seqN = topBc?.[0]?.bcti_number ? parseInt(String(topBc[0].bcti_number).split('-').pop(), 10) : 0
      const yr = new Date().getFullYear()

      const upserts = summaries.map(s => {
        const p = provMap[s.provider_id]
        const gstEligible = !!p?.gst_registered && !!p?.gst_bcti_consent_at
        // Keep existing BCTI number if already issued; otherwise mint one
        // for GST+consented providers. Non-GST providers stay bcti_number
        // null (they get a Remittance Advice, no IRD doc needed).
        let bctiNumber = existingBc[s.provider_id] || null
        if (!bctiNumber && gstEligible) {
          seqN += 1
          bctiNumber = `BCTI-${yr}-${String(seqN).padStart(5, '0')}`
        }
        return {
          period_start: s.period_start, period_end: s.period_end, provider_id: s.provider_id,
          consultation_count: s.consultation_count,
          total_amount:       s.total_amount,
          // Freeze GST uplift at calculate time — if the provider toggles GST
          // later, this period reflects the state when it was calculated.
          gst_amount:         s.gst_amount,
          bcti_number:        bctiNumber,
          // Preserve existing status if already approved/paid
          ...(s.status === 'draft' ? {} : { status: s.status }),
        }
      })
      const { error } = await supabase.from('payroll_periods')
        .upsert(upserts, { onConflict: 'provider_id,period_start' })
      if (error) { console.error('[payroll] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true, count: upserts.length })
    }

    if (action === 'approve') {
      const { period_id } = req.body
      const { error } = await supabase.from('payroll_periods').update({ status: 'approved' })
        .eq('id', period_id).eq('status', 'draft')
      if (error) { console.error('[payroll] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true })
    }

    if (action === 'approve_all') {
      const { period_start, period_end } = req.body
      const { error } = await supabase.from('payroll_periods').update({ status: 'approved' })
        .eq('period_start', period_start).eq('period_end', period_end).eq('status', 'draft')
      if (error) { console.error('[payroll] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true })
    }

    if (action === 'mark_paid') {
      const { period_id } = req.body
      const { error } = await supabase.from('payroll_periods')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', period_id).eq('status', 'approved')
      if (error) { console.error('[payroll] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true })
    }

    // confirm_paid — admin has just completed the bank transfer and types the
    // actual amount that left Tere's account. We refuse unless it matches the
    // calculated payable within 1c (fat-finger guard — e.g. $2.50 vs $25.00,
    // or payer swapped two providers). On match we stamp confirmed_paid_at,
    // record who confirmed, assign a sequential BCTI number for GST-registered
    // providers, and flip status → paid. send_email then checks for
    // confirmed_paid_at and will not fire without it.
    if (action === 'confirm_paid') {
      const { period_id, actual_paid_amount } = req.body
      if (!period_id) return res.status(400).json({ error: 'period_id required' })
      if (actual_paid_amount == null || !Number.isFinite(Number(actual_paid_amount))) {
        return res.status(400).json({ error: 'actual_paid_amount required (NZD number)' })
      }
      const actual = Number(actual_paid_amount)

      const { data: row, error: readErr } = await supabase.from('payroll_periods').select('*').eq('id', period_id).single()
      if (readErr || !row) return res.status(404).json({ error: 'Period not found' })
      if (row.status === 'paid') return res.status(400).json({ error: 'Already marked paid' })
      if (row.status !== 'approved') return res.status(400).json({ error: `Cannot confirm from status "${row.status}" — approve first` })

      const expected = parseFloat((Number(row.total_amount) + Number(row.gst_amount || 0)).toFixed(2))
      if (Math.abs(actual - expected) > 0.01) {
        return res.status(400).json({
          error: 'Mismatch between amount transferred and calculated payable',
          expected, actual, diff: parseFloat((actual - expected).toFixed(2)),
        })
      }

      // BCTI number is assigned at calculate time (not here) so there's one
      // PDF per provider per fortnight and admin can preview the exact
      // BCTI before transferring. Confirm Paid just records the transfer +
      // flips status; if a transfer is later voided, the BCTI is cancelled
      // with an IRD credit note referencing the original number (standard
      // IRD process, not our concern at this layer).
      const update = {
        status:              'paid',
        paid_at:             new Date().toISOString(),
        actual_paid_amount:  actual,
        confirmed_paid_at:   new Date().toISOString(),
        confirmed_paid_by:   auth.provider?.id || null,
      }
      const { error } = await supabase.from('payroll_periods').update(update).eq('id', period_id).eq('status', 'approved')
      if (error) { console.error('[payroll] confirm_paid failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true, bcti_number: row.bcti_number })
    }

    if (action === 'mark_all_paid') {
      const { period_start, period_end } = req.body
      const { error } = await supabase.from('payroll_periods')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('period_start', period_start).eq('period_end', period_end).eq('status', 'approved')
      if (error) { console.error('[payroll] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true })
    }

    if (action === 'payslip') {
      const { provider_id, period_start, period_end, period_id } = req.body
      let ps = period_start, pe = period_end, pid = provider_id

      if (period_id) {
        const { data: row } = await supabase.from('payroll_periods').select('*').eq('id', period_id).single()
        if (!row) return res.status(404).json({ error: 'Period not found' })
        ps = row.period_start; pe = row.period_end; pid = row.provider_id
      }

      // Non-admin providers may only download their OWN payslip.
      if (!canSeeProvider(auth, pid)) return res.status(403).json({ error: 'Forbidden' })

      const [{ data: prov }, { data: consultations }, { data: savedRow }] = await Promise.all([
        supabase.from('providers').select('first_name,last_name,credential,email,base_rate,gst_registered,gst_number').eq('id', pid).single(),
        supabase.from('consultations')
          .select('id,created_at,patient_first_name,patient_last_name,consultation_type,acc_eligible')
          .eq('status', 'complete').eq('provider_id', pid).eq('payment_test_mode', false).eq('is_practice', false)
          .gte('created_at', ps + 'T00:00:00.000Z').lte('created_at', pe + 'T23:59:59.999Z')
          .order('created_at'),
        supabase.from('payroll_periods').select('gst_amount,bcti_number').eq('provider_id', pid).eq('period_start', ps).eq('period_end', pe).maybeSingle(),
      ])

      const rows  = consultations || []
      const count = rows.length
      const rate  = Number(prov?.base_rate ?? FALLBACK_RATE)
      const total = parseFloat((count * rate).toFixed(2))
      // Prefer the frozen gst_amount on the saved payroll row; fall back to
      // live provider status if this is an ad-hoc payslip request.
      const gstAmount = savedRow?.gst_amount != null
        ? Number(savedRow.gst_amount)
        : (prov?.gst_registered ? parseFloat((total * 0.15).toFixed(2)) : 0)
      const totalPayable = parseFloat((total + gstAmount).toFixed(2))

      const { buildPayslipPdf } = await import('./_pdf-builders.js')
      const pdfBuffer = await buildPayslipPdf({
        provider: prov, period_start: ps, period_end: pe,
        consultations: rows,
        consultation_count: count, base_rate: rate,
        total_amount:   total,
        gst_amount:     gstAmount,
        gst_number:     prov?.gst_number || null,
        total_payable:  totalPayable,
        bcti_number:    savedRow?.bcti_number || null,
      })

      const isBcti = !!savedRow?.bcti_number
      return res.status(200).json({
        pdf: pdfBuffer.toString('base64'),
        filename: `${isBcti ? 'bcti' : 'payslip'}-${(prov?.last_name || 'provider').toLowerCase()}-${ps}.pdf`,
      })
    }

    if (action === 'send_email') {
      const { provider_id, period_start, period_end } = req.body
      const canEmail = hasEmailProvider()
      if (!canEmail) return res.status(400).json({ error: 'Email not configured' })

      const summaries = await buildSummaries(supabase, period_start, period_end)
      const s = summaries.find(x => x.provider_id === provider_id)
      if (!s) return res.status(404).json({ error: 'Provider not found' })
      if (!s.provider_email) return res.status(400).json({ error: 'Provider has no email on file' })

      // Gate — refuse to send the BCTI/remittance email unless admin has
      // confirmed the bank transfer amount. Prevents an email claiming
      // payment when the transfer either never happened or was wrong.
      const { data: periodRow } = await supabase.from('payroll_periods')
        .select('confirmed_paid_at,bcti_number,actual_paid_amount')
        .eq('provider_id', provider_id).eq('period_start', period_start).eq('period_end', period_end).maybeSingle()
      if (!periodRow?.confirmed_paid_at) {
        return res.status(400).json({ error: 'Confirm bank transfer amount first (confirm_paid action) before emailing the BCTI.' })
      }

      const firstName = (s.provider_name || '').split(' ')[0]
      const fmtDate = d => new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
      const periodStr = `${fmtDate(period_start)} – ${fmtDate(period_end)}`
      const paidDateStr  = fmtDate(periodRow.confirmed_paid_at)
      const paidAmtStr   = `$${Number(periodRow.actual_paid_amount ?? s.total_payable ?? s.total_amount).toFixed(2)}`
      const isBctiEmail  = !!periodRow.bcti_number
      const disclaimer   = isBctiEmail
        ? `This is a <strong>Buyer-Created Tax Invoice (BCTI)</strong> issued by Tere Health Limited (GST 148-897-530) on your behalf under the GST Act 1985 s24(2) — per your consent on your Tere Health profile. Declare the GST shown above as output tax in your own GST return as normal. Tere Health does not deduct PAYE; you remain responsible for income tax and ACC levies.`
        : `This payment is for contractor services. As a contractor you are responsible for your own tax obligations. Tere Health Limited does not deduct PAYE. Please consult a tax adviser regarding your obligations.`

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:15px;color:#374151;margin:0 0 24px">Your Tere Health earnings for <strong>${periodStr}</strong> have been paid. The ${isBctiEmail ? 'Buyer-Created Tax Invoice' : 'Remittance Advice'} is attached for your records.</p>
    <div style="background:#F0F9FA;border:1px solid #D4EEF0;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="color:#6B7280;padding:4px 0">${s.consultation_count} consultations × $${Number(s.base_rate).toFixed(2)}</td><td style="text-align:right;color:#374151">$${s.total_amount.toFixed(2)}</td></tr>
        ${s.gst_amount > 0 ? `<tr><td style="color:#6B7280;padding:4px 0">GST 15%${s.gst_number ? ` (${s.gst_number})` : ''}</td><td style="text-align:right;color:#374151">$${Number(s.gst_amount).toFixed(2)}</td></tr>` : ''}
        <tr style="border-top:1px solid #D4EEF0"><td style="font-weight:700;color:#0D2B45;padding-top:12px">Total payable</td><td style="text-align:right;font-weight:800;color:#0B6E76;font-size:20px;padding-top:12px">$${Number(s.total_payable ?? s.total_amount).toFixed(2)}</td></tr>
        ${periodRow.actual_paid_amount != null ? `<tr><td colspan="2" style="padding-top:12px;font-size:13px;color:#065F46"><strong>Paid ${paidDateStr}</strong> — ${paidAmtStr} transferred to your bank account on file.</td></tr>` : ''}
      </table>
    </div>
    <p style="font-size:13px;color:#6B7280;margin:0 0 20px">Questions? <a href="mailto:hello@terehealth.co.nz" style="color:#0B6E76">hello@terehealth.co.nz</a></p>
    <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:14px 16px;font-size:12px;color:#78350F;line-height:1.6">
      ${disclaimer}
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health Limited · terehealth.co.nz
  </div>
</body></html>`

      // Attach the PDF — BCTI for GST-registered providers (periodRow.bcti_number
      // is assigned by confirm_paid), Remittance Advice for non-GST. Either
      // way the email carries an IRD-appropriate document.
      const { buildPayslipPdf } = await import('./_pdf-builders.js')
      const { data: consultRows } = await supabase.from('consultations')
        .select('id,created_at,patient_first_name,patient_last_name,consultation_type,acc_eligible')
        .eq('status', 'complete').eq('provider_id', provider_id).eq('payment_test_mode', false).eq('is_practice', false)
        .gte('created_at', period_start + 'T00:00:00.000Z').lte('created_at', period_end + 'T23:59:59.999Z')
        .order('created_at')
      const { data: prov } = await supabase.from('providers')
        .select('first_name,last_name,credential,email,base_rate,gst_registered,gst_number,ird_number,bank_account')
        .eq('id', provider_id).single()
      const pdfBuffer = await buildPayslipPdf({
        provider: prov, period_start, period_end,
        consultations: consultRows || [],
        consultation_count: s.consultation_count, base_rate: s.base_rate,
        total_amount:   s.total_amount,
        gst_amount:     s.gst_amount,
        gst_number:     s.gst_number,
        total_payable:  s.total_payable,
        bcti_number:    periodRow.bcti_number,
      })

      const isBcti = !!periodRow.bcti_number
      const docLabel = isBcti ? 'Buyer-Created Tax Invoice' : 'Remittance Advice'
      const filename = `${isBcti ? 'bcti' : 'remittance'}-${(s.provider_name || 'provider').toLowerCase().replace(/\s+/g,'-')}-${period_start}.pdf`

      const r = await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'hello@terehealth.co.nz',
        to: [s.provider_email],
        subject: `${docLabel} — Tere Health ${periodStr}`,
        html,
        attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
      })
      if (!r.ok) return res.status(500).json({ error: 'Email send failed' })

      await supabase.from('payroll_periods').update({ bcti_sent_to: s.provider_email })
        .eq('provider_id', provider_id).eq('period_start', period_start).eq('period_end', period_end)

      return res.status(200).json({ ok: true, document: docLabel, bcti_number: periodRow.bcti_number })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
