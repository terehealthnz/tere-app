# BYOD (Bring Your Own Device) Policy

**Version:** v1.0 · **Date:** 3 September 2026 · **Owner:** Patrick Herling
**Applies to:** every provider, admin, contractor, and staff member who accesses Tere Health data on a personally-owned device.

---

## 1. Scope

Tere does not (yet) issue corporate devices. Everyone uses their own laptop / phone / tablet to access Tere. This policy sets minimum security baselines for those devices.

## 2. Minimum device requirements

Before accessing any Tere surface (provider app, admin, HL7 tools, database), a device must have:

- **Full-disk encryption** enabled
  - macOS: FileVault ON
  - Windows: BitLocker ON (Pro/Enterprise) or Device Encryption (Home)
  - iOS: automatic when passcode is set
  - Android: enable in Settings → Security → Encryption
  - Linux: LUKS on root partition
- **Screen lock** ≤ 5 minutes inactivity
- **Strong device passcode / biometrics** — no 4-digit trivial passcodes
- **OS + browser fully patched** — install security updates within 14 days of release
- **Reputable antivirus / built-in security enabled** (macOS XProtect; Windows Defender; etc.)
- **No jailbreak / no root** (mobile)
- **Not shared with family or other users** for PHI access — Tere access happens in your own OS user account, not a shared one

## 3. Attestation

At provider onboarding + annually at the PHI training attestation, provider ticks:

> "I confirm the device(s) I use to access Tere Health data meet Tere's BYOD requirements: full-disk encryption enabled, screen lock ≤ 5 min, device up to date, not jailbroken, not shared for Tere access."

Refusal to attest = no PHI access.

## 4. Access from public / shared devices

- Do NOT access Tere from internet cafés, hotel business centres, or shared computers.
- If you must access from a device that isn't your primary, use Incognito/Private mode and log out completely afterwards.

## 5. Loss or theft of a device

- Notify Patrick within 1 hour of realising the device is lost or stolen.
- Change Tere PIN + revoke MFA on the affected account immediately from a different device.
- Patrick will trigger a session invalidation + credential rotation for that account.
- Local remote-wipe (Find My iPhone, Find My Device, etc.) should be initiated if enabled.

## 6. Departure from Tere

- On leaving, all Tere data cached locally must be deleted. This includes:
  - Downloaded PDF reports (ACC bundles, patient records, prescriptions)
  - Signed-in browser sessions (log out)
  - Any local screenshots
- Patrick verifies via a departure checklist.

## 7. Network hygiene

- Prefer trusted networks (home, mobile hotspot, known office).
- Public WiFi acceptable ONLY if using HTTPS (Tere is HTTPS-only). Avoid on unknown networks if a mobile hotspot is available.
- No VPN required (Tere uses TLS + additional auth) but not discouraged.

## 8. Data on device

- Downloads live in the device Downloads folder; users are responsible for cleaning them up.
- Do not sync Tere-related PDFs to personal cloud drives (Dropbox, Google Drive personal, iCloud) unless the cloud service is also encrypted at rest and access-controlled.
- No printing patient information at home printers unless immediately shredded.

## 9. What we monitor

- IP addresses, user agent, and geo of every login (`audit_logs.ip`, `.user_agent`) — used for anomaly detection.
- New IPs trigger a critical security alert (task #359).
- We do NOT monitor personal device contents.

## 10. Corporate device path (future)

When Tere issues corporate laptops (target: 2028+), this policy will be augmented with MDM enforcement + endpoint detection. Until then, self-attestation applies.

## 11. Non-compliance

- Missing baseline (e.g. no FileVault) → provider is asked to enable and re-attest within 48 hours.
- Refusal or repeat non-compliance → access revoked until resolved.
- Wilful non-compliance leading to breach → dismissal + insurance implications.

## 12. Review

- Reviewed annually.
- Amended after any incident involving a personal device.

## Change log

- 2026-09-03 — v1.0 initial policy.
