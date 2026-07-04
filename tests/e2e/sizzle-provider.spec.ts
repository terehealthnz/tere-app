import { test, expect } from '@playwright/test'

/**
 * Sizzle vignettes — provider side (desktop 1440x900).
 *
 * Run one at a time so you can retake individually:
 *   npx playwright test sizzle-provider --project=sizzle-provider -g "queue"
 *   npx playwright test sizzle-provider --project=sizzle-provider -g "consult"
 *
 * Auth bypass matches demo-walkthrough.spec.ts — Dr Patrick Herling as provider.
 */

async function providerAuth(page) {
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.setItem('clinicianAuth', 'true')
    sessionStorage.setItem('providerIsProvider', 'true')
    sessionStorage.setItem('providerIsAdmin', 'true')
    sessionStorage.setItem('providerId', 'd924ae3b-93e9-4b36-a5ba-e681b85359b5')
    sessionStorage.setItem('providerDisplayName', 'Dr Patrick Herling')
    sessionStorage.setItem('providerColor', '#0B6E76')
  })
}

// ── Vignette E: provider queue view (~10s) ───────────────────────────────────
test('sizzle E — provider queue', async ({ page }) => {
  await providerAuth(page)
  await page.goto('/provider')

  await expect(page.locator('text=Queue').or(page.locator('text=queue')).first())
    .toBeVisible({ timeout: 12000 })
  await page.waitForTimeout(3500) // let the queue render / any incoming animation

  // Small scroll for parallax feel
  await page.mouse.wheel(0, 250)
  await page.waitForTimeout(1200)
  await page.mouse.wheel(0, -250)
  await page.waitForTimeout(2000)
})

// ── Vignette F: provider opens patient + starts consult view (~15s) ──────────
test('sizzle F — provider opens patient', async ({ page }) => {
  test.setTimeout(120_000)
  await providerAuth(page)
  await page.goto('/provider')
  await expect(page.locator('text=Queue').or(page.locator('text=queue')).first())
    .toBeVisible({ timeout: 12000 })
  await page.waitForTimeout(2500)

  // Click the first patient in queue. If none exist, the reel needs a live
  // patient — run sizzle-vignettes A/B first, or seed one manually.
  const firstPatientCard = page.locator('[data-testid^="queue-patient-"], .queue-item, button')
    .filter({ hasText: /waiting|video|phone|message|min ago|just now/i })
    .first()

  if (await firstPatientCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await firstPatientCard.click()
    await page.waitForTimeout(3000)

    // Slow scroll through the patient view — chart, triage summary, vitals card
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(1500)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(1500)
    await page.mouse.wheel(0, -800)
    await page.waitForTimeout(2000)
  } else {
    console.log('\n⚠️  No patient in queue. Run sizzle A/B first or seed one before recording this vignette.\n')
    // Hand over to Patrick so he can navigate manually if needed
    await page.pause()
  }
})
