// Practitioner's Supply Order + Standing Order admin endpoint.
//
// Used by Tere Health in its Medical Director capacity for third-party
// organisations. Admin-only throughout. Not in AUTH_REQUIRED_ROUTES
// because this endpoint handles only GET + POST actions behind an
// explicit guardProvider + is_admin check at the top.
//
// Actions:
//   GET  action=list                 — list organisations + all PSOs + SOs
//   POST action=create_org           — add a recipient organisation
//   POST action=issue_pso            — create a PSO + email the pharmacy
//   POST action=issue_standing_order — create a standing order (no email)
//   POST action=resend_pso           — re-fire the pharmacy email for an
//                                       existing issued PSO (if first send
//                                       bounced; audit-logged)

import { createClient } from '@supabase/supabase-js'
import { buildPsoPdf, buildStandingOrderPdf } from './_pdf-builders.js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import { writeAuditEvent } from './_audit-write.js'
import { guardProvider } from './_auth.js'

const sb = () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function fmtDate(d) {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00Z' : '')) : d
  return dt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

async function nextSeqNumber(supabase, kind) {
  // PSO-YYYY-NNNNN / SO-YYYY-NNNNN, sequential per calendar year.
  const year = new Date().getFullYear()
  const seq = kind === 'pso' ? 'pso_number_seq' : 'so_number_seq'
  const prefix = kind === 'pso' ? 'PSO' : 'SO'
  const { data, error } = await supabase.rpc('nextval', { seqname: seq }).catch(() => ({ data: null, error: null }))
  // Fallback if RPC not available — use a direct SQL via from()
  let n = data
  if (!n) {
    // SELECT nextval('<seq>') via raw query is not exposed; count existing rows this year as a weak fallback
    const table = kind === 'pso' ? 'psos' : 'standing_orders'
    const col   = kind === 'pso' ? 'pso_number' : 'so_number'
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
      .like(col, `${prefix}-${year}-%`)
    n = (count || 0) + 1
  }
  return `${prefix}-${year}-${String(n).padStart(5, '0')}`
}

async function fetchPrescriber(supabase, providerId) {
  const { data } = await supabase.from('providers')
    .select('id, first_name, last_name, credential, email, cpn, mcnz_registration_number, prescriber_number, hpi_number')
    .eq('id', providerId).maybeSingle()
  if (!data) return null
  const name = `Dr ${[data.first_name, data.last_name].filter(Boolean).join(' ')}${data.credential ? ', ' + data.credential : ''}`
  return {
    name,
    // Prefer explicit MCNZ registration column; fall back to legacy prescriber_number
    // for providers onboarded before the supervision migration split the two.
    mcnz: data.mcnz_registration_number || data.prescriber_number || null,
    cpn:  data.cpn || null,
    hpi:  data.hpi_number || null,
    email: data.email || 'patrick@terehealth.co.nz',
  }
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin only' })

  const supabase = sb()
  const method = req.method
  const action = req.query.action || req.body?.action

  try {
    // ── GET list ──────────────────────────────────────────────────────────
    if (method === 'GET' && (action === 'list' || !action)) {
      const [orgs, psos, sos] = await Promise.all([
        supabase.from('pso_organisations').select('*').order('name'),
        supabase.from('psos').select('*').order('created_at', { ascending: false }),
        supabase.from('standing_orders').select('*').order('created_at', { ascending: false }),
      ])
      return res.status(200).json({
        organisations: orgs.data || [],
        psos: psos.data || [],
        standing_orders: sos.data || [],
      })
    }

    // ── POST create organisation ──────────────────────────────────────────
    if (method === 'POST' && action === 'create_org') {
      const { name, base_location, contact_name, contact_email, notes } = req.body || {}
      if (!name) return res.status(400).json({ error: 'name required' })
      const { data, error } = await supabase.from('pso_organisations').insert({
        name, base_location, contact_name, contact_email, notes,
      }).select().single()
      if (error) { console.error('[pso] create_org failed:', error); return res.status(500).json({ error: error.message }) }
      return res.status(200).json({ organisation: data })
    }

    // ── POST issue PSO + email pharmacy ───────────────────────────────────
    if (method === 'POST' && action === 'issue_pso') {
      const {
        organisation_id, items, purpose, storage_location,
        pharmacy_name, pharmacy_address, pharmacy_email,
        valid_until, md_role_description,
      } = req.body || {}
      if (!organisation_id) return res.status(400).json({ error: 'organisation_id required' })
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'at least one item required' })
      if (!purpose) return res.status(400).json({ error: 'purpose required' })
      if (!pharmacy_name || !pharmacy_email) return res.status(400).json({ error: 'pharmacy name + email required' })

      const { data: org } = await supabase.from('pso_organisations').select('*').eq('id', organisation_id).maybeSingle()
      if (!org) return res.status(404).json({ error: 'Organisation not found' })

      const prescriber = await fetchPrescriber(supabase, auth.provider.id)
      if (!prescriber || !prescriber.mcnz) return res.status(400).json({ error: 'Issuing admin must have MCNZ number on their provider profile' })

      const psoNumber = await nextSeqNumber(supabase, 'pso')
      const issueDate = new Date().toISOString().slice(0, 10)
      const validUntilDate = valid_until || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)

      // Build PDF server-side
      const pdfBuffer = await buildPsoPdf({
        psoNumber,
        issueDate: fmtDate(issueDate),
        validUntil: fmtDate(validUntilDate),
        prescriberName: prescriber.name,
        prescriberMcnz: prescriber.mcnz,
        prescriberCpn: prescriber.cpn,
        prescriberEmail: prescriber.email,
        mdRoleDescription: md_role_description || `Medical Director of record for ${org.name}`,
        orgName: org.name,
        orgBase: org.base_location,
        contactName: org.contact_name,
        contactEmail: org.contact_email,
        storageLocation: storage_location,
        pharmacyName: pharmacy_name,
        pharmacyAddress: pharmacy_address,
        pharmacyEmail: pharmacy_email,
        items,
        purpose,
      })

      // Persist row before sending — makes the send retryable + auditable
      const { data: psoRow, error: insErr } = await supabase.from('psos').insert({
        pso_number: psoNumber,
        organisation_id,
        prescriber_id: auth.provider.id,
        items,
        purpose,
        storage_location,
        pharmacy_name,
        pharmacy_address,
        pharmacy_email,
        issue_date: issueDate,
        valid_until: validUntilDate,
        status: 'draft',
      }).select().single()
      if (insErr) { console.error('[pso] insert failed:', insErr); return res.status(500).json({ error: insErr.message }) }

      // Email the pharmacy with Kevin/contact cc'd
      let deliveryError = null
      if (hasEmailProvider()) {
        const b64 = pdfBuffer.toString('base64')
        const to = [pharmacy_email]
        const cc = org.contact_email ? [org.contact_email] : undefined
        const subject = `Practitioner's Supply Order — ${items.map(i => i.name).join(', ')} for ${org.name}`
        const html = `<p>Kia ora,</p>
<p>Please find attached a Practitioner's Supply Order (<strong>${psoNumber}</strong>) for the medicines listed below, to be dispensed to <strong>${org.name}</strong>${org.base_location ? ` (${org.base_location})` : ''}.</p>
<p><strong>Summary:</strong></p>
<ul>${items.map(i => `<li>${i.quantity ? i.quantity + ' × ' : ''}${i.name}${i.strength ? ' ' + i.strength : ''}${i.form ? ' (' + i.form + ')' : ''}</li>`).join('')}</ul>
<p><strong>Receiving contact:</strong> ${org.contact_name || '—'}${org.contact_email ? ` &lt;${org.contact_email}&gt;` : ''}</p>
<p>For invoicing or billing questions, please reply to the receiving contact directly.</p>
<p>If you need anything further from me (PSO expiry extension, additional items, clarification), please reply to this thread.</p>
<p>Ngā mihi,<br>${prescriber.name}<br>Medical Director — ${org.name}<br>Tere Health Limited · MCNZ ${prescriber.mcnz}${prescriber.cpn ? ` · HPI-CPN ${prescriber.cpn}` : ''}<br>${prescriber.email}<br>terehealth.co.nz</p>`
        try {
          await sendEmail({
            from: 'Tere Health <hello@terehealth.co.nz>',
            replyTo: prescriber.email,
            to, cc,
            subject,
            html,
            attachments: [{ filename: `${psoNumber}-${org.name.replace(/\s+/g, '-')}.pdf`, content: b64 }],
          })
        } catch (e) {
          deliveryError = e.message || 'Email send failed'
          console.error('[pso] email failed:', e)
        }
      } else {
        deliveryError = 'Email provider not configured'
      }

      // Flip to issued + stamp send bookkeeping
      const update = {
        status: 'issued',
        sent_at: deliveryError ? null : new Date().toISOString(),
        sent_to_pharmacy: deliveryError ? null : pharmacy_email,
        sent_cc: deliveryError ? null : (org.contact_email || null),
        delivery_error: deliveryError,
      }
      await supabase.from('psos').update(update).eq('id', psoRow.id)

      writeAuditEvent(req, auth, {
        event_type: 'pso.issued',
        resource_type: 'pso',
        resource_id: psoRow.id,
        metadata: { pso_number: psoNumber, organisation: org.name, pharmacy_email, items_count: items.length, delivery_error: deliveryError },
      })

      return res.status(200).json({
        pso: { ...psoRow, ...update },
        delivery_error: deliveryError,
      })
    }

    // ── POST issue standing order (no pharmacy email — org-internal doc) ──
    if (method === 'POST' && action === 'issue_standing_order') {
      const {
        organisation_id, title, indication, inclusion, exclusion, dose,
        documentation, linked_pso_id, review_date,
      } = req.body || {}
      if (!organisation_id) return res.status(400).json({ error: 'organisation_id required' })
      if (!title || !indication || !dose) return res.status(400).json({ error: 'title + indication + dose required' })

      const { data: org } = await supabase.from('pso_organisations').select('*').eq('id', organisation_id).maybeSingle()
      if (!org) return res.status(404).json({ error: 'Organisation not found' })

      const prescriber = await fetchPrescriber(supabase, auth.provider.id)
      if (!prescriber || !prescriber.mcnz) return res.status(400).json({ error: 'Issuing admin must have MCNZ number on their provider profile' })

      const soNumber = await nextSeqNumber(supabase, 'so')
      const issueDate = new Date().toISOString().slice(0, 10)
      const reviewDateFinal = review_date || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)

      // Fetch linked PSO + its pharmacy for display on the SO
      let linkedPsoNumber = null, linkedPharmacyName = null
      if (linked_pso_id) {
        const { data: pso } = await supabase.from('psos').select('pso_number,pharmacy_name').eq('id', linked_pso_id).maybeSingle()
        if (pso) { linkedPsoNumber = pso.pso_number; linkedPharmacyName = pso.pharmacy_name }
      }

      // Generate PDF — stored only, not emailed (SO is for the org's internal use)
      const pdfBuffer = await buildStandingOrderPdf({
        soNumber,
        title,
        indication,
        inclusion: inclusion || [],
        exclusion: exclusion || [],
        dose,
        documentation,
        issueDate: fmtDate(issueDate),
        reviewDate: fmtDate(reviewDateFinal),
        prescriberName: prescriber.name,
        prescriberMcnz: prescriber.mcnz,
        prescriberCpn: prescriber.cpn,
        orgName: org.name,
        linkedPsoNumber,
        pharmacyName: linkedPharmacyName,
      })
      // PDF stored in memory only for this request. For MVP we return it
      // as base64 so the admin UI can download/preview. Later: upload to
      // Supabase Storage or mail to the org contact.
      const pdfB64 = pdfBuffer.toString('base64')

      // Optionally email the SO to the receiving org contact (not the pharmacy).
      let deliveryError = null
      if (hasEmailProvider() && org.contact_email) {
        try {
          await sendEmail({
            from: 'Tere Health <hello@terehealth.co.nz>',
            replyTo: prescriber.email,
            to: [org.contact_email],
            subject: `Standing Order — ${title} (${org.name})`,
            html: `<p>Kia ora ${(org.contact_name || '').split(' ')[0] || ''},</p>
<p>Attached is the Standing Order (<strong>${soNumber}</strong>) authorising your trained personnel to administer ${title.toLowerCase()} under the clinical criteria defined in the document.</p>
<p>This Standing Order is for your organisation's operational use. Keep a copy with the medication supply and with your first-aid documentation.</p>
<p>Any questions or if you'd like a verbal briefing of your team on the criteria, please reply.</p>
<p>Ngā mihi,<br>${prescriber.name}<br>Medical Director — ${org.name}<br>Tere Health Limited · MCNZ ${prescriber.mcnz}<br>${prescriber.email}</p>`,
            attachments: [{ filename: `${soNumber}-${title.replace(/\s+/g, '-')}.pdf`, content: pdfB64 }],
          })
        } catch (e) {
          deliveryError = e.message || 'Email send failed'
          console.error('[pso] SO email failed:', e)
        }
      }

      const { data: soRow, error: insErr } = await supabase.from('standing_orders').insert({
        so_number: soNumber,
        organisation_id,
        prescriber_id: auth.provider.id,
        title, indication,
        inclusion: inclusion || [],
        exclusion: exclusion || [],
        dose,
        documentation,
        linked_pso_id: linked_pso_id || null,
        issue_date: issueDate,
        review_date: reviewDateFinal,
        status: 'issued',
        sent_at: deliveryError ? null : new Date().toISOString(),
        delivery_error: deliveryError,
      }).select().single()
      if (insErr) { console.error('[pso] SO insert failed:', insErr); return res.status(500).json({ error: insErr.message }) }

      writeAuditEvent(req, auth, {
        event_type: 'standing_order.issued',
        resource_type: 'standing_order',
        resource_id: soRow.id,
        metadata: { so_number: soNumber, organisation: org.name, title, delivery_error: deliveryError },
      })

      return res.status(200).json({ standing_order: soRow, delivery_error: deliveryError })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    console.error('[pso] handler failed:', e)
    return res.status(500).json({ error: e.message || 'Server error' })
  }
}
