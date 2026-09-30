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
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) {
    return res.status(403).json({ error: 'Admin only' })
  }

  let to = req.query?.to || null
  const useSelf = req.query?.self === '1'

  if (useSelf) {
    const sb = admin()
    const { data: me } = await sb.from('providers')
      .select('mobile_phone, sms_on_call, sms_on_call_last_sent_at')
      .eq('id', auth.provider.id)
      .maybeSingle()
    to = me?.mobile_phone || null
    if (!to) {
      return res.status(400).json({
        error: 'No mobile_phone on your provider row',
        provider_row: me,
      })
    }
    const rawResult = await sendSms({ to, body: 'Tere: test SMS from admin diagnostic — you should be able to receive on-call pings.' })
    return res.status(200).json({
      to,
      provider_row: me,
      sms_result: rawResult,
    })
  }

  if (!to) return res.status(400).json({ error: 'Missing ?to=+64... or ?self=1' })
  const rawResult = await sendSms({ to, body: 'Tere: admin test SMS.' })
  return res.status(200).json({ to, sms_result: rawResult })
}
