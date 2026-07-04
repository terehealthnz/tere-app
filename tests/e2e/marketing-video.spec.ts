import { test } from '@playwright/test'

/**
 * Marketing video — hero moments only.
 *
 * Hits production (terehealth.co.nz), records the whole session to webm.
 * Three visible beats:
 *   1. Landing page + Te Reo Māori language selector (with the guidance note)
 *   2. Vitals rPPG scan (page.pause — Patrick does the scan live on camera)
 *   3. Results screen (HR, RR, BP, SpO2) held on-screen so it can be captured
 *
 * Deliberately NO triage flow / provider view — keeps proprietary UX out of the reel.
 *
 * Run:
 *   npx playwright test marketing-video --project=sizzle
 * Then convert:
 *   ffmpeg -i test-results/.../video.webm -c:v libx264 -crf 18 marketing.mp4
 */

const PROD = 'http://localhost:3000'

test('Marketing — hero cuts', async ({ page }) => {
  test.setTimeout(600_000) // 10 min — generous, includes the live scan

  // ── Beat 1: PWA intro + Te Reo language selector ────────────────────────────
  // On localhost, root '/' shows TereIntro directly. In production, use '/start'.
  await page.goto(PROD + '/')
  const teReo = page.locator('button', { hasText: 'Te Reo Māori' }).first()
  await teReo.waitFor({ timeout: 20_000 })
  await page.waitForTimeout(2500) // hold on the selector before the click

  // Click Te Reo Māori — reveals the "some medical terms remain in English" note
  await teReo.click()
  await page.waitForTimeout(3500) // hold the selected state so it's editable

  // ── Beat 2: Jump straight to /vitals ────────────────────────────────────────
  // sessionStorage bypass keeps the recording clean — no triage questions on tape.
  await page.evaluate(() => {
    sessionStorage.setItem('consultationId', 'marketing-' + Date.now())
    sessionStorage.setItem('paymentAmount', '65')
    sessionStorage.setItem('consultationType', 'video')
  })
  const cId = await page.evaluate(() => sessionStorage.getItem('consultationId'))
  await page.goto(`${PROD}/vitals/${cId}`)
  await page.waitForTimeout(3500) // let the model download + camera warm up

  // ── Beat 3: LIVE scan — hand over to Patrick ────────────────────────────────
  console.log('\n📹  Sit in frame — click "I\'m ready", do the 80s scan. When the "Vitals captured" screen shows, hit Resume in Playwright Inspector.\n')
  await page.pause()

  // ── Beat 4: Hold the results screen ─────────────────────────────────────────
  await page.waitForTimeout(5000)
})
