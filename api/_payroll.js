// Payroll API — calculate, approve, mark paid, payslips, emails
import { createClient } from '@supabase/supabase-js'

const BASE_RATE = 15.00
const HOLIDAY_PAY_RATE = 0.08

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
    supabase.from('providers').select('id,first_name,last_name,credential,color,email').eq('is_active', true).order('first_name'),
    supabase.from('consultations').select('provider_id').eq('status', 'complete').not('provider_id', 'is', null)
      .gte('created_at', period_start + 'T00:00:00.000Z')
      .lte('created_at', period_end + 'T23:59:59.999Z'),
    supabase.from('payroll_periods').select('*').eq('period_start', period_start).eq('period_end', period_end),
  ])

  const countMap  = {}
  for (const c of consultations || []) countMap[c.provider_id] = (countMap[c.provider_id] || 0) + 1
  const savedMap = {}
  for (const r of payrollRows || []) savedMap[r.provider_id] = r

  return (providers || []).map(p => {
    const count   = countMap[p.id] || 0
    const saved   = savedMap[p.id]
    const base    = parseFloat((count * BASE_RATE).toFixed(2))
    const hol     = parseFloat((base * HOLIDAY_PAY_RATE).toFixed(2))
    const total   = parseFloat((base + hol).toFixed(2))
    return {
      id:                 saved?.id || null,
      provider_id:        p.id,
      provider_name:      [p.first_name, p.last_name, p.credential].filter(Boolean).join(' '),
      provider_email:     p.email || null,
      provider_color:     p.color || '#0B6E76',
      period_start,
      period_end,
      consultation_count: count,
      base_rate:          BASE_RATE,
      holiday_pay_rate:   HOLIDAY_PAY_RATE,
      base_amount:        base,
      holiday_pay_amount: hol,
      total_amount:       total,
      status:             saved?.status || 'draft',
      paid_at:            saved?.paid_at || null,
      notes:              saved?.notes || null,
    }
  })
}

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // ── GET ───────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { type, period_start, period_end, provider_id } = req.query

    if (type === 'fortnights') {
      return res.status(200).json({ fortnights: getPastFortnights(13) })
    }

    if (type === 'summary') {
      if (!period_start || !period_end) return res.status(400).json({ error: 'Missing period' })
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
      const { data } = await supabase.from('payroll_periods').select('*').eq('provider_id', provider_id)
        .order('period_start', { ascending: false }).limit(24)
      return res.status(200).json({ periods: data || [] })
    }

    if (type === 'ytd') {
      if (!provider_id) return res.status(400).json({ error: 'Missing provider_id' })
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

    if (type === 'consultations') {
      if (!provider_id || !period_start || !period_end) return res.status(400).json({ error: 'Missing params' })
      const { data } = await supabase.from('consultations')
        .select('id,created_at,patient_first_name,patient_last_name,consultation_type,acc_eligible')
        .eq('status', 'complete').eq('provider_id', provider_id)
        .gte('created_at', period_start + 'T00:00:00.000Z').lte('created_at', period_end + 'T23:59:59.999Z')
        .order('created_at')
      return res.status(200).json({ consultations: data || [] })
    }

    return res.status(400).json({ error: 'Invalid type' })
  }

  // ── POST ──────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action } = req.body

    if (action === 'calculate') {
      const { period_start, period_end } = req.body
      if (!period_start || !period_end) return res.status(400).json({ error: 'Missing period' })
      const summaries = await buildSummaries(supabase, period_start, period_end)
      const upserts = summaries.map(s => ({
        period_start: s.period_start, period_end: s.period_end, provider_id: s.provider_id,
        consultation_count: s.consultation_count, base_rate: s.base_rate,
        holiday_pay_rate: s.holiday_pay_rate, base_amount: s.base_amount,
        holiday_pay_amount: s.holiday_pay_amount, total_amount: s.total_amount,
        // Preserve existing status if already approved/paid
        ...(s.status === 'draft' ? {} : { status: s.status }),
      }))
      const { error } = await supabase.from('payroll_periods')
        .upsert(upserts, { onConflict: 'provider_id,period_start' })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true, count: upserts.length })
    }

    if (action === 'approve') {
      const { period_id } = req.body
      const { error } = await supabase.from('payroll_periods').update({ status: 'approved' })
        .eq('id', period_id).eq('status', 'draft')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (action === 'approve_all') {
      const { period_start, period_end } = req.body
      const { error } = await supabase.from('payroll_periods').update({ status: 'approved' })
        .eq('period_start', period_start).eq('period_end', period_end).eq('status', 'draft')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (action === 'mark_paid') {
      const { period_id } = req.body
      const { error } = await supabase.from('payroll_periods')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', period_id).eq('status', 'approved')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (action === 'mark_all_paid') {
      const { period_start, period_end } = req.body
      const { error } = await supabase.from('payroll_periods')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('period_start', period_start).eq('period_end', period_end).eq('status', 'approved')
      if (error) return res.status(500).json({ error: error.message })
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

      const [{ data: prov }, { data: consultations }] = await Promise.all([
        supabase.from('providers').select('first_name,last_name,credential,email').eq('id', pid).single(),
        supabase.from('consultations')
          .select('id,created_at,patient_first_name,patient_last_name,consultation_type,acc_eligible')
          .eq('status', 'complete').eq('provider_id', pid)
          .gte('created_at', ps + 'T00:00:00.000Z').lte('created_at', pe + 'T23:59:59.999Z')
          .order('created_at'),
      ])

      const count   = (consultations || []).length
      const base    = parseFloat((count * BASE_RATE).toFixed(2))
      const hol     = parseFloat((base * HOLIDAY_PAY_RATE).toFixed(2))
      const total   = parseFloat((base + hol).toFixed(2))

      const { buildPayslipPdf } = await import('./_pdf-builders.js')
      const pdfBuffer = await buildPayslipPdf({
        provider: prov, period_start: ps, period_end: pe,
        consultations: consultations || [],
        consultation_count: count, base_rate: BASE_RATE, holiday_pay_rate: HOLIDAY_PAY_RATE,
        base_amount: base, holiday_pay_amount: hol, total_amount: total,
      })

      return res.status(200).json({
        pdf: pdfBuffer.toString('base64'),
        filename: `payslip-${(prov?.last_name || 'provider').toLowerCase()}-${ps}.pdf`,
      })
    }

    if (action === 'send_email') {
      const { provider_id, period_start, period_end } = req.body
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) return res.status(400).json({ error: 'Email not configured' })

      const summaries = await buildSummaries(supabase, period_start, period_end)
      const s = summaries.find(x => x.provider_id === provider_id)
      if (!s) return res.status(404).json({ error: 'Provider not found' })
      if (!s.provider_email) return res.status(400).json({ error: 'Provider has no email on file' })

      const firstName = (s.provider_name || '').split(' ')[0]
      const fmtDate = d => new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
      const periodStr = `${fmtDate(period_start)} – ${fmtDate(period_end)}`

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
    <div style="color:rgba(212,238,240,.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-top:2px">He tere, he ora</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:15px;color:#374151;margin:0 0 24px">Your Tere Health earnings for <strong>${periodStr}</strong> are ready.</p>
    <div style="background:#F0F9FA;border:1px solid #D4EEF0;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="color:#6B7280;padding:4px 0">Consultations</td><td style="text-align:right;font-weight:700;color:#0D2B45">${s.consultation_count}</td></tr>
        <tr><td style="color:#6B7280;padding:4px 0">Base ($${s.base_rate.toFixed(2)} × ${s.consultation_count})</td><td style="text-align:right;color:#374151">$${s.base_amount.toFixed(2)}</td></tr>
        <tr><td style="color:#6B7280;padding:4px 0">Holiday pay (8%)</td><td style="text-align:right;color:#374151">$${s.holiday_pay_amount.toFixed(2)}</td></tr>
        <tr style="border-top:1px solid #D4EEF0"><td style="font-weight:700;color:#0D2B45;padding-top:12px">Total</td><td style="text-align:right;font-weight:800;color:#0B6E76;font-size:20px;padding-top:12px">$${s.total_amount.toFixed(2)}</td></tr>
      </table>
    </div>
    <p style="font-size:14px;color:#6B7280;margin:0 0 20px">Payment will be processed within 2 working days. Questions? <a href="mailto:admin@terehealth.co.nz" style="color:#0B6E76">admin@terehealth.co.nz</a></p>
    <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:14px 16px;font-size:12px;color:#78350F;line-height:1.6">
      This payment is for contractor services. As a contractor you are responsible for your own tax obligations. Tere Health Limited does not deduct PAYE. Please consult a tax adviser regarding your obligations.
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    He tere, he ora · Tere Health Limited · terehealth.co.nz
  </div>
</body></html>`

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Tere Health <payroll@terehealth.co.nz>',
          to: [s.provider_email],
          subject: `Your Tere Health earnings — ${periodStr}`,
          html,
        }),
      })
      if (!r.ok) return res.status(500).json({ error: 'Email send failed' })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
