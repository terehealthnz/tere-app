// api/_arc-outreach.js
//
// One-off admin endpoint that fires the South Island aged residential care
// outreach via the prod sendEmail helper (SES in prod). Delete after use.
//
// Preview:  GET /api/admin-arc-outreach
// Send:     GET /api/admin-arc-outreach?confirm=yes
// Both require an admin session cookie.

import { sendEmail, hasEmailProvider } from './_email-client.js'
import { guardProvider } from './_auth.js'
import { FLYER_B64 } from './_arc-outreach-flyer.mjs'

const FROM     = 'Tere Health <hello@terehealth.co.nz>'
const CC       = ['patrick@terehealth.co.nz', 'justin@terehealth.co.nz']
const REPLY_TO = 'hello@terehealth.co.nz'
const SUBJECT  = 'Doctor on screen for your residents'

const RECIPIENTS = [
  { region: 'Marlborough', name: 'Heritage Lifecare Waterlea',     email: 'manager.waterlea@hll.org.nz',          first: 'Kathy' },
  { region: 'Marlborough', name: 'Heritage Lifecare Maxwell',      email: 'manager.maxwell@hll.org.nz',           first: 'Alta' },
  { region: 'Marlborough', name: 'Bethsaida Retirement Village',   email: 'manager@bethsaida.co.nz',              first: 'Kyla' },
  { region: 'Marlborough', name: 'Aberleigh Rest Home',            email: 'om@aberleigh.co.nz',                   first: null },
  { region: 'Nelson/Tasman', name: 'Wensley House',                email: 'wensleyhouse@xtra.co.nz',              first: null },
  { region: 'Nelson/Tasman', name: 'Alden Kensington Court',       email: 'manager.kensington@ultimatecare.co.nz', first: null },
  { region: 'Nelson/Tasman', name: 'Jack Inglis Aged Care Home',   email: 'info@jackinglishome.nz',               first: null },
  { region: 'Nelson/Tasman', name: 'Golden Bay Community Health',  email: 'receptiongb@nbph.org.nz',              first: null },
  { region: 'Nelson/Tasman', name: 'Tasman Rest Home',             email: 'oc@tasmanrh.co.nz',                    first: null },
  { region: 'Nelson/Tasman', name: 'Flaxmore Lifecare',            email: 'manager.flaxmore@hll.org.nz',          first: null },
  { region: 'Nelson/Tasman', name: 'Stillwater Lifecare',          email: 'manager.stillwater@hll.org.nz',        first: null },
  { region: 'West Coast', name: 'Dixon House Rest Home',           email: 'dixonhouse.greymouth@gmail.com',       first: null },
  { region: 'West Coast', name: "O'Conor Memorial Home",           email: 'susan@oconorhome.co.nz',               first: 'Susan' },
  { region: 'West Coast', name: 'Granger House Lifecare',          email: 'manager.granger@hll.org.nz',           first: null },
  { region: 'West Coast', name: 'Allen Bryant',                    email: 'manager.allenbryant@ultimatecare.co.nz', first: null },
  { region: 'Canterbury', name: 'Nurse Maude Care Home',           email: 'admin@nursemaude.org.nz',              first: null },
  { region: 'Canterbury', name: 'Windsorcare',                     email: 'reception@windsorcare.co.nz',          first: null },
  { region: 'Canterbury', name: 'Wesley Care',                     email: 'manager@wesleycare.nz',                first: null },
  { region: 'Canterbury', name: 'Archer Thorrington',              email: 'sue@archer.org.nz',                    first: 'Sue' },
  { region: 'Canterbury', name: 'Archer Beckenham',                email: 'info@archer.org.nz',                   first: null },
  { region: 'Canterbury', name: 'Holly Lea Village',               email: 'info@hollylea.co.nz',                  first: null },
  { region: 'Canterbury', name: 'Kowhai Rest Home',                email: 'kowhairesthome@xnet.co.nz',            first: null },
  { region: 'Canterbury', name: 'Alpine View Care Centre',         email: 'reception@alpineview.co.nz',           first: null },
  { region: 'Canterbury', name: 'Burlington Village',              email: 'claire.h@burlingtonvillage.co.nz',     first: 'Claire' },
  { region: 'Canterbury', name: 'Chatswood Retirement Village',    email: 'manager@chatswoodretirement.co.nz',    first: null },
  { region: 'Canterbury', name: 'Avon Lifecare',                   email: 'reception@avoncare.co.nz',             first: null },
  { region: 'Canterbury', name: 'Pacific Haven Residential Care',  email: 'manager@pacifichaven.co.nz',           first: null },
  { region: 'Canterbury', name: 'Elms Court Rest Home',            email: 'elmscourtresthome@gmail.com',          first: null },
  { region: 'Canterbury', name: 'Westmar Senior Care',             email: 'westmar@xtra.co.nz',                   first: null },
  { region: 'Canterbury', name: 'Rangiora Lifecare',               email: 'manager@rangioralifecare.co.nz',       first: null },
  { region: 'Canterbury', name: 'Kaiapoi Lodge',                   email: 'jonathan@kaiapoilodge.co.nz',          first: 'Jonathan' },
  { region: 'Canterbury', name: 'Akaroa Health',                   email: 'generalmanager@akaroahealth.nz',       first: 'Emma' },
  { region: 'Canterbury', name: 'Methven Care Trust',              email: 'admin@methvencaretrust.co.nz',         first: 'Renee' },
  { region: 'South Canterbury', name: 'Glenwood Home',             email: 'manager@glenwood.org.nz',              first: 'Hazel' },
  { region: 'South Canterbury', name: 'Lister Home and Hospital',  email: 'manager@listerhome.co.nz',             first: null },
  { region: 'South Canterbury', name: 'Geraldine Retirement Village', email: 'geraldinerh@xtra.co.nz',            first: null },
  { region: 'Otago', name: 'Montecillo Veterans Home',             email: 'information@montecillo.org.nz',        first: 'Lynley' },
  { region: 'Otago', name: 'Little Sisters of the Poor',           email: 'ms@lspdun.co.nz',                      first: null },
  { region: 'Otago', name: 'Thornbury House',                      email: 'manager@thornbury-house.co.nz',        first: 'Nicola' },
  { region: 'Otago', name: 'Home of St Barnabas Trust',            email: 'manager@stbarnabastrust.nz',           first: null },
  { region: 'Otago', name: 'Queen Rose Retirement Home',           email: 'queenrose@xtra.co.nz',                 first: null },
  { region: 'Otago', name: 'Marne Street Hospital',                email: 'manager@marnestreet.co.nz',            first: null },
  { region: 'Otago', name: 'Bradford Manor',                       email: 'manager@bradfordmanor.co.nz',          first: 'Michelle' },
  { region: 'Otago', name: 'Glendale Retirement Home',             email: 'glendalerh@xtra.co.nz',                first: null },
  { region: 'Otago', name: 'South Care Rest Home',                 email: 'fm@south-care.co.nz',                  first: null },
  { region: 'Otago', name: 'St Clair Park Residential Centre',     email: 'office@stclairpark.co.nz',             first: null },
  { region: 'Otago', name: 'Leslie Groves (Roslyn)',               email: 'admin@lesliegroves.co.nz',             first: null },
  { region: 'Otago', name: 'Leslie Groves (Wakari)',               email: 'execsupport@lesliegroves.co.nz',       first: null },
  { region: 'Otago', name: 'Oxford Court Lifecare',                email: 'manager@oxfordlifecare.co.nz',         first: null },
  { region: 'Otago', name: 'Mossbrae Lifecare',                    email: 'manager@mossbraelifecare.co.nz',       first: null },
  { region: 'Otago', name: 'Birchleigh Residential Care Centre',   email: 'office@birchleigh.com',                first: null },
  { region: 'Otago', name: 'Brooklands Retirement Village',        email: 'enquiries@brooklandsvillage.co.nz',    first: 'Tony' },
  { region: 'Otago', name: 'Ashlea Grove Rest Home',               email: 'manager@ashleagrove.co.nz',            first: 'Jasmine' },
  { region: 'Otago', name: 'West Otago Health (Ribbonwood)',       email: 'wohealth@wohealth.co.nz',              first: 'Karen' },
  { region: 'Otago', name: 'Aspiring Care',                        email: 'tracey@aspiringvillage.co.nz',         first: 'Tracey' },
  { region: 'Otago', name: 'Harbour View Rest Home',               email: 'manager@harbourviewoamaru.nz',         first: 'Arianna' },
  { region: 'Otago', name: 'Observatory Village Lifecare',         email: 'admin@observatoryvillage.nz',          first: 'Jane' },
  { region: 'South Canterbury', name: 'PSSC (Enliven) head office', email: 'admin@pssc.co.nz',                    first: null },
  { region: 'South Canterbury', name: 'Enliven The Croft (Timaru)', email: 'elt@pssc.co.nz',                      first: 'Annabelle' },
  { region: 'Otago', name: 'PSOtago Enliven head office',          email: 'enliven@psotago.org.nz',               first: null },
  { region: 'Otago', name: 'Enliven Ross Home',                    email: 'ross.admin@psotago.org.nz',            first: null },
  { region: 'Otago', name: 'Enliven St Andrews',                   email: 'standrews@psotago.org.nz',             first: null },
  { region: 'Otago', name: 'Enliven Taieri Court',                 email: 'taiericourt@psotago.org.nz',           first: null },
  { region: 'Otago', name: 'Enliven Castlewood',                   email: 'castlewood.admin@psotago.org.nz',      first: null },
  { region: 'Otago', name: 'Enliven Holmdene',                     email: 'holmdene@psotago.org.nz',              first: null },
  { region: 'Otago', name: 'Enliven Iona',                         email: 'iona@psotago.org.nz',                  first: null },
  { region: 'Otago', name: 'Enliven Ranui',                        email: 'ranui@psotago.org.nz',                 first: null },
  { region: 'Otago', name: 'Enliven Elmslie House',                email: 'elmslie@psotago.org.nz',               first: null },
  { region: 'Southland', name: 'PS Southland Enliven head office', email: 'enquiry@enlivensld.nz',                first: null },
  { region: 'Southland', name: 'Enliven Peacehaven',               email: 'PHManager@enlivensld.nz',              first: null },
  { region: 'Southland', name: 'Enliven Vickery Court',            email: 'VCManager@enlivensld.nz',              first: null },
  { region: 'Southland', name: 'Enliven Walmsley House',           email: 'WHManager@enlivensld.nz',              first: null },
  { region: 'Southland', name: 'Albany Home & Hospital',           email: 'manager.albany@experioncare.co.nz',    first: null },
  { region: 'Southland', name: 'Wyndham Rest Home',                email: 'admin@wyndhamresthome.co.nz',          first: null },
  { region: 'Southland', name: 'Rata Park Rest Home',              email: 'rata.park@xtra.co.nz',                 first: 'Darren' },
  { region: 'Southland', name: 'Calvary Hospital Southland',       email: 'calvaryhosp.inv@xtra.co.nz',           first: null },
  { region: 'Southland', name: 'Parata',                           email: 'parataresidence@xtra.co.nz',           first: null },
  { region: 'Corporate', name: 'Ryman Healthcare (Partnerships)',  email: 'partnerships@rymanhealthcare.com',     first: null },
  { region: 'Corporate', name: 'Summerset Group (Head Office)',    email: 'headoffice.reception@summerset.co.nz', first: null },
  { region: 'Corporate', name: 'Oceania Healthcare (Enquiries)',   email: 'enquiry@oceaniahealthcare.co.nz',      first: null },
  { region: 'Corporate', name: 'Arvida Group',                     email: 'info@arvida.co.nz',                    first: null },
  { region: 'Corporate', name: 'Heritage Lifecare (Head Office)',  email: 'office@hll.org.nz',                    first: null },
  { region: 'Corporate', name: 'Dementia Care NZ (Head Office)',   email: 'office@dementiacarenz.co.nz',          first: null },
  { region: 'Corporate', name: 'Experion Care (Head Office)',      email: 'info@experioncare.co.nz',              first: null },
]

const salutation = (first) => first ? `Kia ora ${first},` : 'Kia ora,'

function renderText({ facility, first }) {
  return [
    salutation(first),
    '',
    `I'm Dr Patrick Herling, Emergency Medicine physician and co-founder of Tere Health. Writing to introduce a service built for aged care nurses: a video doctor your team can call for UTIs, chest infections, med refills, falls, skin tears, and after-hours deterioration. We're NZ-registered and run a 24/7 queue, with a current average wait of only 11 minutes to see a doctor.`,
    '',
    `Can I offer a 15-minute call with your Clinical Manager or DON to walk through how it would fit ${facility}'s workflow?`,
    '',
    'Ngā mihi,',
    '',
    'Patrick Herling',
    'Co-founder, Tere Health Ltd',
    'patrick@terehealth.co.nz',
    'terehealth.co.nz',
  ].join('\n')
}

function renderHtml({ facility, first }) {
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
  return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0E2E38; max-width: 620px; line-height: 1.55;">
<p>${esc(salutation(first))}</p>

<p>I'm Dr Patrick Herling, Emergency Medicine physician and co-founder of Tere Health. Writing to introduce a service built for aged care nurses: a video doctor your team can call for UTIs, chest infections, med refills, falls, skin tears, and after-hours deterioration. We're NZ-registered and run a 24/7 queue, with a current average wait of only 11 minutes to see a doctor.</p>

<p>Can I offer a 15-minute call with your Clinical Manager or DON to walk through how it would fit ${esc(facility)}'s workflow?</p>

<p><img src="cid:tere-aged-care-flyer" alt="Tere Health aged care overview" style="max-width:100%; height:auto; display:block; border:0;"></p>

<p>Ngā mihi,</p>

<p style="margin-bottom: 0;">Patrick Herling<br>
Co-founder, Tere Health Ltd<br>
<a href="mailto:patrick@terehealth.co.nz" style="color: #0E2E38;">patrick@terehealth.co.nz</a><br>
<a href="https://terehealth.co.nz" style="color: #0E2E38;">terehealth.co.nz</a></p>
</body>
</html>`
}

export default async function handler(req, res) {
  try {
    const auth = await guardProvider(req, res)
    if (!auth) return
    if (!auth.provider?.is_admin) {
      return res.status(403).json({ error: 'admin only' })
    }

    const confirm = req.query?.confirm === 'yes'

    if (!confirm) {
      return res.status(200).json({
        preview: true,
        recipients: RECIPIENTS.length,
        from: FROM,
        cc: CC,
        subject: SUBJECT,
        sample: RECIPIENTS.slice(0, 3).map(r => ({ to: r.email, first: r.first, facility: r.name })),
        confirm_url: '/api/admin-arc-outreach?confirm=yes',
      })
    }

    if (!hasEmailProvider()) {
      return res.status(500).json({ error: 'no email provider configured' })
    }

    const flyerBuf = Buffer.from(FLYER_B64, 'base64')
    const flyerAttachment = {
      filename: 'Tere_Health_Aged_Care.jpg',
      content: flyerBuf,
      contentType: 'image/jpeg',
      inline: true,
      contentId: 'tere-aged-care-flyer',
    }

    const results = []
    for (const r of RECIPIENTS) {
      try {
        const send = await sendEmail({
          from: FROM,
          to: r.email,
          cc: CC,
          replyTo: REPLY_TO,
          subject: SUBJECT,
          html: renderHtml({ facility: r.name, first: r.first }),
          text: renderText({ facility: r.name, first: r.first }),
          attachments: [flyerAttachment],
        })
        results.push({
          email: r.email,
          facility: r.name,
          region: r.region,
          ok: Boolean(send?.ok),
          id: send?.id,
          error: send?.error,
        })
      } catch (e) {
        results.push({
          email: r.email,
          facility: r.name,
          region: r.region,
          ok: false,
          error: e?.message || String(e),
        })
      }
      await new Promise(r => setTimeout(r, 250))
    }

    return res.status(200).json({
      sent: true,
      totals: {
        attempted: results.length,
        ok: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
      },
      failures: results.filter(r => !r.ok),
      results,
    })
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
