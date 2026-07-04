import React from 'react'

// Stylized Tino Rangatiratanga (Māori sovereignty) flag — black/red with white koru.
// Rendered as SVG because Unicode has no emoji for this flag. Small size so it can
// stand in for a flag emoji next to a language label.
export default function MaoriFlagIcon({ width = 24, height = 16 }) {
  return (
    <svg
      width={width} height={height} viewBox="0 0 30 20"
      style={{ display: 'inline-block', borderRadius: 2, verticalAlign: 'middle' }}
      role="img" aria-label="Te Reo Māori — Tino Rangatiratanga"
    >
      {/* Red background */}
      <rect width="30" height="20" fill="#CE1126" />
      {/* Black upper area with curved lower edge suggesting the flag's dividing line */}
      <path d="M 0 0 L 30 0 L 30 8 C 22 11 18 7 13 9 C 8 10.5 4 13 0 15 Z" fill="#000000" />
      {/* White koru curl at the junction */}
      <path
        d="M 6.5 14.5 C 6.5 10 12 8 12.5 12.5 C 12.7 14.5 10.5 14.2 10.2 12.5"
        fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round"
      />
    </svg>
  )
}
