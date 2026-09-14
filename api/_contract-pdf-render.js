// Server-side JSON→PDF renderer for v8.x contract agreements.
//
// Mirrors src/contracts/ContractRenderer.jsx so the applicant's browser
// view and the archived PDF stay in lockstep — same JSON, same
// placeholder substitution, close-enough visual styling.
//
// Callable from countersign / rebuild flows to produce the "attachment"
// half of the merged offer PDF for JSON-templated offers (where
// contract_pdf_key is null but contract_version is set).

import PDFDocument from 'pdfkit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Contract JSON lives here (api/_contracts/) so Vercel's serverless
// bundler (@vercel/ncc) can statically trace and include them. Client
// bundle imports the same data from src/contracts/ (ContractRenderer)
// — the two copies are kept in lockstep by scripts/sync-contracts-to-api.sh.
//
// Why readFileSync + join(__dirname, …) instead of createRequire or an
// import assertion: ncc's static analysis traces this exact pattern
// (literal path.join with __dirname), so the JSON is guaranteed to
// ship with the function. createRequire's dynamic require() cannot be
// traced, so files never make it into the bundle.
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

function loadContract(name) {
  try {
    const p = join(__dirname, '_contracts', name)
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch (e) {
    console.error('[contract-pdf] failed to load', name, e?.message)
    return null
  }
}

const REGISTRY = {
  'v8.1':    loadContract('v8_1.json'),
  'v8.1-np': loadContract('v8_1_np.json'),
}

export function getContractByVersion(version) {
  return REGISTRY[version] || null
}

// Normalise characters pdfkit's base WinAnsi Helvetica can't render.
// The source docx uses Unicode ligatures (ﬁ, ﬂ) and typographic quotes
// which come out as U+FFFD boxes or garbled glyphs otherwise ("ûve"
// instead of "five" was the tell). Browser doesn't care because it uses
// system fonts; server has to strip these back to ASCII equivalents.
function normalizeForPdfkit(text) {
  if (!text) return text
  return String(text)
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/–/g, '-')   // en dash
    .replace(/—/g, '—')   // em dash: WinAnsi has it, keep
    .replace(/ /g, ' ')   // non-breaking space
}

// Placeholder substitution — kept close to ContractRenderer.jsx but with
// one deliberate divergence: the two date fields (contractor_signed_date,
// signer_date) are hardcoded to AT_SIGN in the browser view because
// signature happens client-side after render. When we regenerate the
// PDF post-countersign we know both dates, so accept them from the
// contractor object if provided.
function substitute(text, contractor) {
  if (!contractor || !text) return normalizeForPdfkit(text)
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  const AT_SIGN = '__________________________ (to be completed on signing)'
  const map = {
    contractor_full_name:    contractor.full_name || contractor.name || AT_SIGN,
    contractor_address:      contractor.address || AT_SIGN,
    contractor_notice_email: contractor.notice_email || contractor.email || AT_SIGN,
    agreement_date:          contractor.agreement_date || today,
    commencement_date:       contractor.commencement_date || 'as agreed with Tere Health',
    signer_name:             contractor.signer_name || 'Tere Health Limited',
    signer_title:            contractor.signer_title || 'Director',
    fee_per_consult:         contractor.fee_per_consult || '[FEE PER CONSULT — NOT SET]',
    contractor_signed_date:  contractor.contractor_signed_date || AT_SIGN,
    signer_date:             contractor.signer_date || AT_SIGN,
  }
  return normalizeForPdfkit(
    String(text).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m))
  )
}

// Render one contract to a PDF buffer. Callable in-process; not an HTTP
// handler. Returns Promise<Buffer>.
export async function renderContractToPdf({ contract, contractor = {} } = {}) {
  if (!contract || !Array.isArray(contract.nodes)) {
    throw new Error('renderContractToPdf: contract JSON missing or malformed')
  }

  return new Promise((resolve, reject) => {
    // No bufferPages — the previous bufferPages + switchToPage footer
    // loop was creating 15 blank pages at the end because switchToPage
    // + doc.text past the bottom margin was triggering fresh page
    // adds. Draw content only; footer removed.
    const doc = new PDFDocument({ margin: 56, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width
    const M = 56
    const CONTENT_W = W - M * 2

    // Title block — mirrors ContractRenderer's teal border-below-title.
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#6B7280')
      .text('TERE HEALTH LIMITED', M, M, { characterSpacing: 0.6 })
    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0D2B45')
      .text(contract.title || 'Independent Contractor Services Agreement', M, doc.y, { width: CONTENT_W })
    doc.moveDown(0.15)
    doc.font('Helvetica').fontSize(9).fillColor('#6B7280')
      .text(`Version ${contract.version || ''}`, M, doc.y, { width: CONTENT_W })
    // Teal underline
    const rulerY = doc.y + 6
    doc.moveTo(M, rulerY).lineTo(W - M, rulerY).strokeColor('#0B6E76').lineWidth(1.5).stroke()
    doc.y = rulerY + 14

    // Style presets — sizes/colors chosen to look like the browser render
    // when printed to A4. Not pixel-perfect (pdfkit lacks CSS layout) but
    // structurally identical: headings, bulleted items, paragraphs, bolds.
    function renderNode(node) {
      const text = substitute(node.text, contractor) || ''
      if (!text.trim() && node.type !== 'heading') return

      if (node.type === 'heading') {
        const lvl = Number.isFinite(node.level) ? node.level : 3
        // Approx match to ContractRenderer's h0/h1/h2/h3.
        if (lvl === 0) {
          doc.moveDown(0.6)
          doc.font('Helvetica-Bold').fontSize(15).fillColor('#0D2B45')
        } else if (lvl === 1) {
          doc.moveDown(0.8)
          doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#0B6E76')
        } else if (lvl === 2) {
          doc.moveDown(0.5)
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45')
          // uppercase to match the browser's textTransform: uppercase
          doc.text(text.toUpperCase(), M, doc.y, { width: CONTENT_W, characterSpacing: 0.4 })
          doc.moveDown(0.15)
          return
        } else {
          doc.moveDown(0.35)
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0D2B45')
        }
        doc.text(text, M, doc.y, { width: CONTENT_W })
        doc.moveDown(0.15)
        return
      }

      if (node.type === 'item') {
        doc.font(node.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.25).fillColor('#1A2A33')
        // Indented bullet — bullet char at M+12, text starts M+24.
        const startY = doc.y
        doc.text('•', M + 12, startY, { width: 10, continued: false })
        doc.text(text, M + 24, startY, { width: CONTENT_W - 24, align: 'justify' })
        doc.moveDown(0.15)
        return
      }

      // Default: paragraph
      doc.font(node.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor('#1A2A33')
      doc.text(text, M, doc.y, { width: CONTENT_W, align: 'justify' })
      doc.moveDown(0.35)
    }

    for (const node of contract.nodes) {
      try { renderNode(node) }
      catch (e) {
        // A single malformed node shouldn't kill the whole document.
        console.error('[contract-pdf] node render failed, skipping:', e?.message || e, node)
      }
    }

    doc.end()
  })
}
