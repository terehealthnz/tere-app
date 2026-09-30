// Admin-only diagnostic: fires a test SMS to a phone number and returns the
// full provider result (or error). Use to sanity-check SNS creds + phone
// number normalisation when on-call notifications aren't arriving.
//
// GET /api/admin-test-sms?to=+64294323427
// GET /api/admin-test-sms?self=1  (uses caller's provider.mobile_phone)

import { guardProvider } from './_auth.js'
import { sendSms } from './_sms.js'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  try {
    const auth = await guardProvider(req, res)
    if (!auth) return

    let to = req.query?.to || null
    const useSelf = req.query?.self === '1'

    // Any signed-in provider can self-test to their own saved number
    // (harmless — it's just a message to them). Sending to an arbitrary
    // ?to= number stays admin-only.
    if (!useSelf && !auth.provider?.is_admin) {
      return res.status(403).json({ error: 'Admin only for arbitrary numbers — use ?self=1 to test your own.' })
    }

    if (useSelf) {
      const sb = admin()
      const { data: me, error: readErr } = await sb.from('providers')
        .select('mobile_phone, sms_on_call, sms_on_call_last_sent_at')
        .eq('id', auth.provider.id)
        .maybeSingle()
      if (readErr) {
        return res.status(500).json({ error: 'DB read failed', detail: readErr.message })
      }
      to = me?.mobile_phone || null
      if (!to) {
        return res.status(400).json({
          error: 'No mobile_phone on your provider row',
          provider_row: me,
        })
      }
      const rawResult = await sendSms({ to, body: 'Tere: test SMS from admin diagnostic — you should be able to receive on-call pings.' })
      const status = rawResult?.ok ? 200 : (rawResult?.skipped ? 200 : 502)
      return res.status(status).json({
        ok: !!rawResult?.ok,
        to,
        provider_row: me,
        sms_result: rawResult,
        error: rawResult?.ok ? undefined : (rawResult?.error || rawResult?.reason || 'SMS send failed'),
      })
    }

    if (!to) return res.status(400).json({ error: 'Missing ?to=+64... or ?self=1' })
    const rawResult = await sendSms({ to, body: 'Tere: admin test SMS.' })
    const status = rawResult?.ok ? 200 : (rawResult?.skipped ? 200 : 502)
    return res.status(status).json({
      ok: !!rawResult?.ok,
      to,
      sms_result: rawResult,
      error: rawResult?.ok ? undefined : (rawResult?.error || rawResult?.reason || 'SMS send failed'),
    })
  } catch (e) {
    console.error('[admin-test-sms] fatal', e?.message || e, e?.stack)
    return res.status(500).json({ error: 'Server error', detail: String(e?.message || e) })
  }
}
