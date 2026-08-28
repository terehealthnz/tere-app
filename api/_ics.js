// Minimal RFC 5545 iCalendar (.ics) generator for interview invites.
//
// Not a full ICS implementation — just VCALENDAR + one VEVENT with the
// fields that Google Calendar, Outlook, and iOS/macOS Calendar actually
// consume. Used as an email attachment so the recipient can single-click
// the event into their calendar.

function icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// Format a Date as UTC yyyymmddThhmmssZ (the ICS DATE-TIME UTC form).
function icsUtc(d) {
  const p = n => String(n).padStart(2, '0')
  return d.getUTCFullYear()
    + p(d.getUTCMonth() + 1)
    + p(d.getUTCDate())
    + 'T'
    + p(d.getUTCHours())
    + p(d.getUTCMinutes())
    + p(d.getUTCSeconds())
    + 'Z'
}

// Fold long lines at 75 octets per RFC 5545 §3.1. Simple char-count fold —
// good enough for ASCII bodies (our summaries + URLs). If we ever emit
// non-ASCII, revisit as byte-count.
function foldLines(text) {
  return text.split('\r\n').map(line => {
    if (line.length <= 75) return line
    const chunks = []
    for (let i = 0; i < line.length; i += 74) {
      chunks.push((i === 0 ? '' : ' ') + line.slice(i, i + 74))
    }
    return chunks.join('\r\n')
  }).join('\r\n')
}

/**
 * Build an .ics file for a single interview event.
 *
 * @param {object} opts
 * @param {string} opts.uid         Stable unique id, e.g. `interview-<row-id>@terehealth.co.nz`
 * @param {Date}   opts.start       Start datetime
 * @param {number} opts.durationMin Duration in minutes
 * @param {string} opts.summary     Event title
 * @param {string} opts.description Long description (join URL etc)
 * @param {string} [opts.location]  Free-text location (URL is fine)
 * @param {string} [opts.organiserEmail]  RFC 5322 email
 * @param {string} [opts.organiserName]   Display name
 * @returns {string} .ics content (CRLF-terminated)
 */
export function buildInterviewIcs(opts) {
  const {
    uid, start, durationMin,
    summary, description,
    location,
    organiserEmail, organiserName,
  } = opts
  const end = new Date(start.getTime() + durationMin * 60_000)
  const now = new Date()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tere Health//Interview Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${icsEscape(uid)}`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
  ]
  if (location) lines.push(`LOCATION:${icsEscape(location)}`)
  if (organiserEmail) {
    lines.push(`ORGANIZER;CN=${icsEscape(organiserName || organiserEmail)}:mailto:${organiserEmail}`)
  }
  lines.push('STATUS:CONFIRMED')
  lines.push('TRANSP:OPAQUE')
  lines.push('END:VEVENT')
  lines.push('END:VCALENDAR')
  return foldLines(lines.join('\r\n')) + '\r\n'
}
