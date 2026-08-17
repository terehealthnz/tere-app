// RHCNZ imaging integration — regional intake routing.
//
// Referrals to RHCNZ are always tagged Urgent and delivered by email to the
// regional intake for the patient's location. RHCNZ then contacts the
// patient to book. Source: docs/regulatory/rhcnz/README.md (confirmed by
// Jesse Thorpe 2026-08-17).
//
// Provider picks a region on the referral form; server maps id → email so
// the client can't be spoofed into sending to arbitrary addresses.

export const RHCNZ_REGIONS = [
  { id: 'arg',        brand: 'Auckland Radiology (ARG)', region: 'Auckland / Northland',   email: 'bookings@arg.co.nz'                  },
  { id: 'bay',        brand: 'Bay Radiology',            region: 'Bay of Plenty',          email: 'info@bayradiology.co.nz'             },
  { id: 'pr-waikato', brand: 'Pacific Radiology',        region: 'Waikato',                email: 'waikato@pacificradiology.com'        },
  { id: 'pr-wgtn',    brand: 'Pacific Radiology',        region: 'Wellington / Manawatū',  email: 'appointments@pacificradiology.com'   },
  { id: 'pr-nelson',  brand: 'Pacific Radiology',        region: 'Nelson',                 email: 'nelson.admin@pacificradiology.com'   },
  { id: 'pr-cbg',     brand: 'Pacific Radiology',        region: 'Canterbury',             email: 'contactcentrechc@pacificradiology.com' },
  { id: 'pr-otago',   brand: 'Pacific Radiology',        region: 'Otago / Southland',      email: 'dunedin.reception@pacificradiology.com' },
  { id: 'cbc',        brand: 'Canterbury BreastCare',    region: 'Canterbury (breast)',    email: 'cbc.admin@pacificradiology.com'      },
]

export function rhcnzRegionById(id) {
  return RHCNZ_REGIONS.find(r => r.id === id) || null
}

// Tere's Medical Objects shortcode on outbound HL7 (Practice Dispatch field
// on the RHCNZ template). Currently the same as our HPI-O — pending
// confirmation from Tony Cruice at MO Helpdesk (case #1058382).
export const TERE_MO_SHORTCODE = 'G11238-E'
