// /api/provider-notifications — clinician-facing broadcast + inbox.
//
// GET   — returns broadcasts (to_provider_id IS NULL) + notifications
//         targeted at the caller. is_read flag reflects the caller's
//         entry in the read_by array.
// POST  — admin-only broadcast create. Server ignores any caller-supplied
//         provider fields; from_name defaults to the admin's display name.
// PATCH — mark one notification (id) or all notifications as read for the
//         caller. Cannot mark on behalf of another provider.
//
// AuthN: guardProvider at router (see AUTH_REQUIRED_ROUTES in handler.js).
// AuthZ: caller identity from req.auth.provider.id — NEVER from query/body.
// Historically the endpoint trusted a client-supplied providerId which let
// any authenticated caller read another provider's targeted notifications,
// mark them read, or broadcast a fake admin announcement. Task #563.

export default async function handler(req, res) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    )

    const provider = req.auth?.provider
    const providerId = provider?.id
    if (!providerId) return res.status(401).json({ error: 'Not authenticated' })

    if (req.method === 'GET') {
      // Broadcasts + notifications targeted at THIS caller. Server-derived
      // providerId — client can't request someone else's inbox.
      const { data, error } = await supabase
        .from('provider_notifications')
        .select('*')
        .or(`to_provider_id.is.null,to_provider_id.eq.${providerId}`)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      const notifications = (data || []).map(n => ({
        ...n,
        is_read: Array.isArray(n.read_by) ? n.read_by.includes(providerId) : false,
      }))
      return res.status(200).json({ notifications })
    }

    if (req.method === 'POST') {
      // Broadcast create — admin only. Anon POST previously let anyone
      // inject a fake admin announcement visible to every clinician.
      if (!provider.is_admin) {
        return res.status(403).json({ error: 'Admin role required to broadcast notifications' })
      }
      const { subject, body, is_pinned } = req.body || {}
      if (!subject || !body) return res.status(400).json({ error: 'subject and body required' })
      const fromName = [provider.first_name, provider.last_name].filter(Boolean).join(' ') || 'Admin'
      const { data, error } = await supabase.from('provider_notifications').insert({
        from_name: fromName,
        subject,
        body,
        is_pinned: !!is_pinned,
      }).select().single()
      if (error) throw error
      return res.status(201).json({ notification: data })
    }

    if (req.method === 'PATCH') {
      // Mark-read is always on behalf of the caller. Body providerId is
      // ignored to prevent one provider silencing another provider's inbox.
      const { id, markAllRead } = req.body || {}

      if (markAllRead) {
        const { data: all } = await supabase.from('provider_notifications').select('id,read_by')
        await Promise.all((all || []).map(n => {
          const readBy = Array.isArray(n.read_by) ? n.read_by : []
          if (readBy.includes(providerId)) return Promise.resolve()
          return supabase.from('provider_notifications')
            .update({ read_by: [...readBy, providerId] })
            .eq('id', n.id)
        }))
        return res.status(200).json({ ok: true })
      }

      if (!id) return res.status(400).json({ error: 'id or markAllRead required' })
      const { data: notif } = await supabase.from('provider_notifications').select('read_by').eq('id', id).single()
      const readBy = Array.isArray(notif?.read_by) ? notif.read_by : []
      if (!readBy.includes(providerId)) {
        await supabase.from('provider_notifications').update({ read_by: [...readBy, providerId] }).eq('id', id)
      }
      return res.status(200).json({ ok: true })
    }

    res.status(405).end()
  } catch (e) {
    console.error('[provider-notifications]', e)
    res.status(500).json({ error: 'Server error' })
  }
}
