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
export const CONSULT_PRICES = {
  consult: { private: 60, acc: 0 },
  message: { private: 25 },
  // Retained so legacy references (historical consults, admin views) still
  // resolve rather than throwing. New bookings should not use these.
  video:   { private: 60, acc: 0 },
  phone:   { private: 60, acc: 0 },
}

export const CONSULT_TYPE_LABELS = {
  consult: { icon: '📞', label: 'Consult' },
  message: { icon: '💬', label: 'Message' },
  video:   { icon: '📞', label: 'Consult' },
  phone:   { icon: '📞', label: 'Consult' },
}
