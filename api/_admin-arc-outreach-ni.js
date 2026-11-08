// One-shot admin endpoint for the North Island aged residential care (ARC)
// outreach wave. Mirror of the 2026-10-28 South Island admin endpoint pattern
// (ripped on fa92f7b). Fires one batch per click. RIP THIS FILE + the PDF
// alongside it after the five batches complete (same pattern as Oct).
//
// Auth:
//   Must be a signed-in provider with is_admin.
//
// Usage (admin, in browser):
//   GET /api/admin-arc-outreach-ni?confirm=yes&batch_start=0&batch_size=22
//   GET /api/admin-arc-outreach-ni?confirm=yes&batch_start=22&batch_size=22
//   GET /api/admin-arc-outreach-ni?confirm=yes&batch_start=44&batch_size=22
//   GET /api/admin-arc-outreach-ni?confirm=yes&batch_start=66&batch_size=22
//   GET /api/admin-arc-outreach-ni?confirm=yes&batch_start=88&batch_size=22
//
// Omit confirm=yes to preview the batch (dry run, same auth gate).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardProvider } from './_auth.js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import { writeAuditEvent } from './_audit-write.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const FROM     = 'Tere Health <hello@terehealth.co.nz>'
const CC       = ['patrick@terehealth.co.nz', 'justin@terehealth.co.nz']
const REPLY_TO = 'hello@terehealth.co.nz'

const RECIPIENTS = [
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'KHVCT Kamo Home',                       email: 'zoeb@khvct.co.nz',                         first: 'Zoe' },
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'KHVCT Parahaki Court',                  email: 'zoeb@khvct.co.nz',                         first: 'Zoe' },
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'Cairnfield House Rest Home & Hospital', email: 'lhauraki@cairnfieldhouse.co.nz',           first: 'Lesley' },
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'Shalom Aged Care',                      email: 'manager@shalomagedcare.co.nz',             first: 'Zoe' },
  { region: 'Northland', city: 'Whangārei',   postcode: '0112', bucket: 'rural', facility_name: 'Heritage Lifecare Puriri Court',        email: 'manager.puriricourt@hll.org.nz',           first: null },
  { region: 'Northland', city: 'Dargaville',  postcode: '0310', bucket: 'rural', facility_name: 'Kauri Coast Lifecare',                  email: 'manager@kaurilifecare.co.nz',              first: null },
  { region: 'Northland', city: 'Dargaville',  postcode: '0310', bucket: 'rural', facility_name: 'Norfolk Court Home & Hospital',         email: 'norfolkcourtdargaville@xtra.co.nz',        first: null },
  { region: 'Northland', city: 'Kaitaia',     postcode: '0410', bucket: 'rural', facility_name: 'Claud Switzer Residential Care',        email: 'reception@switzer.org.nz',                 first: null },
  { region: 'Northland', city: 'Kerikeri',    postcode: '0230', bucket: 'rural', facility_name: 'Kerikeri Retirement Village',           email: 'reception@kerikerivillage.co.nz',          first: 'Nathan' },
  { region: 'Northland', city: 'Maungaturoto', postcode: '0520', bucket: 'rural', facility_name: 'Riverview Living (Maungaturoto Rest Home)', email: 'info@riverviewliving.nz',             first: null },
  { region: 'Northland', city: 'Rawene',      postcode: '0473', bucket: 'rural', facility_name: 'Hauora Hokianga',                       email: 'lyn.foster@hokiangahealth.org.nz',         first: 'Lyn' },

  { region: 'Auckland',  city: 'Epsom',       postcode: '1023', bucket: 'urban', facility_name: 'Rose Lodge Rest Home',                   email: 'rose@gracefulcare.co.nz',                  first: 'Sidd' },
  { region: 'Auckland',  city: 'Mt Roskill',  postcode: '1041', bucket: 'urban', facility_name: 'Gracedale Home and Hospital',            email: 'admin@gracedale.co.nz',                    first: 'Anjani' },
  { region: 'Auckland',  city: 'Mt Roskill',  postcode: '1041', bucket: 'urban', facility_name: 'Dominion Home',                          email: 'dominionhome.dementia@gmail.com',          first: null },
  { region: 'Auckland',  city: 'New Windsor', postcode: '1025', bucket: 'urban', facility_name: 'Blockhouse Bay Home',                    email: 'bhresthome@hotmail.com',                   first: 'Ravi' },
  { region: 'Auckland',  city: 'Blockhouse Bay', postcode: '0600', bucket: 'urban', facility_name: 'CHT Peacehaven Rest Home and Hospital', email: 'peacehaven@cht.co.nz',                   first: 'Christine' },
  { region: 'Auckland',  city: 'Sandringham', postcode: '1025', bucket: 'urban', facility_name: 'Lexham Gardens Lifecare',                email: 'manager@lexham.co.nz',                     first: 'Jaspreet' },
  { region: 'Auckland',  city: 'Avondale',    postcode: '1026', bucket: 'urban', facility_name: 'Avondale Lifecare',                      email: 'manager@avondalelifecare.co.nz',           first: 'Resina' },
  { region: 'Auckland',  city: 'Herne Bay',   postcode: '1011', bucket: 'urban', facility_name: 'Sunrise Healthcare Jervois Residential Care', email: 'enquires@sunrisehealthcare.co.nz',    first: null },
  { region: 'Auckland',  city: 'Westmere',    postcode: '1022', bucket: 'urban', facility_name: 'Sunrise Healthcare Lynton Lodge Hospital', email: 'lynton@sunrisehealthcare.co.nz',         first: 'Sue' },
  { region: 'Auckland',  city: 'Henderson',   postcode: '0610', bucket: 'urban', facility_name: 'CHT Carnarvon Hospital',                 email: 'carnarvon@cht.co.nz',                      first: null },
  { region: 'Auckland',  city: 'Algies Bay',  postcode: '0920', bucket: 'urban', facility_name: 'CHT Amberlea Home & Hospital',           email: 'amberlea@cht.co.nz',                       first: 'Annette' },
  { region: 'Auckland',  city: 'Whangaparāoa', postcode: '0932', bucket: 'urban', facility_name: 'CHT Halldene Home and Hospital',        email: 'halldene@cht.co.nz',                       first: null },
  { region: 'Auckland',  city: 'Birkenhead',  postcode: '0626', bucket: 'urban', facility_name: 'CHT Onewa Home and Hospital',            email: 'onewa@cht.co.nz',                          first: null },
  { region: 'Auckland',  city: 'Northcote',   postcode: '0627', bucket: 'urban', facility_name: 'Graceful Care Shoal Bay Dementia',       email: 'rose@gracefulcare.co.nz',                  first: 'Rose' },
  { region: 'Auckland',  city: 'West Harbour', postcode: '0618', bucket: 'urban', facility_name: 'Sunrise Healthcare West Harbour Gardens', email: 'enquires@sunrisehealthcare.co.nz',       first: null },
  { region: 'Auckland',  city: 'Bucklands Beach', postcode: '2012', bucket: 'urban', facility_name: 'Ambridge Rose Beach House',          email: 'info@ambridgerose.co.nz',                  first: 'Allan' },
  { region: 'Auckland',  city: 'Bucklands Beach', postcode: '2012', bucket: 'urban', facility_name: 'Ambridge Rose Cottage',              email: 'info@ambridgerose.co.nz',                  first: 'Jackie' },
  { region: 'Auckland',  city: 'Bucklands Beach', postcode: '2012', bucket: 'urban', facility_name: 'Ambridge Rose Manor',                email: 'info@ambridgerose.co.nz',                  first: 'Brian' },
  { region: 'Auckland',  city: 'Bucklands Beach', postcode: '2012', bucket: 'urban', facility_name: 'Ambridge Rose Villa',                email: 'info@ambridgerose.co.nz',                  first: 'Doreen' },
  { region: 'Auckland',  city: 'Howick',      postcode: '2014', bucket: 'urban', facility_name: 'HBH Senior Living Gulf Views',           email: 'anne.kirkbride@hbh.org.nz',                first: 'Marc' },
  { region: 'Auckland',  city: 'Howick',      postcode: '2014', bucket: 'urban', facility_name: 'HBH Senior Living Howick Views',         email: 'anne.kirkbride@hbh.org.nz',                first: null },
  { region: 'Auckland',  city: 'Howick',      postcode: '2014', bucket: 'urban', facility_name: 'HBH Gracedale',                           email: 'anne.kirkbride@hbh.org.nz',                first: null },
  { region: 'Auckland',  city: 'Papakura',    postcode: '2110', bucket: 'urban', facility_name: 'Papakura Private Hospital',              email: 'info@pphl.co.nz',                          first: 'Jay' },
  { region: 'Auckland',  city: 'Pukekohe',    postcode: '2120', bucket: 'urban', facility_name: 'Heritage Lifecare Palms Lifecare & Village', email: 'manager.palms@hll.org.nz',               first: null },
  { region: 'Auckland',  city: 'Henderson',   postcode: '0612', bucket: 'urban', facility_name: 'Lexall Care Hospital and Rest Home',     email: 'manager@lexallcare.co.nz',                 first: null },

  { region: 'Waikato',   city: 'Hamilton',    postcode: '3288', bucket: 'rural', facility_name: 'Brylyn Rest Home',                       email: 'info@brylynhome.co.nz',                    first: null },
  { region: 'Waikato',   city: 'Hamilton East', postcode: '3216', bucket: 'rural', facility_name: 'Tamahere Eventide Home & Retirement Village', email: 'admin@tamahere.co.nz',                 first: 'Versie' },
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

  { region: 'Bay of Plenty', city: 'Tauranga', postcode: '3110', bucket: 'urban', facility_name: 'Killarney Rest Home',                   email: 'killarney@xtra.co.nz',                     first: 'Carol' },
  { region: 'Bay of Plenty', city: 'Mount Maunganui', postcode: '3116', bucket: 'urban', facility_name: 'Malyon House',                    email: 'admin@malyonhouse.co.nz',                  first: null },
  { region: 'Bay of Plenty', city: 'Tauranga South', postcode: '3112', bucket: 'urban', facility_name: 'Heritage Lifecare Hodgson House Lifecare & Village', email: 'manager.hodgson@hll.org.nz',   first: null },
  { region: 'Bay of Plenty', city: 'Judea',    postcode: '3110', bucket: 'urban', facility_name: 'Elmswood Care Centre',                  email: 'rose@gracefulcare.co.nz',                  first: null },
  { region: 'Bay of Plenty', city: 'Papamoa Beach', postcode: '3118', bucket: 'rural', facility_name: 'Pacific Coast Village',           email: 'info@pcv.co.nz',                           first: 'Julia' },
  { region: 'Bay of Plenty', city: 'Te Puke',  postcode: '3119', bucket: 'rural', facility_name: 'Heritage Lifecare Carter House Lifecare & Village', email: 'manager.carter@hll.org.nz',       first: null },
  { region: 'Bay of Plenty', city: 'Whakatāne', postcode: '3120', bucket: 'rural', facility_name: 'Golden Pond Lifecare',                  email: 'golden.pond@xtra.co.nz',                   first: 'Anna' },
  { region: 'Bay of Plenty', city: 'Whakatāne', postcode: '3120', bucket: 'rural', facility_name: 'Sheaffs Rest Home',                     email: 'info@sheaffsresthome.co.nz',               first: 'Melissa' },
  { region: 'Bay of Plenty', city: 'Ōhope',    postcode: '3121', bucket: 'rural', facility_name: 'Ōhope Beach Care',                      email: 'ohopelodge@xtra.co.nz',                    first: null },

  { region: 'Lakes',     city: 'Rotorua',     postcode: '3010', bucket: 'rural', facility_name: 'Heritage Lifecare Cantabria Lifecare & Village', email: 'manager.cantabria@hll.org.nz',       first: null },

  { region: 'Tairāwhiti', city: 'Gisborne',   postcode: '4010', bucket: 'rural', facility_name: 'Beetham Healthcare',                     email: 'info@beetham.co.nz',                       first: null },
  { region: 'Tairāwhiti', city: 'Gisborne',   postcode: '4020', bucket: 'rural', facility_name: 'Leighton House',                          email: 'oc@leightonhouse.co.nz',                   first: null },
  { region: 'Tairāwhiti', city: 'Kaiti',      postcode: '4010', bucket: 'rural', facility_name: 'Dunblane Lifecare',                       email: 'manager@dunblanelifecare.co.nz',           first: null },
  { region: 'Tairāwhiti', city: 'Gisborne',   postcode: '4010', bucket: 'rural', facility_name: 'Heritage Lifecare Te Wiremu House',      email: 'manager.tewiremu@hll.org.nz',              first: null },

  { region: "Hawke's Bay", city: 'Hastings',  postcode: '4122', bucket: 'rural', facility_name: 'Brittany House Residential Care',        email: 'manager@brittanyhouse.co.nz',              first: null },
  { region: "Hawke's Bay", city: 'Hastings',  postcode: '4120', bucket: 'rural', facility_name: 'Heritage Lifecare Colwyn House',          email: 'manager.colwyn@hll.org.nz',                first: null },
  { region: "Hawke's Bay", city: 'Havelock North', postcode: '4130', bucket: 'rural', facility_name: 'Heritage Lifecare Waiapu House Lifecare & Village', email: 'manager.waiapu@hll.org.nz',   first: null },
  { region: "Hawke's Bay", city: 'Hastings',  postcode: '4120', bucket: 'rural', facility_name: 'Heritage Lifecare Glengarry',             email: 'manager.glengarry@hll.org.nz',             first: null },
  { region: "Hawke's Bay", city: 'Napier',    postcode: '4112', bucket: 'rural', facility_name: 'Napier District Masonic Trust (Taradale Rest Home)', email: 'trust@ndmt.co.nz',                 first: null },
  { region: "Hawke's Bay", city: 'Napier',    postcode: '4110', bucket: 'rural', facility_name: 'Experion Care Greendale Residential Care', email: 'manager.greendale@experioncare.co.nz',    first: null },
  { region: "Hawke's Bay", city: 'Waipukurau', postcode: '4200', bucket: 'rural', facility_name: 'Kaylexcare Mt Herbert House',           email: 'mtherbert@kaylexcare.co.nz',               first: null },

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

  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Springvale Manor',                        email: 'arc.manager@livingwatersmedical.co.nz',    first: 'Shanyn' },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Living Waters Rest Home',                 email: 'arc.manager@livingwatersmedical.co.nz',    first: null },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Heritage Lifecare St Johns Hill Lifecare', email: 'manager.stjohnshill@hll.org.nz',          first: 'Sue' },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Heritage Lifecare Broadview Lifecare & Village', email: 'manager.broadview@hll.org.nz',       first: null },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Enliven Kōwhainui Home',                  email: 'kowhainui@psc.org.nz',                     first: 'Trish' },
  { region: 'Whanganui', city: 'Whanganui',   postcode: '4500', bucket: 'rural', facility_name: 'Experion Care Okere House',              email: 'manager.okere@experioncare.co.nz',         first: null },

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

  { region: 'Wairarapa', city: 'Masterton',   postcode: '5810', bucket: 'rural', facility_name: 'Alden Lansdowne Court',                  email: 'manager.lansdownecourt@alden.co.nz',       first: null },
  { region: 'Wairarapa', city: 'Masterton',   postcode: '5810', bucket: 'rural', facility_name: 'Lyndale Care',                            email: 'manager@lyndalecare.co.nz',                first: 'Emma' },
  { region: 'Wairarapa', city: 'Masterton',   postcode: '5810', bucket: 'rural', facility_name: 'Glenwood Masonic Hospital Masterton',    email: 'gwmanager@masonicvillages.co.nz',          first: null },
  { region: 'Wairarapa', city: 'Carterton',   postcode: '5713', bucket: 'rural', facility_name: 'Heritage Lifecare Roseneath Lifecare & Village', email: 'manager.roseneath@hll.org.nz',       first: null },
  { region: 'Wairarapa', city: 'Carterton',   postcode: '5713', bucket: 'rural', facility_name: 'Enliven Kandahar Home',                  email: 'kandahar@psc.org.nz',                      first: 'David' },

  { region: 'Hutt',      city: 'Lower Hutt',  postcode: '5010', bucket: 'urban', facility_name: 'Enliven Woburn Home',                     email: 'woburn@psc.org.nz',                        first: 'Noelette' },
  { region: 'Hutt',      city: 'Lower Hutt',  postcode: '5010', bucket: 'urban', facility_name: 'Woburn Masonic Care',                    email: 'wmmanager@masonicvillages.co.nz',          first: 'Heidi' },
  { region: 'Hutt',      city: 'Lower Hutt',  postcode: '5010', bucket: 'urban', facility_name: 'Ropata Lodge and Village',               email: 'manager@ropatalodge.co.nz',                first: 'Tamsin' },
  { region: 'Hutt',      city: 'Lower Hutt',  postcode: '5011', bucket: 'urban', facility_name: 'Aroha Care Centre for the Elderly',      email: 'administration@arohacarecentre.co.nz',     first: 'Michelle' },
  { region: 'Hutt',      city: 'Upper Hutt',  postcode: '5018', bucket: 'urban', facility_name: 'Heritage Lifecare St Josephs',            email: 'manager.stjosephs@hll.org.nz',             first: null },

  { region: 'Wellington', city: 'Newtown',    postcode: '6021', bucket: 'urban', facility_name: 'Te Hopai Home and Hospital',             email: 'manager@tehopai.co.nz',                    first: 'Pakize' },
  { region: 'Wellington', city: 'Berhampore', postcode: '6023', bucket: 'urban', facility_name: 'Vincentian Home and Hospital',           email: 'manager@vincentianhome.co.nz',             first: 'Clement' },
  { region: 'Wellington', city: 'Island Bay', postcode: '6023', bucket: 'urban', facility_name: 'Irwell Rest Home',                       email: 'office@irwell.co.nz',                      first: 'John' },
  { region: 'Wellington', city: 'Karori',     postcode: '6012', bucket: 'urban', facility_name: 'Enliven Huntleigh Home',                 email: 'huntleigh@psc.org.nz',                     first: 'Anna' },
  { region: 'Wellington', city: 'Johnsonville', postcode: '6037', bucket: 'urban', facility_name: 'Enliven Cashmere Home',                 email: 'cashmere@psc.org.nz',                      first: 'Manisha' },
  { region: 'Wellington', city: 'Tawa',       postcode: '5028', bucket: 'urban', facility_name: 'Enliven Longview Home',                  email: 'longview@psc.org.nz',                      first: 'Arlyn' },
  { region: 'Wellington', city: 'Churton Park', postcode: '6037', bucket: 'urban', facility_name: 'Alden Churtonleigh',                   email: 'manager.churtonleigh@alden.co.nz',         first: null },
  { region: 'Wellington', city: 'Paraparaumu', postcode: '5032', bucket: 'urban', facility_name: 'Kena Kena Rest Home',                    email: 'office@kenakena.co.nz',                    first: null },
  { region: 'Wellington', city: 'Paraparaumu', postcode: '5032', bucket: 'urban', facility_name: 'Kapiti Rest Home',                       email: 'manager@kapitiresthome.co.nz',             first: null },
  { region: 'Wellington', city: 'Paraparaumu', postcode: '5032', bucket: 'urban', facility_name: 'Eldon Masonic Care Facility',          email: 'admin.eldon@masonicvillages.co.nz',        first: 'Shaun' },
]

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

function renderText({ bucket, first }) {
  const sal = `Kia ora${greetingName(first)},`
  const footer = ['', '-----', "Not interested? Reply with 'unsubscribe' and we will remove your address from our outreach list."]
  if (bucket === 'urban') {
    return [
      sal, '',
      "I'm Dr Patrick Herling, co-founder of Tere Health. We run a NZ-wide telehealth service that covers the gap between your contracted GP and 111: acute and after-hours medical cover delivered by video with your nurse in the room.",
      '',
      "Most rest home transfers aren't about the ambulance, they're about not having a doctor available at 7pm. We give your RN a NZ-registered doctor on video: vitals read through the camera, prescriptions, imaging referrals, ACC and a GP letter all sorted during the call.",
      '', 'We sit alongside your GP, not in place of them.',
      '', "Overview attached. If you'd rather see it in 60 seconds first, a walkthrough video is at https://terehealth.co.nz/watch.",
      '', 'Happy to walk your manager and clinical lead through a real consult.',
      '', 'Ngā mihi,', 'Dr Patrick Herling', 'Co-founder, Tere Health',
      'patrick@terehealth.co.nz', 'terehealth.co.nz',
      ...footer,
    ].join('\n')
  }
  return [
    sal, '',
    "I'm Dr Patrick Herling, co-founder of Tere Health. We run a NZ-wide telehealth service built for the problem your nurses face after 5pm: a resident goes off, the GP rooms are shut, and the only options are an on-call line or an ambulance.",
    '',
    'Tere gives your RN a NZ-registered doctor on video. Vitals read through the camera, prescriptions, imaging referrals, ACC and a GP letter all delivered during the consult.',
    '', 'We sit alongside your contracted GP as the after-hours and acute pathway, not in place of them.',
    '', "Overview attached. If you'd rather see it in 60 seconds first, a walkthrough video is at https://terehealth.co.nz/watch.",
    '', 'Happy to walk your manager and clinical lead through a real consult.',
    '', 'Ngā mihi,', 'Dr Patrick Herling', 'Co-founder, Tere Health',
    'patrick@terehealth.co.nz', 'terehealth.co.nz',
    ...footer,
  ].join('\n')
}

// Dedupe shared inboxes (Ambridge Rose has 4 facilities on one email, HBH 3,
// etc). First occurrence wins so the facility named first keeps its send.
function dedupe(list) {
  const seen = new Set()
  const out = []
  for (const r of list) {
    const key = r.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) {
    return res.status(403).json({ error: 'Admin role required' })
  }

  const confirm     = req.query?.confirm === 'yes'
  const batchStart  = Number.parseInt(req.query?.batch_start, 10)
  const batchSize   = Number.parseInt(req.query?.batch_size, 10)
  if (!Number.isFinite(batchStart) || batchStart < 0)   return res.status(400).json({ error: 'batch_start required (integer, >= 0)' })
  if (!Number.isFinite(batchSize)  || batchSize  <= 0)  return res.status(400).json({ error: 'batch_size required (integer, > 0)' })
  if (batchSize > 30) return res.status(400).json({ error: 'batch_size max 30 for reputation safety' })

  const deduped = dedupe(RECIPIENTS)
  const pool = deduped.slice(batchStart, batchStart + batchSize)
  if (pool.length === 0) {
    return res.status(400).json({ error: `empty slice: batch_start=${batchStart}, deduped total=${deduped.length}` })
  }

  if (!confirm) {
    return res.status(200).json({
      dry_run: true,
      deduped_total: deduped.length,
      slice: { batch_start: batchStart, batch_size: batchSize, actual: pool.length },
      facilities: pool.map(r => ({ facility: r.facility_name, email: r.email, bucket: r.bucket, subject: subjectFor(r.bucket, r.facility_name) })),
    })
  }

  if (!hasEmailProvider()) {
    return res.status(500).json({ error: 'EMAIL_PROVIDER not configured on server' })
  }

  const pdfPath = path.join(__dirname, '_arc-ni-deck.pdf')
  if (!fs.existsSync(pdfPath)) {
    return res.status(500).json({ error: `PDF attachment not found at ${pdfPath}` })
  }
  const pdfBuf = fs.readFileSync(pdfPath)
  const attachment = { filename: 'Tere_Health_Aged_Residential_Care.pdf', content: pdfBuf, contentType: 'application/pdf' }

  const results = []
  for (const r of pool) {
    const html    = r.bucket === 'urban' ? renderUrbanHtml(r) : renderRuralHtml(r)
    const text    = renderText(r)
    const subject = subjectFor(r.bucket, r.facility_name)
    try {
      await sendEmail({
        from: FROM, cc: CC, replyTo: REPLY_TO, to: r.email,
        subject, html, text, attachments: [attachment],
      })
      results.push({ facility: r.facility_name, email: r.email, ok: true })
    } catch (e) {
      results.push({ facility: r.facility_name, email: r.email, ok: false, error: e?.message || String(e) })
    }
    await sleep(500)
  }

  const okCount = results.filter(x => x.ok).length
  const failCount = results.length - okCount

  try {
    await writeAuditEvent(req, auth, {
      event_type:   'arc_outreach_batch_sent',
      resource_type: 'marketing',
      resource_id:  `ni-wave-batch-${batchStart}`,
      metadata: {
        batch_start: batchStart, batch_size: batchSize,
        sent: okCount, failed: failCount,
        deduped_total: deduped.length,
      },
    })
  } catch (e) { console.error('[arc-outreach-ni] audit write failed:', e?.message) }

  return res.status(200).json({
    batch_start: batchStart, batch_size: batchSize,
    sent: okCount, failed: failCount,
    results,
  })
}
