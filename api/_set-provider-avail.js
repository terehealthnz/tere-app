export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { providerId, isAvailable } = req.body
  if (!providerId || typeof isAvailable !== 'boolean') {
    return res.status(400).json({ error: 'providerId and isAvailable (boolean) required' })
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    )

    const { error: provErr } = await supabase
      .from('providers')
      .update({ is_available: isAvailable })
      .eq('id', providerId)

    if (provErr) throw provErr

    // Sync clinic availability
    let clinicIsOpen = isAvailable
    if (isAvailable) {
      const { error: availErr } = await supabase.from('availability')
        .update({ is_open: true, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (availErr) throw availErr
      // Promote any waitlisted consultations into the active queue
      await supabase.from('consultations')
        .update({ status: 'waiting', updated_at: new Date().toISOString() })
        .eq('status', 'waitlisted')
    } else {
      const { data: remaining } = await supabase
        .from('providers')
        .select('id')
        .eq('is_available', true)
        .eq('is_provider', true)
      clinicIsOpen = !!(remaining?.length)
      if (!clinicIsOpen) {
        const { error: availErr } = await supabase.from('availability')
          .update({ is_open: false, updated_at: new Date().toISOString() })
          .eq('id', 1)
        if (availErr) throw availErr
      }
    }

    res.status(200).json({ ok: true, clinicIsOpen })
  } catch (e) {
    console.error('[set-provider-avail]', e)
    res.status(500).json({ error: e.message })
  }
}
