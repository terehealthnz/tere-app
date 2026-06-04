import { test, expect } from '@playwright/test'

test('consent page shows all three sections', async ({ page }) => {
  await page.goto('http://localhost:3000')

  // TereIntro
  await expect(page.locator('[data-testid="kiwi-cta"]')).toBeVisible()
  await page.click('[data-testid="kiwi-cta"]')

  // Single consent page
  await expect(page.locator('text=Before we begin')).toBeVisible()

  // Section 1
  await expect(page.locator('text=Your rights as a patient')).toBeVisible()
  await expect(page.locator('[data-testid="hdc-consent-checkbox"]')).toBeVisible()

  // Section 2
  await expect(page.locator('text=Prescribing limitations').first()).toBeVisible()
  await expect(page.locator('text=Opioid').first()).toBeVisible()
  await expect(page.locator('[data-testid="prescribing-acknowledge"]')).toBeVisible()

  // Section 3 — research optional
  await expect(page.locator('text=Help improve rural healthcare')).toBeVisible()
  await expect(page.locator('[data-testid="research-no"]')).toBeVisible()

  // Continue disabled until both required checkboxes ticked
  await expect(page.locator('[data-testid="consent-continue"]')).toBeDisabled()

  // Tick both required
  await page.click('[data-testid="hdc-consent-checkbox"]')
  await page.click('[data-testid="prescribing-acknowledge"]')

  // Continue now enabled
  await expect(page.locator('[data-testid="consent-continue"]')).toBeEnabled()

  // Skip research and continue
  await page.click('[data-testid="consent-continue"]')

  // Should be on triage
  await expect(page.locator('[data-testid="triage-input"]')).toBeVisible({ timeout: 10000 })
})
