// scripts/mail_merge_arc_outreach_ni.mjs
//
// North Island wave of the aged residential care (ARC) B2B outreach.
// Continuation of the Oct-28 SI wave (scripts/mail_merge_arc_outreach.mjs).
// Each facility gets a personally-addressed email with the Tere Health
// aged care PDF brief attached, variant selected by urban vs rural
// bucket off NZ postcode.
//
// Usage:
//   node --env-file=.env scripts/mail_merge_arc_outreach_ni.mjs
//     → dry run. Writes rendered HTML previews to
//       scripts/mail-merge-logs/preview/NI-NN-*.html, sends nothing.
//
//   node --env-file=.env scripts/mail_merge_arc_outreach_ni.mjs --send
//     → sends live via sendEmail (SES per EMAIL_PROVIDER=ses).
//       300ms pause between sends. Writes a timestamped JSON log.
//
//   Add --limit=N to cap recipients (handy for a 3-send smoke test).
//
// Copy is locked per Patrick's brief. No em-dashes anywhere.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sendEmail, hasEmailProvider } from '../api/_email-client.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const SEND  = process.argv.includes('--send')
const LIMIT = (() => {
  const a = process.argv.find(x => x.startsWith('--limit='))
  return a ? parseInt(a.split('=')[1], 10) : null
})()
const BATCH_START = (() => {
  const a = process.argv.find(x => x.startsWith('--batch-start='))
  return a ? parseInt(a.split('=')[1], 10) : 0
})()
const BATCH_SIZE = (() => {
  const a = process.argv.find(x => x.startsWith('--batch-size='))
  return a ? parseInt(a.split('=')[1], 10) : null
})()

const PDF_PATH   = '/Users/patrickherling/Downloads/Tere_Health_Aged_Residential_Care_EMAIL.pdf'
const FROM       = 'Tere Health <hello@terehealth.co.nz>'
const CC         = ['patrick@terehealth.co.nz', 'justin@terehealth.co.nz']
const REPLY_TO   = 'hello@terehealth.co.nz'

const LOG_DIR     = path.join(__dirname, 'mail-merge-logs')
const PREVIEW_DIR = path.join(LOG_DIR, 'preview')
if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true })

// ─── Recipients ────────────────────────────────────────────────────────────
//
// Fields:
//   facility_name  - displayed verbatim in subject/body
//   email          - verified against Healthpoint / facility website / chain
//                    pattern (Heritage manager.*@hll.org.nz, Alden
//                    manager.*@alden.co.nz, Enliven Central *@psc.org.nz,
//                    CHT *@cht.co.nz are published org-wide conventions)
//   first          - manager first name when easily discoverable, else null
//   region         - HNZ region, for log/sort filename
//   city           - suburb or town
//   postcode       - NZ postcode (string, preserves leading zeros)
//   bucket         - 'urban' | 'rural', derived from postcode per Patrick's
//                    rules in the brief
//
// Excluded facilities (no findable email): see the EXCLUDED array at the
// bottom of this file for the paper trail.
//
// Chain HQs intentionally skipped (already contacted in Oct SI wave):
// Ryman HQ, Summerset HQ, Oceania HQ, Arvida HQ, Heritage HQ,
// Dementia Care NZ HQ, Experion HQ.

const RECIPIENTS = [
  // ══ Northland ══
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'KHVCT Kamo Home',                       email: 'zoeb@khvct.co.nz',                         first: 'Zoe' },
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'KHVCT Parahaki Court',                  email: 'zoeb@khvct.co.nz',                         first: 'Zoe' },
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'Cairnfield House Rest Home & Hospital', email: 'lhauraki@cairnfieldhouse.co.nz',           first: 'Lesley' },
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'Shalom Aged Care',                      email: 'manager@shalomagedcare.co.nz',             first: 'Zoe' },
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'Heritage Lifecare Puriri Court',        email: 'manager.puriricourt@hll.org.nz',           first: null },
  { region: 'Northland', city: 'Dargaville',  postcode: '0310', bucket: 'rural', facility_name: 'Kauri Coast Lifecare',                  email: 'manager@kaurilifecare.co.nz',              first: null },
  { region: 'Northland', city: 'Dargaville',  postcode: '0310', bucket: 'rural', facility_name: 'Norfolk Court Home & Hospital',        email: 'norfolkcourtdargaville@xtra.co.nz',        first: null },
  { region: 'Northland', city: 'Kaitaia',     postcode: '0410', bucket: 'rural', facility_name: 'Claud Switzer Residential Care',       email: 'reception@switzer.org.nz',                 first: null },
  { region: 'Northland', city: 'Kerikeri',    postcode: '0230', bucket: 'rural', facility_name: 'Kerikeri Retirement Village',          email: 'reception@kerikerivillage.co.nz',          first: 'Nathan' },
  { region: 'Northland', city: 'Maungaturoto', postcode: '0520', bucket: 'rural', facility_name: 'Riverview Living (Maungaturoto Rest Home)', email: 'info@riverviewliving.nz',           first: null },
  { region: 'Northland', city: 'Rawene',      postcode: '0473', bucket: 'rural', facility_name: 'Hauora Hokianga',                       email: 'lyn.foster@hokiangahealth.org.nz',         first: 'Lyn' },

  // ══ Auckland (urban) ══
  // Central Auckland independents
  { region: 'Auckland',  city: 'Epsom',       postcode: '1023', bucket: 'urban', facility_name: 'Rose Lodge Rest Home',                   email: 'rose@gracefulcare.co.nz',                  first: 'Sidd' },
  { region: 'Auckland',  city: 'Mt Roskill',  postcode: '1041', bucket: 'urban', facility_name: 'Gracedale Home and Hospital',           email: 'admin@gracedale.co.nz',                    first: 'Anjani' },
  { region: 'Auckland',  city: 'Mt Roskill',  postcode: '1041', bucket: 'urban', facility_name: 'Dominion Home',                          email: 'dominionhome.dementia@gmail.com',          first: null },
  { region: 'Auckland',  city: 'New Windsor', postcode: '1025', bucket: 'urban', facility_name: 'Blockhouse Bay Home',                    email: 'bhresthome@hotmail.com',                   first: 'Ravi' },
  { region: 'Auckland',  city: 'Blockhouse Bay', postcode: '0600', bucket: 'urban', facility_name: 'CHT Peacehaven Rest Home and Hospital', email: 'peacehaven@cht.co.nz',                 first: 'Christine' },
  { region: 'Auckland',  city: 'Sandringham', postcode: '1025', bucket: 'urban', facility_name: 'Lexham Gardens Lifecare',                email: 'manager@lexham.co.nz',                     first: 'Jaspreet' },
  { region: 'Auckland',  city: 'Avondale',    postcode: '1026', bucket: 'urban', facility_name: 'Avondale Lifecare',                      email: 'manager@avondalelifecare.co.nz',           first: 'Resina' },
  { region: 'Auckland',  city: 'Herne Bay',   postcode: '1011', bucket: 'urban', facility_name: 'Sunrise Healthcare Jervois Residential Care', email: 'enquires@sunrisehealthcare.co.nz',  first: null },
  { region: 'Auckland',  city: 'Westmere',    postcode: '1022', bucket: 'urban', facility_name: 'Sunrise Healthcare Lynton Lodge Hospital', email: 'lynton@sunrisehealthcare.co.nz',        first: 'Sue' },
  // North Auckland independents
  { region: 'Auckland',  city: 'Henderson',   postcode: '0610', bucket: 'urban', facility_name: 'CHT Carnarvon Hospital',                 email: 'carnarvon@cht.co.nz',                      first: null },
  { region: 'Auckland',  city: 'Algies Bay',  postcode: '0920', bucket: 'urban', facility_name: 'CHT Amberlea Home & Hospital',          email: 'amberlea@cht.co.nz',                       first: 'Annette' },
  { region: 'Auckland',  city: 'Whangaparāoa', postcode: '0932', bucket: 'urban', facility_name: 'CHT Halldene Home and Hospital',        email: 'halldene@cht.co.nz',                       first: null },
  { region: 'Auckland',  city: 'Birkenhead',  postcode: '0626', bucket: 'urban', facility_name: 'CHT Onewa Home and Hospital',           email: 'onewa@cht.co.nz',                          first: null },
  { region: 'Auckland',  city: 'Northcote',   postcode: '0627', bucket: 'urban', facility_name: 'Graceful Care Shoal Bay Dementia',       email: 'rose@gracefulcare.co.nz',                  first: 'Rose' },
  { region: 'Auckland',  city: 'West Harbour', postcode: '0618', bucket: 'urban', facility_name: 'Sunrise Healthcare West Harbour Gardens', email: 'enquires@sunrisehealthcare.co.nz',       first: null },
  // East Auckland independents
  { region: 'Auckland',  city: 'Bucklands Beach', postcode: '2012', bucket: 'urban', facility_name: 'Ambridge Rose Beach House',          email: 'info@ambridgerose.co.nz',                  first: 'Allan' },
  { region: 'Auckland',  city: 'Bucklands Beach', postcode: '2012', bucket: 'urban', facility_name: 'Ambridge Rose Cottage',               email: 'info@ambridgerose.co.nz',                  first: 'Jackie' },
  { region: 'Auckland',  city: 'Bucklands Beach', postcode: '2012', bucket: 'urban', facility_name: 'Ambridge Rose Manor',                 email: 'info@ambridgerose.co.nz',                  first: 'Brian' },
  { region: 'Auckland',  city: 'Bucklands Beach', postcode: '2012', bucket: 'urban', facility_name: 'Ambridge Rose Villa',                 email: 'info@ambridgerose.co.nz',                  first: 'Doreen' },
  { region: 'Auckland',  city: 'Howick',      postcode: '2014', bucket: 'urban', facility_name: 'HBH Senior Living Gulf Views',          email: 'anne.kirkbride@hbh.org.nz',                first: 'Marc' },
  { region: 'Auckland',  city: 'Howick',      postcode: '2014', bucket: 'urban', facility_name: 'HBH Senior Living Howick Views',         email: 'anne.kirkbride@hbh.org.nz',                first: null },
  { region: 'Auckland',  city: 'Howick',      postcode: '2014', bucket: 'urban', facility_name: 'HBH Gracedale',                           email: 'anne.kirkbride@hbh.org.nz',                first: null },
  // South Auckland independents
  { region: 'Auckland',  city: 'Papakura',    postcode: '2110', bucket: 'urban', facility_name: 'Papakura Private Hospital',              email: 'info@pphl.co.nz',                          first: 'Jay' },
  { region: 'Auckland',  city: 'Pukekohe',    postcode: '2120', bucket: 'urban', facility_name: 'Heritage Lifecare Palms Lifecare & Village', email: 'manager.palms@hll.org.nz',             first: null },
  // West Auckland independents
  { region: 'Auckland',  city: 'Henderson',   postcode: '0612', bucket: 'urban', facility_name: 'Lexall Care Hospital and Rest Home',     email: 'manager@lexallcare.co.nz',                 first: null },

  // ══ Waikato ══ (mostly rural; Hamilton CBD cores 3200-3206 = urban)
  { region: 'Waikato',   city: 'Hamilton',    postcode: '3288', bucket: 'rural', facility_name: 'Brylyn Rest Home',                       email: 'info@brylynhome.co.nz',                    first: null },
  { region: 'Waikato',   city: 'Hamilton East', postcode: '3216', bucket: 'rural', facility_name: 'Tamahere Eventide Home & Retirement Village', email: 'admin@tamahere.co.nz',              first: 'Versie' },
  { region: 'Waikato',   city: 'Hamilton',    postcode: '3216', bucket: 'rural', facility_name: 'Steele Park Home',                       email: 'manager.steelepark@soundcare.co.nz',       first: null },
  { region: 'Waikato',   city: 'Te Aroha',    postcode: '3320', bucket: 'rural', facility_name: 'Kenwyn Rest Home & Hospital',            email: 'manager@kenwynhome.co.nz',                 first: 'Cornelia' },
  { region: 'Waikato',   city: 'Te Aroha',    postcode: '3320', bucket: 'rural', facility_name: 'Te Aroha & District Community Hospital', email: 'admin@teahospital.co.nz',                  first: null },
  { region: 'Waikato',   city: 'Matamata',    postcode: '3400', bucket: 'rural', facility_name: 'Radius Matamata Country Lodge',          email: 'info@matamatacountrylodge.co.nz',          first: null },
  { region: 'Waikato',   city: 'Matamata',    postcode: '3400', bucket: 'rural', facility_name: 'Kingswood Healthcare (Matamata)',         email: 'tammy@kingswood.co.nz',                    first: 'Tammy' },
  { region: 'Waikato',   city: 'Waihi',       postcode: '3610', bucket: 'rural', facility_name: 'Waihi Lifecare',                         email: 'info@waihilifecare.co.nz',                 first: 'Wendy' },
  { region: 'Waikato',   city: 'Coromandel',  postcode: '3506', bucket: 'rural', facility_name: 'Phoenix House Rest Home & Hospital',     email: 'info@phoenixhouse.co.nz',                  first: null },
  { region: 'Waikato',   city: 'Whitianga',   postcode: '3510', bucket: 'rural', facility_name: 'Whitianga Lifecare',                     email: 'manager@whitiangalifecare.co.nz',          first: null },
  { region: 'Waikato',   city: 'Whangamatā',  postcode: '3620', bucket: 'rural', facility_name: 'Moana House and Village (Whangamatā)',   email: 'office@moanahouse.nz',                     first: 'Deborah' },
  { region: 'Waikato',   city: 'Raglan',      postcode: '3225', bucket: 'rural', facility_name: 'Raglan Rest Home and Hospital',          email: 'office@raglanhospital.com',                first: null },
  { region: 'Waikato',   city: 'Ōtorohanga',  postcode: '3900', bucket: 'rural', facility_name: 'Beattie Home Community Trust',           email: 'info@beattiehome.co.nz',                   first: null },

  // ══ Bay of Plenty ══
  { region: 'Bay of Plenty', city: 'Tauranga', postcode: '3110', bucket: 'urban', facility_name: 'Killarney Rest Home',                   email: 'killarney@xtra.co.nz',                     first: 'Carol' },
  { region: 'Bay of Plenty', city: 'Mount Maunganui', postcode: '3116', bucket: 'urban', facility_name: 'Malyon House',                    email: 'admin@malyonhouse.co.nz',                  first: null },
  { region: 'Bay of Plenty', city: 'Tauranga South', postcode: '3112', bucket: 'urban', facility_name: 'Heritage Lifecare Hodgson House Lifecare & Village', email: 'manager.hodgson@hll.org.nz',  first: null },
  { region: 'Bay of Plenty', city: 'Judea',    postcode: '3110', bucket: 'urban', facility_name: 'Elmswood Care Centre',                  email: 'rose@gracefulcare.co.nz',                  first: null },
  { region: 'Bay of Plenty', city: 'Papamoa Beach', postcode: '3118', bucket: 'rural', facility_name: 'Pacific Coast Village',           email: 'info@pcv.co.nz',                           first: 'Julia' },
  { region: 'Bay of Plenty', city: 'Te Puke',  postcode: '3119', bucket: 'rural', facility_name: 'Heritage Lifecare Carter House Lifecare & Village', email: 'manager.carter@hll.org.nz',       first: null },
  { region: 'Bay of Plenty', city: 'Whakatāne', postcode: '3120', bucket: 'rural', facility_name: 'Golden Pond Lifecare',                  email: 'golden.pond@xtra.co.nz',                   first: 'Anna' },
  { region: 'Bay of Plenty', city: 'Whakatāne', postcode: '3120', bucket: 'rural', facility_name: 'Sheaffs Rest Home',                     email: 'info@sheaffsresthome.co.nz',               first: 'Melissa' },
  { region: 'Bay of Plenty', city: 'Ōhope',    postcode: '3121', bucket: 'rural', facility_name: 'Ōhope Beach Care',                      email: 'ohopelodge@xtra.co.nz',                    first: null },

  // ══ Lakes / Rotorua / Taupō ══
  { region: 'Lakes',     city: 'Rotorua',     postcode: '3010', bucket: 'rural', facility_name: 'Heritage Lifecare Cantabria Lifecare & Village', email: 'manager.cantabria@hll.org.nz',       first: null },

  // ══ Tairāwhiti / Gisborne ══
  { region: 'Tairāwhiti', city: 'Gisborne',   postcode: '4010', bucket: 'rural', facility_name: 'Beetham Healthcare',                     email: 'info@beetham.co.nz',                       first: null },
  { region: 'Tairāwhiti', city: 'Gisborne',   postcode: '4020', bucket: 'rural', facility_name: 'Leighton House',                          email: 'oc@leightonhouse.co.nz',                   first: null },
  { region: 'Tairāwhiti', city: 'Kaiti',      postcode: '4010', bucket: 'rural', facility_name: 'Dunblane Lifecare',                       email: 'manager@dunblanelifecare.co.nz',           first: null },
  { region: 'Tairāwhiti', city: 'Gisborne',   postcode: '4010', bucket: 'rural', facility_name: 'Heritage Lifecare Te Wiremu House',      email: 'manager.tewiremu@hll.org.nz',              first: null },

  // ══ Hawke's Bay ══
  { region: "Hawke's Bay", city: 'Hastings',  postcode: '4122', bucket: 'rural', facility_name: 'Brittany House Residential Care',        email: 'manager@brittanyhouse.co.nz',              first: null },
  { region: "Hawke's Bay", city: 'Hastings',  postcode: '4120', bucket: 'rural', facility_name: 'Heritage Lifecare Colwyn House',          email: 'manager.colwyn@hll.org.nz',                first: null },
  { region: "Hawke's Bay", city: 'Havelock North', postcode: '4130', bucket: 'rural', facility_name: 'Heritage Lifecare Waiapu House Lifecare & Village', email: 'manager.waiapu@hll.org.nz',   first: null },
  { region: "Hawke's Bay", city: 'Hastings',  postcode: '4120', bucket: 'rural', facility_name: 'Heritage Lifecare Glengarry',             email: 'manager.glengarry@hll.org.nz',             first: null },
  { region: "Hawke's Bay", city: 'Napier',    postcode: '4112', bucket: 'rural', facility_name: 'Napier District Masonic Trust (Taradale Rest Home)', email: 'trust@ndmt.co.nz',                 first: null },
  { region: "Hawke's Bay", city: 'Napier',    postcode: '4110', bucket: 'rural', facility_name: 'Experion Care Greendale Residential Care', email: 'manager.greendale@experioncare.co.nz',    first: null },
  { region: "Hawke's Bay", city: 'Waipukurau', postcode: '4200', bucket: 'rural', facility_name: 'Kaylexcare Mt Herbert House',           email: 'mtherbert@kaylexcare.co.nz',               first: null },

  // ══ Taranaki ══
  { region: 'Taranaki',  city: 'New Plymouth', postcode: '4312', bucket: 'rural', facility_name: 'Enliven Chalmers Home',                  email: 'chalmers@psc.org.nz',                      first: 'Melissa' },
  { region: 'Taranaki',  city: 'Bell Block',  postcode: '4312', bucket: 'rural', facility_name: 'Maida Vale Retirement Village',           email: 'admin@maidavale.co.nz',                    first: 'Louise' },
  { region: 'Taranaki',  city: 'New Plymouth', postcode: '4310', bucket: 'rural', facility_name: 'Brooklands Rest Home',                   email: 'manager@brooklandsresthome.co.nz',         first: 'Heather' },
  { region: 'Taranaki',  city: 'Stratford',   postcode: '4332', bucket: 'rural', facility_name: 'Heritage Lifecare Elizabeth R Lifecare & Village', email: 'manager.elizabethr@hll.org.nz',   first: null },
  { region: 'Taranaki',  city: 'Hāwera',      postcode: '4610', bucket: 'rural', facility_name: 'Heritage Lifecare Annie Brydon Lifecare', email: 'manager.anniebrydon@hll.org.nz',           first: 'Tania' },
  { region: 'Taranaki',  city: 'New Plymouth', postcode: '4310', bucket: 'rural', facility_name: 'Heritage Lifecare Riverside Lifecare',   email: 'manager.riverside@hll.org.nz',             first: null },
  { region: 'Taranaki',  city: 'New Plymouth', postcode: '4310', bucket: 'rural', facility_name: 'Heritage Lifecare Telford Lifecare & Village', email: 'manager.telford@hll.org.nz',         first: null },
  { region: 'Taranaki',  city: 'Ōpunake',     postcode: '4616', bucket: 'rural', facility_name: 'Ōpunake Cottage Rest Home',                email: 'admin@opunakeresthome.co.nz',              first: null },
  { region: 'Taranaki',  city: 'Eltham',      postcode: '4322', bucket: 'rural', facility_name: 'Eltham Care Rest Home',                   email: 'manager@elthamcare.co.nz',                 first: 'Glennis' },
  { region: 'Taranaki',  city: 'New Plymouth', postcode: '4310', bucket: 'rural', facility_name: 'Alden Rhapsody',                          email: 'manager.rhapsody@alden.co.nz',             first: null },

  // ══ Whanganui ══
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Springvale Manor',                        email: 'arc.manager@livingwatersmedical.co.nz',    first: 'Shanyn' },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Living Waters Rest Home',                 email: 'arc.manager@livingwatersmedical.co.nz',    first: null },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Heritage Lifecare St Johns Hill Lifecare', email: 'manager.stjohnshill@hll.org.nz',          first: 'Sue' },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Heritage Lifecare Broadview Lifecare & Village', email: 'manager.broadview@hll.org.nz',       first: null },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Enliven Kōwhainui Home',                  email: 'kowhainui@psc.org.nz',                     first: 'Trish' },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Experion Care Okere House',              email: 'manager.okere@experioncare.co.nz',         first: null },

  // ══ MidCentral (Manawatū / Horowhenua) ══
  { region: 'MidCentral', city: 'Palmerston North', postcode: '4410', bucket: 'rural', facility_name: 'Heritage Lifecare Palmerston Manor', email: 'manager.palmerstonmanor@hll.org.nz',      first: null },
  { region: 'MidCentral', city: 'Palmerston North', postcode: '4410', bucket: 'rural', facility_name: 'Heritage Lifecare Karina Lifecare',  email: 'manager.karina@hll.org.nz',                first: null },
  { region: 'MidCentral', city: 'Palmerston North', postcode: '4410', bucket: 'rural', facility_name: 'Heritage Lifecare Chiswick Park Lifecare', email: 'manager.chiswickpark@hll.org.nz',   first: null },
  { region: 'MidCentral', city: 'Palmerston North', postcode: '4410', bucket: 'rural', facility_name: 'Enliven Brightwater Home',          email: 'brightwater@psc.org.nz',                   first: 'Christine' },
  { region: 'MidCentral', city: 'Palmerston North', postcode: '4410', bucket: 'rural', facility_name: 'Enliven Willard Home',              email: 'willard@psc.org.nz',                       first: 'Christine' },
  { region: 'MidCentral', city: 'Palmerston North', postcode: '4410', bucket: 'rural', facility_name: 'Masonic Villages Masonic Court',    email: 'mcmanager@masonicvillages.co.nz',          first: 'Karen' },
  { region: 'MidCentral', city: 'Feilding',   postcode: '4702', bucket: 'rural', facility_name: 'Promisia Ranfurly Manor',                email: 'fm.ranfurly@promisia.co.nz',               first: 'Darren' },
  { region: 'MidCentral', city: 'Feilding',   postcode: '4702', bucket: 'rural', facility_name: 'Promisia Nelson Street Residential Care', email: 'fm.nelson@promisia.co.nz',                 first: 'Hayley' },
  { region: 'MidCentral', city: 'Feilding',   postcode: '4702', bucket: 'rural', facility_name: 'Wimbledon Villa',                         email: 'manager@wimbledonvilla.co.nz',             first: 'Libu' },
  { region: 'MidCentral', city: 'Feilding',   postcode: '4702', bucket: 'rural', facility_name: 'Enliven Coombrae Home',                  email: 'coombrae@psc.org.nz',                      first: 'Stephen' },
  { region: 'MidCentral', city: 'Levin',      postcode: '5510', bucket: 'rural', facility_name: 'Enliven Levin Home for War Veterans',    email: 'levinhome@psc.org.nz',                     first: null },
  { region: 'MidCentral', city: 'Levin',      postcode: '5510', bucket: 'rural', facility_name: 'Enliven Reevedon Home',                  email: 'reevedon@psc.org.nz',                      first: null },
  { region: 'MidCentral', city: 'Levin',      postcode: '5510', bucket: 'rural', facility_name: 'Horowhenua Masonic Village',             email: 'hmvadmin@masonicvillages.co.nz',           first: 'Mary' },
  { region: 'MidCentral', city: 'Foxton',     postcode: '4814', bucket: 'rural', facility_name: 'Te Awahou Masonic Village',              email: 'TAMVManager@masonicvillages.co.nz',        first: 'Fiona' },

  // ══ Wairarapa ══
  { region: 'Wairarapa', city: 'Masterton',   postcode: '5810', bucket: 'rural', facility_name: 'Alden Lansdowne Court',                  email: 'manager.lansdownecourt@alden.co.nz',       first: null },
  { region: 'Wairarapa', city: 'Masterton',   postcode: '5810', bucket: 'rural', facility_name: 'Lyndale Care',                            email: 'manager@lyndalecare.co.nz',                first: 'Emma' },
  { region: 'Wairarapa', city: 'Masterton',   postcode: '5810', bucket: 'rural', facility_name: 'Glenwood Masonic Hospital Masterton',    email: 'gwmanager@masonicvillages.co.nz',          first: null },
  { region: 'Wairarapa', city: 'Carterton',   postcode: '5713', bucket: 'rural', facility_name: 'Heritage Lifecare Roseneath Lifecare & Village', email: 'manager.roseneath@hll.org.nz',       first: null },
  { region: 'Wairarapa', city: 'Carterton',   postcode: '5713', bucket: 'rural', facility_name: 'Enliven Kandahar Home',                  email: 'kandahar@psc.org.nz',                      first: 'David' },

  // ══ Hutt ══ (urban: Lower Hutt / Upper Hutt metro = 5010-5399)
  { region: 'Hutt',      city: 'Lower Hutt',  postcode: '5010', bucket: 'urban', facility_name: 'Enliven Woburn Home',                     email: 'woburn@psc.org.nz',                        first: 'Noelette' },
  { region: 'Hutt',      city: 'Lower Hutt',  postcode: '5010', bucket: 'urban', facility_name: 'Woburn Masonic Care',                    email: 'wmmanager@masonicvillages.co.nz',          first: 'Heidi' },
  { region: 'Hutt',      city: 'Lower Hutt',  postcode: '5010', bucket: 'urban', facility_name: 'Ropata Lodge and Village',               email: 'manager@ropatalodge.co.nz',                first: 'Tamsin' },
  { region: 'Hutt',      city: 'Lower Hutt',  postcode: '5011', bucket: 'urban', facility_name: 'Aroha Care Centre for the Elderly',      email: 'administration@arohacarecentre.co.nz',     first: 'Michelle' },
  { region: 'Hutt',      city: 'Upper Hutt',  postcode: '5018', bucket: 'urban', facility_name: 'Heritage Lifecare St Josephs',            email: 'manager.stjosephs@hll.org.nz',             first: null },

  // ══ Wellington ══ (urban: 6000-6999)
  { region: 'Wellington', city: 'Newtown',    postcode: '6021', bucket: 'urban', facility_name: 'Te Hopai Home and Hospital',             email: 'manager@tehopai.co.nz',                    first: 'Pakize' },
  { region: 'Wellington', city: 'Berhampore', postcode: '6023', bucket: 'urban', facility_name: 'Vincentian Home and Hospital',           email: 'manager@vincentianhome.co.nz',             first: 'Clement' },
  { region: 'Wellington', city: 'Island Bay', postcode: '6023', bucket: 'urban', facility_name: 'Irwell Rest Home',                       email: 'office@irwell.co.nz',                      first: 'John' },
  { region: 'Wellington', city: 'Karori',     postcode: '6012', bucket: 'urban', facility_name: 'Enliven Huntleigh Home',                 email: 'huntleigh@psc.org.nz',                     first: 'Anna' },
  { region: 'Wellington', city: 'Johnsonville', postcode: '6037', bucket: 'urban', facility_name: 'Enliven Cashmere Home',                 email: 'cashmere@psc.org.nz',                      first: 'Manisha' },
  { region: 'Wellington', city: 'Tawa',       postcode: '5028', bucket: 'urban', facility_name: 'Enliven Longview Home',                  email: 'longview@psc.org.nz',                      first: 'Arlyn' },
  { region: 'Wellington', city: 'Churton Park', postcode: '6037', bucket: 'urban', facility_name: 'Alden Churtonleigh',                   email: 'manager.churtonleigh@alden.co.nz',         first: null },
  // Kāpiti (urban-ish; Paraparaumu urban centre 5032)
  { region: 'Wellington', city: 'Paraparaumu', postcode: '5032', bucket: 'urban', facility_name: 'Kena Kena Rest Home',                    email: 'office@kenakena.co.nz',                    first: null },
  { region: 'Wellington', city: 'Paraparaumu', postcode: '5032', bucket: 'urban', facility_name: 'Kapiti Rest Home',                       email: 'manager@kapitiresthome.co.nz',             first: null },
  { region: 'Wellington', city: 'Paraparaumu', postcode: '5032', bucket: 'urban', facility_name: 'Eldon Masonic Care Facility',          email: 'admin.eldon@masonicvillages.co.nz',        first: 'Shaun' },
]

// Facilities seen but EXCLUDED from this wave (no findable email, or only
// a chain-HQ address that was pinged in Oct). Here for Patrick's audit trail
// - not consumed by the merge loop.
// eslint-disable-next-line no-unused-vars
const EXCLUDED = [
  // Chain-HQ-only - Oct wave already hit HQ
  'Ryman facilities (all) - partnerships@rymanhealthcare.com contacted Oct',
  'Summerset facilities (all) - headoffice.reception@summerset.co.nz contacted Oct',
  'Oceania Healthcare facilities (all) - enquiry@oceaniahealthcare.co.nz contacted Oct',
  'Arvida Group facilities (all) - info@arvida.co.nz contacted Oct',
  'Bupa care homes (all) - no facility-manager inbox published; chain-managed',
  'Radius Care facilities (all except Matamata which has own domain) - chain-managed, no facility manager inbox published',
  'Metlifecare (all) - chain-managed',
  'Real Living (Remuera Gardens, Pakuranga Park) - chain-managed, no facility inbox',
  'Dementia Care NZ Millvale houses (Miramar, Waikanae, Levin, Lindale) - HQ office@dementiacarenz.co.nz contacted Oct',
  // No email found
  'Greenwoods House Epsom - phone only on Healthpoint',
  'Avon Rest Home - phone only',
  'Turama House Rest Home - phone only',
  'Eden Rest Home - phone only',
  'Claire House Rest Home - phone only',
  'Catherine Lodge Retirement Home - phone only',
  'Capella House - phone only',
  'Cromwell House and Hospital - phone only',
  'Karetu House - phone only',
  'Waimarie Private Hospital - phone only',
  'Kindred Hospital - phone only',
  'St Patricks Home and Hospital - phone only',
  'Shalom Court Rest Home and Hospital - phone only',
  'Remuera Rest Home and Hospital - phone only',
  'St Catherines Rest Home - phone only',
  'Remuera area independents - majority list phone only on Healthpoint',
  'Fencible Manor Rest Home - phone only',
  'Freeling Holt House - phone only',
  'Fairview Care - phone only',
  'Royal Heights Rest Home - phone only',
  'Edmonton Meadows Care Home - phone only',
  'Craigweil House - phone only',
  'Ons Dorp Retirement - phone only',
  'Abbey Heights Rest Home - phone only',
  'The Waratah Retirement Home - phone only',
  'Amberwood Rest Home - phone only',
  'Kolmar Lodge - phone only',
  'Glencoe Resthome - phone only',
  'Christinas Rest Home - phone only',
  'Alexander Lodge Rest Home - phone only',
  'Papatoetoe Residential Care - phone only',
  'Lady Elizabeth Home and Hospital - phone only',
  'Bethesda Retirement Village - phone only',
  'Tui Lifecare - phone only',
  'Papakura CHT St Christophers / Hillcrest / Waiuku - cht.co.nz pattern not verified for these',
  'Hummingbird Hospital / Hummingbird House - phone only',
  'Tranquility Bay Care Home - phone only',
  'Alden Ranburn - phone only',
  'Warkworth Hospital - phone only',
  'Resthaven on Burns Street / Vogel Street Hamilton - phone only',
  'Hillview Home and Hospital - phone only',
  'Cardrona Rest Home - phone only',
  'Kimihia Home & Hospital - phone only',
  'Cambridge Life - phone only',
  'Camellia Resthome - phone only',
  'Hetherington House - phone only',
  'The Booms Lifecare - phone only',
  'Hilda Ross Retirement Village - chain managed Ryman',
  'Beachfront Home / Palm Tree / Greenvalley Rest Home / Glenhaven - phone only',
  'Heritage Rest Home / Torbay Rest Home / Maygrove Lifecare - phone only',
  'Mountain View Home & Hospital (Te Puke) - phone only',
  'The Lodge Rest Home / Devonport Palms / Athenree Life / Makoha Tauranga - phone only',
  'CHT Acacia Park / Bernadette / Glynavon / Lansdowne - cht.co.nz pattern not verified for BoP/East',
  'Hillcrest Rest Home Havelock North - phone only',
  'Summerville Rest Home - phone only',
  'Voguehaven Rest Home - phone only',
  'Waverley House / Otatara Heights / Roseanne Retirement Home - phone only',
  'Ngāti Porou Hauora Elderly Care Te Puia - phone only',
  'Marinoto Home & Hospital Care Inglewood - phone only',
  'Sunhaven Home and Hospital - phone only',
  'Maryann Home and Hospital Stratford - phone only',
  'Kohatu Rest Home Waitara - phone only',
  'Coronation Lodge Rest Home - phone only',
  'Jean Sandel / Taurima / Tainui Village / Norfolk Lodge / Brooklands Care Timandra - phone only',
  'Te Mahana Rest Home Patea - phone only',
  'Elmwood Memory Care Home / Napier District Masonic Trust facilities beyond Taradale - rolled under ndmt.co.nz',
  'Eastgrove Lifecare / New Vista Resthome - phone only',
  'Ocean View Residential Care / Alexander House Feilding / Westella Homestead / Te Whanau Lifecare / Lonsdale Total Care - phone only',
  'Rahiri Lifecare / Eileen Mary Masonic - phone only',
  'Wairarapa Village Masterton / Cornwall Rest Home / Carter Court / Alden Palliser House Martinborough - phone only',
  'Lyndale Manor / Arvida Lansdowne Park Village - phone only',
  'Woodfall Lodge / Woodlands of Palmerston / Woodlands of Fielding - phone only or chain (Kaylexcare Woodfall is in SI? - excluded as unverified)',
  'Benhaven Rest Home / Manor Park Private Hospital / Parkwood Retirement Village / Alexandra Rest Home / Oceania Eldersea / Bupa Stokeswood etc - phone only / chain-HQ',
]

// ─── Templates ─────────────────────────────────────────────────────────────

function greetingName(first) {
  return first ? ` ${first}` : ''
}

function subjectFor(bucket, facility) {
  return bucket === 'urban'
    ? `Acute and after-hours medical cover for ${facility}`
    : `After-hours doctor cover for residents at ${facility}`
}

function renderRuralHtml({ first }) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0E2E38; max-width: 620px; line-height: 1.55;">
<p>Kia ora${greetingName(first)},</p>

<p>I'm Dr Patrick Herling, co-founder of Tere Health. We run a NZ-wide telehealth service built for the problem your nurses face after 5pm: a resident goes off, the GP rooms are shut, and the only options are an on-call line or an ambulance.</p>

<p>Tere gives your RN a NZ-registered doctor on video. Vitals read through the camera, prescriptions, imaging referrals, ACC and a GP letter all delivered during the consult.</p>

<p>We sit alongside your contracted GP as the after-hours and acute pathway, not in place of them.</p>

<p>Overview attached. If you'd rather see it in 60 seconds first, a walkthrough video is at <a href="https://terehealth.co.nz/watch">terehealth.co.nz/watch</a>.</p>

<p>Happy to walk your manager and clinical lead through a real consult.</p>

<p>Ngā mihi,<br>
Dr Patrick Herling<br>
Co-founder, Tere Health<br>
<a href="mailto:patrick@terehealth.co.nz">patrick@terehealth.co.nz</a><br>
<a href="https://terehealth.co.nz">terehealth.co.nz</a></p>

<p style="color:#6B7280; font-size: 12px; margin-top: 24px; border-top: 1px solid #E5E7EB; padding-top: 10px;">Not interested? Reply with 'unsubscribe' and we will remove your address from our outreach list.</p>
</body>
</html>`
}

function renderUrbanHtml({ first }) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0E2E38; max-width: 620px; line-height: 1.55;">
<p>Kia ora${greetingName(first)},</p>

<p>I'm Dr Patrick Herling, co-founder of Tere Health. We run a NZ-wide telehealth service that covers the gap between your contracted GP and 111: acute and after-hours medical cover delivered by video with your nurse in the room.</p>

<p>Most rest home transfers aren't about the ambulance, they're about not having a doctor available at 7pm. We give your RN a NZ-registered doctor on video: vitals read through the camera, prescriptions, imaging referrals, ACC and a GP letter all sorted during the call.</p>

<p>We sit alongside your GP, not in place of them.</p>

<p>Overview attached. If you'd rather see it in 60 seconds first, a walkthrough video is at <a href="https://terehealth.co.nz/watch">terehealth.co.nz/watch</a>.</p>

<p>Happy to walk your manager and clinical lead through a real consult.</p>

<p>Ngā mihi,<br>
Dr Patrick Herling<br>
Co-founder, Tere Health<br>
<a href="mailto:patrick@terehealth.co.nz">patrick@terehealth.co.nz</a><br>
<a href="https://terehealth.co.nz">terehealth.co.nz</a></p>

<p style="color:#6B7280; font-size: 12px; margin-top: 24px; border-top: 1px solid #E5E7EB; padding-top: 10px;">Not interested? Reply with 'unsubscribe' and we will remove your address from our outreach list.</p>
</body>
</html>`
}

// Plain-text fallback mirrors the chosen HTML variant.
function renderText({ bucket, first }) {
  const sal = `Kia ora${greetingName(first)},`
  const footer = [
    '',
    '-----',
    "Not interested? Reply with 'unsubscribe' and we will remove your address from our outreach list.",
  ]
  if (bucket === 'urban') {
    return [
      sal,
      '',
      "I'm Dr Patrick Herling, co-founder of Tere Health. We run a NZ-wide telehealth service that covers the gap between your contracted GP and 111: acute and after-hours medical cover delivered by video with your nurse in the room.",
      '',
      "Most rest home transfers aren't about the ambulance, they're about not having a doctor available at 7pm. We give your RN a NZ-registered doctor on video: vitals read through the camera, prescriptions, imaging referrals, ACC and a GP letter all sorted during the call.",
      '',
      'We sit alongside your GP, not in place of them.',
      '',
      "Overview attached. If you'd rather see it in 60 seconds first, a walkthrough video is at https://terehealth.co.nz/watch.",
      '',
      'Happy to walk your manager and clinical lead through a real consult.',
      '',
      'Ngā mihi,',
      'Dr Patrick Herling',
      'Co-founder, Tere Health',
      'patrick@terehealth.co.nz',
      'terehealth.co.nz',
      ...footer,
    ].join('\n')
  }
  return [
    sal,
    '',
    "I'm Dr Patrick Herling, co-founder of Tere Health. We run a NZ-wide telehealth service built for the problem your nurses face after 5pm: a resident goes off, the GP rooms are shut, and the only options are an on-call line or an ambulance.",
    '',
    'Tere gives your RN a NZ-registered doctor on video. Vitals read through the camera, prescriptions, imaging referrals, ACC and a GP letter all delivered during the consult.',
    '',
    'We sit alongside your contracted GP as the after-hours and acute pathway, not in place of them.',
    '',
    "Overview attached. If you'd rather see it in 60 seconds first, a walkthrough video is at https://terehealth.co.nz/watch.",
    '',
    'Happy to walk your manager and clinical lead through a real consult.',
    '',
    'Ngā mihi,',
    'Dr Patrick Herling',
    'Co-founder, Tere Health',
    'patrick@terehealth.co.nz',
    'terehealth.co.nz',
    ...footer,
  ].join('\n')
}

// ─── Load attachment once ──────────────────────────────────────────────────

if (!fs.existsSync(PDF_PATH)) {
  console.error(`\n✗ PDF not found at ${PDF_PATH}`)
  process.exit(1)
}
const pdfBuf = fs.readFileSync(PDF_PATH)
const pdfAttachment = {
  filename: 'Tere_Health_Aged_Residential_Care.pdf',
  content: pdfBuf,
  contentType: 'application/pdf',
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

// Dedupe guard: a chain/shared-inbox (e.g. info@ambridgerose.co.nz, several
// HBH facilities) should not receive the same mail multiple times. We keep
// the first occurrence and surface duplicates in the summary.
const seenEmails = new Set()
const dedupedRecipients = []
const dupeSkipped = []
for (const r of RECIPIENTS) {
  const key = r.email.toLowerCase()
  if (seenEmails.has(key)) {
    dupeSkipped.push(r)
    continue
  }
  seenEmails.add(key)
  dedupedRecipients.push(r)
}

// Batching: --batch-start=N --batch-size=M slices the deduped list so the
// 110 sends can be spread across multiple days. Reputation safeguard:
// bulk cold outreach from a prod clinical domain is a known risk, so we
// cap each day's run at ~22-25 to look organic to receivers. --limit still
// works on top of batching for smoke tests.
const batchEnd = BATCH_SIZE ? BATCH_START + BATCH_SIZE : dedupedRecipients.length
const batched = dedupedRecipients.slice(BATCH_START, batchEnd)
const pool = LIMIT ? batched.slice(0, LIMIT) : batched

// Bucket + region tallies for the console banner.
const urbanCount = pool.filter(r => r.bucket === 'urban').length
const ruralCount = pool.filter(r => r.bucket === 'rural').length
const byRegion = pool.reduce((acc, r) => { acc[r.region] = (acc[r.region] || 0) + 1; return acc }, {})

console.log('\n════════════════════════════════════════════════════════════════')
console.log(`  ARC NI outreach mail-merge · ${SEND ? 'LIVE SEND' : 'DRY RUN'}`)
console.log(`  Recipients: ${pool.length}${LIMIT ? ` (limited from ${dedupedRecipients.length})` : ''}`)
console.log(`  Urban: ${urbanCount} · Rural: ${ruralCount}`)
console.log(`  By region: ${Object.entries(byRegion).map(([k,v]) => `${k}=${v}`).join(', ')}`)
console.log(`  Dupes skipped: ${dupeSkipped.length}`)
console.log(`  From: ${FROM}`)
console.log(`  CC:   ${CC.join(', ')}`)
console.log(`  Attachment: ${PDF_PATH} (${(pdfBuf.length/1024).toFixed(0)} KB)`)
console.log('════════════════════════════════════════════════════════════════\n')

if (SEND && !hasEmailProvider()) {
  console.error('✗ EMAIL_PROVIDER env not set or credentials missing. Aborting.')
  process.exit(1)
}

const results = []
const started = Date.now()

for (let i = 0; i < pool.length; i++) {
  const r = pool[i]
  const subject = subjectFor(r.bucket, r.facility_name)
  const html = r.bucket === 'urban'
    ? renderUrbanHtml({ first: r.first })
    : renderRuralHtml({ first: r.first })
  const text = renderText({ bucket: r.bucket, first: r.first })

  if (!SEND) {
    const previewPath = path.join(
      PREVIEW_DIR,
      `NI-${String(i+1).padStart(2,'0')}-${r.bucket}-${slug(r.facility_name)}.html`,
    )
    const bodyInner = html
      .replace(/^<!doctype html>[\s\S]*?<body[^>]*>/, '')
      .replace(/<\/body>[\s\S]*$/, '')
    const previewHtml = `<!doctype html>
<html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; background: #f5f5f5; padding: 20px;">
<div style="background: white; padding: 20px; max-width: 720px; margin: 0 auto; border: 1px solid #ddd;">
<p style="color: #666; font-size: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
<b>Preview</b> · ${i+1}/${pool.length} · ${r.region} · bucket=<b>${r.bucket}</b><br>
<b>To:</b> ${r.email}<br>
<b>Cc:</b> ${CC.join(', ')}<br>
<b>From:</b> ${FROM}<br>
<b>Subject:</b> ${subject}<br>
<b>Attachment:</b> Tere_Health_Aged_Residential_Care.pdf (${(pdfBuf.length/1024).toFixed(0)} KB, download)
</p>
${bodyInner}
</div>
</body></html>`
    fs.writeFileSync(previewPath, previewHtml)
    console.log(`  [${String(i+1).padStart(2,'0')}/${pool.length}]  ${r.bucket.padEnd(5)}  ${r.email.padEnd(50)}  → preview written`)
    results.push({ ok: true, dryRun: true, recipient: r, subject })
    continue
  }

  try {
    const res = await sendEmail({
      from: FROM,
      to: r.email,
      cc: CC,
      replyTo: REPLY_TO,
      subject,
      html,
      text,
      attachments: [pdfAttachment],
    })
    const ok = Boolean(res?.ok)
    console.log(`  [${String(i+1).padStart(2,'0')}/${pool.length}]  ${r.bucket.padEnd(5)}  ${r.email.padEnd(50)}  ${ok ? '✓' : '✗ ' + (res?.error || 'unknown')}`)
    results.push({ ok, id: res?.id, provider: res?.provider, error: res?.error, recipient: r, subject })
  } catch (e) {
    console.log(`  [${String(i+1).padStart(2,'0')}/${pool.length}]  ${r.bucket.padEnd(5)}  ${r.email.padEnd(50)}  ✗ ${e?.message || e}`)
    results.push({ ok: false, error: e?.message || String(e), recipient: r, subject })
  }

  await new Promise(r => setTimeout(r, 300))
}

const ts = new Date().toISOString().replace(/[:.]/g, '-')
const logPath = path.join(LOG_DIR, `arc-ni-${SEND ? 'send' : 'dry'}-${ts}.json`)
fs.writeFileSync(logPath, JSON.stringify({
  mode: SEND ? 'send' : 'dry',
  started: new Date(started).toISOString(),
  finished: new Date().toISOString(),
  recipientCount: pool.length,
  urbanCount,
  ruralCount,
  byRegion,
  dupesSkipped: dupeSkipped.map(r => ({ email: r.email, facility_name: r.facility_name })),
  okCount: results.filter(r => r.ok).length,
  failCount: results.filter(r => !r.ok).length,
  from: FROM,
  cc: CC,
  replyTo: REPLY_TO,
  results,
}, null, 2))

console.log('\n────────────────────────────────────────────────────────────────')
console.log(`  ${results.filter(r => r.ok).length} ok · ${results.filter(r => !r.ok).length} failed`)
console.log(`  Log: ${logPath}`)
if (!SEND) {
  console.log(`  Previews: ${PREVIEW_DIR}/NI-*.html`)
  console.log(`  To send live:  node --env-file=.env scripts/mail_merge_arc_outreach_ni.mjs --send`)
}
console.log('════════════════════════════════════════════════════════════════\n')
