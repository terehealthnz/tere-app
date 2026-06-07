import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test('Patient flow — live recording', async ({ page }) => {
  test.setTimeout(600_000) // 10 minutes — gives you time to fill forms and do the vitals scan

  // ── Home ─────────────────────────────────────────────────────────────────────
  await page.goto('/')
  await expect(page.locator('[data-testid="kiwi-cta"]')).toBeVisible()
  await page.waitForTimeout(2000)

  // ── Consent — automated ──────────────────────────────────────────────────────
  await page.click('[data-testid="kiwi-cta"]')
  await expect(page.locator('text=Before we begin')).toBeVisible()
  await page.waitForTimeout(1200)

  await page.click('[data-testid="hdc-consent-checkbox"]')
  await page.waitForTimeout(600)
  await page.click('[data-testid="prescribing-acknowledge"]')
  await page.waitForTimeout(600)
  await page.click('[data-testid="consent-continue"]')

  // ── Triage — YOU fill this in ────────────────────────────────────────────────
  await expect(page.locator('[data-testid="triage-input"]')).toBeVisible({ timeout: 10_000 })
  // Fill in your symptoms, then click Continue. Playwright will wait.
  await page.pause()

  // ── ConsultationType — YOU pick video/phone/message ───────────────────────────
  await page.pause()

  // ── Payment — YOU enter card details ─────────────────────────────────────────
  // Test card: 4242 4242 4242 4242 · any future expiry · any CVC
  await page.pause()

  // ── Vitals — YOU do the face scan ───────────────────────────────────────────
  // Allow camera when prompted, complete all 4 passes, then Continue
  await page.pause()

  // ── Waiting room ─────────────────────────────────────────────────────────────
  await page.waitForTimeout(3000)

  // ── Save video path for conversion ──────────────────────────────────────────
  const videoPath = await page.video()?.path()
  if (videoPath) {
    const out = path.join(process.cwd(), 'patient-session.webm')
    fs.copyFileSync(videoPath, out)
    console.log(`\n✓ Recording saved: ${out}`)
    console.log(`  Open in Chrome to view, or convert to MP4:`)
    console.log(`  ffmpeg -i patient-session.webm -c:v libx264 patient-session.mp4\n`)
  }
})
