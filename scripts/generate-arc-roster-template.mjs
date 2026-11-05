// Generates the ARC resident roster template emailed to new aged residential
// care facilities when they come on board. One-off manual run:
//
//   node scripts/generate-arc-roster-template.mjs
//
// Writes ~/Downloads/Tere_Health_ARC_Roster_Template.xlsx with two sheets:
//
//   1. Residents - header row + one example row showing the expected format
//      for every column the ARC roster POST accepts. Facility fills in one
//      row per resident, sends the file back to hello@terehealth.co.nz, we
//      drop it into the admin upload at /admin -> Employers -> (facility)
//      -> Residents -> Import CSV.
//
//   2. Instructions - plain-English guidance so the facility manager
//      doesn't have to guess what resus_status / epoa_type values we
//      accept. The upload endpoint coerces most common phrasings but the
//      template uses the canonical values so the roster reads cleanly in
//      the admin table.
//
// NOT part of CI. Script is standalone - run it, grab the .xlsx out of
// ~/Downloads/, attach to a facility onboarding email.

import ExcelJS from 'exceljs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const OUTPUT_PATH = join(homedir(), 'Downloads', 'Tere_Health_ARC_Roster_Template.xlsx')

// Column spec - order here is the order the facility sees in the Residents
// sheet. header + example cells both come from this array so the two stay
// in sync. Keys mirror the exact column names on employer_employees so a
// future auto-mapper could read the header row verbatim.
const COLUMNS = [
  { key: 'facility_resident_id',     header: 'facility_resident_id',           example: 'HV001',                                          width: 22 },
  { key: 'first_name',               header: 'first_name',                     example: 'Margaret',                                       width: 14 },
  { key: 'last_name',                header: 'last_name',                      example: 'Thompson',                                       width: 14 },
  { key: 'dob',                      header: 'dob (DD/MM/YYYY)',               example: '05/03/1938',                                     width: 18 },
  { key: 'nhi',                      header: 'nhi',                            example: 'ABC1234',                                        width: 12 },
  { key: 'room_number',              header: 'room_number',                    example: 'Room 12',                                        width: 12 },
  { key: 'resus_status',             header: 'resus_status',                   example: 'nfr',                                            width: 14 },
  { key: 'transfer_to_hospital',     header: 'transfer_to_hospital',           example: 'no',                                             width: 18 },
  { key: 'acp_summary',              header: 'acp_summary',                    example: 'Comfort measures only. Stay at facility.',       width: 42 },
  { key: 'epoa_name',                header: 'epoa_name',                      example: 'John Thompson (son)',                            width: 24 },
  { key: 'epoa_phone',               header: 'epoa_phone',                     example: '021 555 1234',                                   width: 16 },
  { key: 'epoa_email',               header: 'epoa_email',                     example: 'john.t@example.com',                             width: 24 },
  { key: 'epoa_type',                header: 'epoa_type',                      example: 'personal_care_welfare',                          width: 22 },
  { key: 'epoa_activated',           header: 'epoa_activated',                 example: 'yes',                                            width: 14 },
  { key: 'epoa_capacity_cert_date',  header: 'epoa_capacity_cert_date (DD/MM/YYYY)', example: '15/06/2024',                               width: 30 },
]

// Prose that goes on Sheet 2. Each entry becomes one row with a bold
// heading + wrapped body text. Keep this terse - the facility manager is
// doing the entry by hand, not reading an SOP.
const INSTRUCTIONS = [
  {
    heading: 'What this template is for',
    body: 'One row per resident. Send the completed file back to hello@terehealth.co.nz and we will load it into the Tere Health roster for your facility. Only first_name, last_name, and dob are strictly required - leave anything else blank if you do not have it. We can always top up missing fields later.',
  },
  {
    heading: 'facility_resident_id',
    body: 'Your internal resident ID (e.g. HV001). This needs to stay stable across uploads so our monthly utilisation report tracks the right resident over time. If you re-send the roster with changes, keep the same facility_resident_id and we will update the existing row instead of creating a duplicate.',
  },
  {
    heading: 'dob',
    body: 'Date of birth in DD/MM/YYYY (NZ format). YYYY-MM-DD is also accepted.',
  },
  {
    heading: 'resus_status',
    body: 'One of: nfr / for_resus / unknown. We also accept "Not for resus", "DNR", "For resuscitation" etc - we will normalise on our side. Leave blank if you are not sure.',
  },
  {
    heading: 'transfer_to_hospital',
    body: 'yes or no (or leave blank). "no" means comfort care in place - no 111 call, no ED transfer. Our provider sees this at the top of the chart before they start the consult.',
  },
  {
    heading: 'acp_summary',
    body: 'Free text - one or two sentences describing the resident\'s advance care plan. The Tere provider sees this verbatim on their chart. Keep it clinically actionable (e.g. "Comfort measures only. No antibiotics. Stay at facility.").',
  },
  {
    heading: 'epoa_type',
    body: 'One of: none / property_only / personal_care_welfare / both. IMPORTANT: only "personal_care_welfare" or "both" can consent to treatment on behalf of the resident. A property-only EPOA has NO authority to consent to healthcare decisions - Tere relies on this field to route consent correctly at prescribe time.',
  },
  {
    heading: 'epoa_activated',
    body: 'yes or no. Only mark "yes" if the resident has been formally certified mentally incapable (capacity certificate signed by a doctor). If unsure, leave blank - we treat that as "not activated" and consent still needs to come from the resident where possible.',
  },
  {
    heading: 'epoa_capacity_cert_date',
    body: 'Date of the capacity certificate in DD/MM/YYYY. Only relevant if epoa_activated is yes.',
  },
  {
    heading: 'Re-uploading a corrected roster',
    body: 'Safe. As long as facility_resident_id stays the same, we will update existing rows in place. New rows get added. Residents you drop from a later upload do NOT get auto-deactivated in v1.1 - email us if you need a resident removed.',
  },
]

async function main() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Tere Health'
  wb.created = new Date()
  wb.description = 'ARC resident roster template. Fill one row per resident and return to hello@terehealth.co.nz.'

  // ---- Sheet 1: Residents ----
  const residents = wb.addWorksheet('Residents', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  residents.columns = COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }))

  // Style the header row - teal background, white bold text, matches the
  // Tere brand palette used in the admin UI.
  const headerRow = residents.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14B8A6' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  headerRow.height = 28

  // One example row so the facility sees the expected format for every
  // column without having to cross-reference the Instructions sheet.
  residents.addRow(Object.fromEntries(COLUMNS.map(c => [c.key, c.example])))

  // Freeze header + enable autofilter so the facility can sort/filter as
  // they fill in.
  residents.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } }

  // ---- Sheet 2: Instructions ----
  const instructions = wb.addWorksheet('Instructions', {
    views: [{ showGridLines: false }],
  })
  instructions.columns = [
    { key: 'heading', width: 32 },
    { key: 'body',    width: 90 },
  ]

  // Title row
  const titleRow = instructions.addRow(['Tere Health - ARC Roster Template', ''])
  titleRow.font = { bold: true, size: 16, color: { argb: 'FF0F766E' } }
  titleRow.height = 32
  instructions.mergeCells(`A${titleRow.number}:B${titleRow.number}`)

  instructions.addRow(['', ''])

  for (const item of INSTRUCTIONS) {
    const row = instructions.addRow([item.heading, item.body])
    row.getCell(1).font = { bold: true, color: { argb: 'FF0F766E' }, size: 11 }
    row.getCell(1).alignment = { vertical: 'top', wrapText: true }
    row.getCell(2).alignment = { vertical: 'top', wrapText: true }
    row.getCell(2).font = { size: 11 }
    // Height grows with body length so long paragraphs stay readable
    // without the facility manager having to manually resize rows.
    const approxLines = Math.max(2, Math.ceil(item.body.length / 85))
    row.height = approxLines * 18
  }

  instructions.addRow(['', ''])
  const footer = instructions.addRow(['', 'Questions? hello@terehealth.co.nz'])
  footer.getCell(2).font = { italic: true, color: { argb: 'FF6B7280' }, size: 10 }

  await wb.xlsx.writeFile(OUTPUT_PATH)
  const { statSync } = await import('node:fs')
  const size = statSync(OUTPUT_PATH).size
  console.log(`Wrote ${OUTPUT_PATH} (${size} bytes)`)
}

main().catch(err => {
  console.error('Failed to generate ARC roster template:', err)
  process.exit(1)
})
