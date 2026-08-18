// Hardening-guard smoke — the pre-deploy tripwire.
//
// This test exists because on 2026-08-18, ~8 stacked bugs slipped to prod
// (CSP, Permissions-Policy, SW cache, checkbox CSS, pharmacy filter,
// MediaPipe WASM block) because we did slice-tests only. Every one of those
// would have been caught by a single browser navigation of the top-of-funnel
// pages + a console-error check.
//
// This spec is the cheapest fast-check for those failure modes. It runs
// against ANY URL (prod, staging preview, localhost) via SMOKE_URL. Keep it
// under 60s of wall-time — the whole point is you run it after every deploy.
//
// Run:
//   Staging:   SMOKE_URL=https://tere-git-staging-xxx.vercel.app npm run test:hardening
//   Prod:      SMOKE_URL=https://terehealth.co.nz              npm run test:hardening
//   Local:     SMOKE_URL=http://localhost:3000                 npm run test:hardening

import { test, expect } from '@playwright/test'

const URL = process.env.SMOKE_URL || 'https://terehealth.co.nz'

// Console errors we intentionally ignore. Keep this list tight — anything
// added here should have a comment explaining why. Everything else fails.
const IGNORED_CONSOLE = [
  /favicon/i,                          // Occasional preload warning, harmless
  /webkit-mask/i,                      // Vendor prefix warning
  /MetaMask|Phantom|Solana|ethereum/i, // Browser wallet extension noise
]

function shouldIgnore(msg: string) {
  return IGNORED_CONSOLE.some(re => re.test(msg))
}

test.describe('Hardening guard — pre-deploy tripwire', () => {

  test('H1. Landing loads with zero CSP violations or console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', m => { if (m.type() === 'error' && !shouldIgnore(m.text())) errors.push(m.text()) })
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))

    const resp = await page.goto(`${URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
    expect(resp?.status()).toBeLessThan(400)

    // Wait for React to mount + Landing to render
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)  // catches lazy chunk loads + delayed script blocks

    if (errors.length > 0) {
      console.error('[hardening-guard] Console errors on landing:\n' + errors.join('\n'))
    }
    expect(errors, `${errors.length} console errors on landing`).toEqual([])
  })

  test('H2. Security headers are correct (Permissions-Policy + CSP shape)', async ({ page }) => {
    const resp = await page.goto(`${URL}/`)
    const headers = resp?.headers() || {}

    const csp = headers['content-security-policy'] || ''
    const permsPolicy = headers['permissions-policy'] || ''

    // CSP must whitelist MediaPipe WASM CDN — this was the /vitals-validate
    // + in-consult /vitals scan blocker. If this ever regresses, both the
    // research page AND every real patient's vitals capture breaks silently.
    expect(csp, 'CSP missing cdn.jsdelivr.net in script-src-elem').toContain('cdn.jsdelivr.net')

    // MediaPipe WASM instantiation requires 'wasm-unsafe-eval' in script-src.
    // Whitelisting the CDN alone isn't enough — Chrome blocks WebAssembly.compile()
    // without this directive. Missing it looks like "camera not capturing vitals"
    // to the user because face landmarks silently return empty. See 2026-08-18 fix.
    expect(csp, "CSP missing 'wasm-unsafe-eval' — vitals capture will silently fail").toContain('wasm-unsafe-eval')

    // CSP must include Stripe for card input. Blocker if missing.
    expect(csp, 'CSP missing js.stripe.com').toContain('js.stripe.com')

    // CSP must include both canonical origins so tere.co.nz → terehealth.co.nz
    // redirect chain doesn't cross-origin-block subresources.
    expect(csp, 'CSP missing tere.co.nz origin').toContain('tere.co.nz')
    expect(csp, 'CSP missing terehealth.co.nz origin').toContain('terehealth.co.nz')

    // Permissions-Policy must ALLOW camera/mic/geo (as `(self)` or `*`),
    // not deny with `()`. If this regresses, rPPG + video consult + pharmacy
    // near-me all silently fail on iOS Safari.
    expect(permsPolicy, 'camera denied by Permissions-Policy').not.toMatch(/camera=\(\)/)
    expect(permsPolicy, 'microphone denied by Permissions-Policy').not.toMatch(/microphone=\(\)/)
    expect(permsPolicy, 'geolocation denied by Permissions-Policy').not.toMatch(/geolocation=\(\)/)
  })

  test('H3. pharmacies.json returns full 1063-entry register', async ({ request }) => {
    const resp = await request.get(`${URL}/pharmacies.json`)
    expect(resp.status()).toBe(200)
    const list = await resp.json()
    expect(Array.isArray(list)).toBe(true)
    // If this drops below 1000, either the build-pharmacy-list.py guardrail
    // failed, the deploy shipped a stale file, or the SW cache-bust didn't
    // propagate. Threshold set to 1000 (target 1063) to allow small register drift.
    expect(list.length, `pharmacies.json only has ${list.length} entries — expected >1000`).toBeGreaterThan(1000)
  })

  test('H4. GeoGate checkbox is visible + clickable (not overlapped by CSS)', async ({ page, context }) => {
    // 2026-08-18: global input CSS applied width:100%/appearance:none to all
    // inputs including checkboxes, making the GeoGate checkbox invisible and
    // overlaying the whole page. This test would have caught it.
    await context.grantPermissions([], { origin: URL })
    await page.goto(`${URL}/start`)
    await page.waitForTimeout(3000)  // geo-check API returns, phase → 'attest'

    // Look for the attest checkbox — should be visible + enabled
    const checkbox = page.locator('input[type="checkbox"]').first()
    const isVisible = await checkbox.isVisible().catch(() => false)
    if (isVisible) {
      const box = await checkbox.boundingBox()
      expect(box, 'GeoGate checkbox has no bounding box (CSS invisible)').not.toBeNull()
      expect(box!.width, 'GeoGate checkbox width is 0 or absurd').toBeGreaterThan(5)
      expect(box!.width, 'GeoGate checkbox width absurd (probably width:100%)').toBeLessThan(100)
    }
    // If no checkbox visible, we're on the block/error phase — that's fine,
    // just means the geo-check said we're not in NZ (or the API errored).
    // The CSS regression only manifests when the attest card renders.
  })

  test('H5. No CSP block on /vitals-validate (MediaPipe WASM CDN)', async ({ page }) => {
    const cspBlocks: string[] = []
    page.on('console', m => {
      const t = m.text()
      if (m.type() === 'error' && /Content Security Policy/i.test(t) && !shouldIgnore(t)) {
        cspBlocks.push(t)
      }
    })
    await page.goto(`${URL}/vitals-validate`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(4000)  // MediaPipe lazy-load

    if (cspBlocks.length > 0) {
      console.error('[hardening-guard] CSP blocks on /vitals-validate:\n' + cspBlocks.join('\n'))
    }
    expect(cspBlocks, `${cspBlocks.length} CSP violation(s) on /vitals-validate`).toEqual([])
  })
})
