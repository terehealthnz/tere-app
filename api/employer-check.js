// api/employer-check.js — check if patient is a covered employer employee
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { firstName, lastName, dob } = req.body || {}
  if (!firstName || !lastName) return res.status(400).json({ match: false })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )

  // Match on first + last name (case-insensitive), optionally DOB
  let q = supabase
    .from('employer_employees')
    .select('id, first_name, last_name, dob, employer_id, employers!inner(id, company_name, is_active)')
    .ilike('first_name', firstName.trim())
    .ilike('last_name',  lastName.trim())
    .eq('employers.is_active', true)
    .limit(5)

  const { data, error } = await q
  if (error || !data?.length) return res.json({ match: false })

  // If DOB provided, prefer exact match; otherwise take first result
  let matched = data[0]
  if (dob) {
    const dobExact = data.find(e => e.dob === dob)
    if (dobExact) matched = dobExact
  }

  const employer = matched.employers
  res.json({
    match: true,
    employerId:   employer.id,
    employerName: employer.company_name,
  })
}
