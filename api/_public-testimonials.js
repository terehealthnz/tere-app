// Public unauthenticated feed of approved + publishable testimonials.
// Backs the /testimonials page.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const supabase = admin()
  const { data, error } = await supabase
    .from('patient_feedback')
    .select('id, patient_display_name, testimonial_text, created_at')
    .eq('status', 'approved')
    .eq('allow_publish', true)
    .not('testimonial_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.error('[public-testimonials] query failed:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
  const testimonials = (data || []).map(r => ({
    display_name: r.patient_display_name || 'A patient',
    text: r.testimonial_text,
    created_at: r.created_at,
  }))
  return res.status(200).json({ testimonials })
}
