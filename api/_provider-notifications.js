export default async function handler(req, res) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    )

    if (req.method === 'GET') {
      const { providerId } = req.query
      const { data, error } = await supabase
        .from('provider_notifications')
        .select('*')
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
      const { from_name, subject, body, is_pinned } = req.body
      if (!subject || !body) return res.status(400).json({ error: 'subject and body required' })
      const { data, error } = await supabase.from('provider_notifications').insert({
        from_name: from_name || 'Admin',
        subject,
        body,
        is_pinned: is_pinned || false,
      }).select().single()
      if (error) throw error
      return res.status(201).json({ notification: data })
    }

    if (req.method === 'PATCH') {
      const { id, providerId, markAllRead } = req.body
      if (!providerId) return res.status(400).json({ error: 'providerId required' })

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
    res.status(500).json({ error: e.message })
  }
}
