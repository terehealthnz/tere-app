export function scoreComplaint(complaint, isReturning = false, isAcc = false) {
  // Tele-emergency positioning — the only public product is the live
  // consultation. Async messaging is no longer offered at booking time
  // (existing message consult rows keep working; the endpoint stays for
  // backward compatibility).
  return { allowConsult: true, allowMessage: false }
}

export const RESERVATION_FEE = 15

// Unified pricing — 'consult' replaces the video/phone split (provider picks
// video vs audio inside the call, patient sees "consult"). Historical rows
// with consultation_type='video'/'phone' still resolve to the consult price.
// 'message' is the async product and priced separately.
//
// Must stay in sync with:
//   - src/components/patient/Payment.jsx BASE_PRICES
//   - api/_create-payment-intent.js PRICES (values × 100 for cents)
// The server is the source of truth for what's actually charged. If these
// three drift again, the pre-payment page shows a different number to the
// payment page — bait-and-switch UX and existing pricing-audit item.
export const CONSULT_PRICES = {
  consult: { private: 65, acc: 25 },
  message: { private: 25, acc: 25 },
  // Retained so legacy references (historical consults, admin views) still
  // resolve rather than throwing. New bookings should not use these.
  video:   { private: 65, acc: 25 },
  phone:   { private: 65, acc: 25 },
}

export const CONSULT_TYPE_LABELS = {
  consult: { icon: '📞', label: 'Consult' },
  message: { icon: '💬', label: 'Message' },
  video:   { icon: '📞', label: 'Consult' },
  phone:   { icon: '📞', label: 'Consult' },
}
