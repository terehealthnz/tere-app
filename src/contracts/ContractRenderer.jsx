// Contract renderer — walks the JSON tree produced by scripts/contract-extract
// and substitutes contractor identifiers on the fly. Used by OfferSign to
// display the exact contract the applicant is agreeing to (with their own
// name, address, MCNZ, CPN, ACC ID inline — no "{{contractor_full_name}}"
// placeholders visible).
//
// Contract source lives in src/contracts/v<X>_<Y>.json. New versions are a
// new JSON file + a new entry in getContractByVersion(). Historical offers
// snapshot the version string so signed archives regenerate identically.
//
// Current status: v8.1 is a first-pass extraction from Heather's docx
// (~343 nodes). Structure is best-effort — multi-column header duplicates
// and some Schedule/Appendix formatting still need manual polish.

import React from 'react'

// Static import — small file, always shipped with the client bundle. Adding
// a new version = new .json import + new entry here.
import v81 from './v8_1.json'

const REGISTRY = {
  'v8.1': v81,
}

export function getContractByVersion(version) {
  return REGISTRY[version] || null
}

export function listContractVersions() {
  return Object.keys(REGISTRY).sort()
}

// Substitute {{contractor_full_name}} etc. from the contractor snapshot.
// Unknown placeholders left in place so it's obvious in the render if a
// new field is needed on the contractor object.
function substitute(text, contractor) {
  if (!contractor || !text) return text
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  // Signature-time fields don't have a value at render — show a legally
  // clear "will be dated on signing" placeholder rather than raw `{{}}`.
  const AT_SIGN = '__________________________ (to be completed on signing)'
  const map = {
    contractor_full_name:  contractor.full_name || contractor.name || AT_SIGN,
    contractor_address:    contractor.address   || AT_SIGN,
    contractor_mcnz:       contractor.mcnz      || contractor.mcnz_registration_number || AT_SIGN,
    contractor_cpn:        contractor.cpn       || contractor.hpi_cpn || AT_SIGN,
    contractor_acc_id:     contractor.acc_id    || contractor.acc_provider_number || AT_SIGN,
    contractor_hpi_number: contractor.hpi_number || AT_SIGN,
    contractor_email:      contractor.email     || AT_SIGN,
    contractor_ird:        contractor.ird       || AT_SIGN,
    contractor_notice_email: contractor.notice_email || contractor.email || AT_SIGN,
    contractor_gst_optional: contractor.gst_number ? `GST # ${contractor.gst_number}` : '(GST-registered? Please add GST number when signing.)',
    agreement_date:        contractor.agreement_date || today,
    commencement_date:     contractor.commencement_date || 'as agreed with Tere Health',
    signer_name:           contractor.signer_name || 'Tere Health Limited',
    signer_title:          contractor.signer_title || 'Director',
    // These are the DATE fields on the signature block itself — filled by
    // the signing/countersigning action, not the render.
    contractor_signed_date: AT_SIGN,
    signer_date:            AT_SIGN,
  }
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m))
}

const styles = {
  root: {
    fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif',
    color: '#1A2A33',
    fontSize: '.9rem',
    lineHeight: 1.6,
    maxWidth: 780,
    margin: '0 auto',
    background: 'white',
    padding: '2rem 1.5rem',
  },
  titleBlock: {
    borderBottom: '2px solid #0B6E76',
    paddingBottom: '1rem',
    marginBottom: '1.5rem',
  },
  h0: { fontSize: '1.6rem', fontWeight: 700, color: '#0D2B45', margin: '0 0 .25rem' },
  h1: { fontSize: '1.25rem', fontWeight: 700, color: '#0B6E76', margin: '1.75rem 0 .75rem' },
  h2: { fontSize: '1.05rem', fontWeight: 700, color: '#0D2B45', margin: '1.25rem 0 .5rem', textTransform: 'uppercase', letterSpacing: '.02em' },
  h3: { fontSize: '.95rem', fontWeight: 700, color: '#0D2B45', margin: '1rem 0 .35rem' },
  para: { margin: '.5rem 0', textAlign: 'justify' },
  paraBold: { margin: '.5rem 0', fontWeight: 700, textAlign: 'justify' },
  item: { margin: '.35rem 0 .35rem 1.5rem', textAlign: 'justify' },
  itemBold: { margin: '.35rem 0 .35rem 1.5rem', fontWeight: 700, textAlign: 'justify' },
}

function renderNode(node, idx, contractor) {
  const text = substitute(node.text, contractor)
  if (node.type === 'heading') {
    const style = node.level === 0 ? styles.h0 : node.level === 1 ? styles.h1 : node.level === 2 ? styles.h2 : styles.h3
    const Tag = node.level === 0 ? 'h1' : node.level === 1 ? 'h2' : node.level === 2 ? 'h3' : 'h4'
    return <Tag key={idx} style={style}>{text}</Tag>
  }
  if (node.type === 'item') {
    return <div key={idx} style={node.bold ? styles.itemBold : styles.item}>• {text}</div>
  }
  return <p key={idx} style={node.bold ? styles.paraBold : styles.para}>{text}</p>
}

export default function ContractRenderer({ version, contractor }) {
  const contract = getContractByVersion(version)
  if (!contract) {
    return (
      <div style={{ padding: '1rem', background: '#FEE2E2', color: '#991B1B', borderRadius: 8 }}>
        Contract version <code>{String(version)}</code> not found in the client bundle. This is a code-level issue — a new version needs its JSON added under <code>src/contracts/</code>.
      </div>
    )
  }
  return (
    <div style={styles.root}>
      <div style={styles.titleBlock}>
        <div style={{ fontSize: '.75rem', color: '#6B7280', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Tere Health Limited</div>
        <div style={styles.h0}>{contract.title}</div>
        <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 4 }}>Version {contract.version}</div>
      </div>
      {contract.nodes.map((n, i) => renderNode(n, i, contractor))}
    </div>
  )
}
