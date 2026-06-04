import { test, expect } from '@playwright/test'

test('entry screens show in correct order', async ({ page }) => {
  await page.goto('http://localhost:3000')

  // Screen 1 — TereIntro
  await expect(page.locator('[data-testid="kiwi-cta"]')).toBeVisible()
  await expect(page.locator('text=He tere, he ora')).toBeVisible()
  await expect(page.locator('text=Tere Health')).toBeVisible()
  await page.click('[data-testid="kiwi-cta"]')

  // Screen 2 — HDC Consent
  await expect(page.locator('text=Your rights as a patient')).toBeVisible()
  await expect(page.locator('text=Code of Rights')).toBeVisible()
  await page.click('[data-testid="hdc-consent-checkbox"]')
  await page.click('[data-testid="hdc-consent-continue"]')

  // Screen 3 — Prescribing limits
  await expect(page.locator('text=cannot prescribe')).toBeVisible()
  await expect(page.locator('text=Opioids')).toBeVisible()
  await expect(page.locator('text=Benzodiazepines')).toBeVisible()
  await expect(page.locator('text=Help improve rural healthcare')).toBeVisible()
  await expect(page.locator('text=Skip')).toBeVisible()
  await page.click('[data-testid="prescribing-acknowledge"]')
  await page.click('text=Skip →')

  // Should now be on triage
  await expect(page.locator('[data-testid="triage-input"]')).toBeVisible()
})
