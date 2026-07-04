import { test, expect } from '@playwright/test'

/**
 * Sizzle vignettes — patient side.
 *
 * Each test = one short standalone clip for the 60–90s PHO sizzle reel.
 * Videos land in test-results/<test-name>/video.webm.
 *
 * Persona (kept consistent with demo-walkthrough.spec.ts):
 *   Sarah Mitchell, Picton — sore throat + fever for 2 days.
 *
 * Run one vignette at a time so you can retake without redoing others:
 *   npx playwright test sizzle-vignettes --project=sizzle -g "consent"
 *   npx playwright test sizzle-vignettes --project=sizzle -g "triage"
 *   npx playwright test sizzle-vignettes --project=sizzle -g "vitals"
 *   npx playwright test sizzle-vignettes --project=sizzle -g "waiting"
 *
 * Then convert each clip to mp4 for editing:
 *   ffmpeg -i test-results/.../video.webm -c:v libx264 -crf 18 clip.mp4
 */

const PERSONA = {
  name: 'Sarah Mitchell',
  dob: '12 March 1988',
  phone: '021 456 7890',
  email: 'sarah.mitchell@example.com',
  complaint: 'Sore throat and fever for 2 days. Difficulty swallowing.',
  pharmacy: 'Unichem Picton',
}

// ── Vignette A: home → consent tap-through (~10s of usable footage) ──────────
test('sizzle A — consent tap-through', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-testid="kiwi-cta"]')).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1500)
  await page.click('[data-testid="kiwi-cta"]')

  await expect(page.locator('text=Before we begin')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(1200)

  await page.click('[data-testid="hdc-consent-checkbox"]')
  await page.waitForTimeout(600)
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(500)
  await page.click('[data-testid="prescribing-acknowledge"]')
  await page.waitForTimeout(600)
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(500)
  await page.click('[data-testid="research-yes"]')
  await page.waitForTimeout(700)
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(400)
  await page.click('[data-testid="consent-continue"]')

  // Land briefly on triage so cut ends cleanly.
  await expect(page.locator('[data-testid="triage-input"]')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(1500)
})

// ── Vignette B: triage typing (~12s — just enough to show the AI chat feel) ──
test('sizzle B — triage first message', async ({ page }) => {
  // Fast-path through consent so we land on triage quickly.
  await page.goto('/consent')
  await expect(page.locator('text=Before we begin')).toBeVisible({ timeout: 10000 })
  await page.click('[data-testid="hdc-consent-checkbox"]')
  await page.click('[data-testid="prescribing-acknowledge"]')
  await page.click('[data-testid="consent-continue"]')

  const input = page.locator('[data-testid="triage-input"]')
  await expect(input).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(1500)

  // Name — types visibly for camera
  await input.click()
  await page.keyboard.type(PERSONA.name, { delay: 90 })
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')

  // Let the next AI question render, then stop — this is the "AI triage in action" beat
  await page.waitForTimeout(4000)
  await input.click()
  await page.keyboard.type(PERSONA.dob, { delay: 90 })
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(3000)
})

// ── Vignette C: vitals scan (the money shot — HAND OVER TO PATRICK) ──────────
test('sizzle C — vitals scan (live camera)', async ({ page }) => {
  test.setTimeout(300_000) // 5 min — gives you time to do the scan on camera

  // Jump straight to /vitals with fake session state so we skip triage/payment.
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.setItem('consultationId', 'sizzle-' + Date.now())
    sessionStorage.setItem('paymentAmount', '65')
    sessionStorage.setItem('consultationType', 'video')
  })
  const cId = await page.evaluate(() => sessionStorage.getItem('consultationId'))
  await page.goto(`/vitals/${cId}`)
  await page.waitForTimeout(2000)

  // Playwright pauses here — Chrome DevTools opens with a "Resume" button.
  // While paused: do the rPPG face scan on camera. Hit Resume when done.
  console.log('\n📹  Do the vitals scan on camera now. Press Resume in Playwright Inspector when done.\n')
  await page.pause()

  // A short beat after resume so the "vitals complete" screen is captured.
  await page.waitForTimeout(2500)
})

// ── Vignette D: waiting → connecting animation (~8s) ─────────────────────────
test('sizzle D — waiting room + connecting', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.setItem('consultationId', 'sizzle-' + Date.now())
    sessionStorage.setItem('consultationType', 'video')
  })
  const cId = await page.evaluate(() => sessionStorage.getItem('consultationId'))
  await page.goto(`/waiting/${cId}`)
  await page.waitForTimeout(6000) // let the waiting animation run
  await page.mouse.wheel(0, 150)
  await page.waitForTimeout(1500)
  await page.mouse.wheel(0, -150)
  await page.waitForTimeout(2000)
})
