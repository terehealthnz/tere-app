import { test, expect } from '@playwright/test'

// Helper: set admin session storage and navigate
async function asAdmin(page) {
  await page.goto('/clinician/admin')
  await page.evaluate(() => {
    sessionStorage.setItem('clinicianAuth', 'true')
    sessionStorage.setItem('providerIsAdmin', 'true')
    sessionStorage.setItem('providerId', 'test-id')
    sessionStorage.setItem('providerDisplayName', 'Dr Test Admin')
  })
  await page.goto('/clinician/admin')
}

// ── Patient flow ──────────────────────────────────────────────────────────────

test.describe('Patient flow', () => {

  test('TereIntro → Consent → Triage', async ({ page }) => {
    await page.goto('/')

    // TereIntro shows kiwi CTA
    await expect(page.locator('[data-testid="kiwi-cta"]')).toBeVisible({ timeout: 8000 })
    await page.click('[data-testid="kiwi-cta"]')

    // Consent page — wait longer for Supabase pre_triage insert + navigation
    await expect(page.locator('text=Before we begin')).toBeVisible({ timeout: 15000 })

    // Section 1 — HDC rights
    await expect(page.locator('text=Your rights as a patient')).toBeVisible()
    await expect(page.locator('[data-testid="hdc-consent-checkbox"]')).toBeVisible()

    // Section 2 — Prescribing limits (use .first() — label also contains substring)
    await expect(page.locator('text=Prescribing limitations').first()).toBeVisible()
    await expect(page.locator('text=Opioid').first()).toBeVisible()
    await expect(page.locator('[data-testid="prescribing-acknowledge"]')).toBeVisible()

    // Section 3 — Research (optional)
    await expect(page.locator('text=Help improve rural healthcare')).toBeVisible()
    await expect(page.locator('[data-testid="research-no"]')).toBeVisible()

    // Continue disabled until both required checkboxes ticked
    await expect(page.locator('[data-testid="consent-continue"]')).toBeDisabled()

    await page.click('[data-testid="hdc-consent-checkbox"]')
    await page.click('[data-testid="prescribing-acknowledge"]')
    await expect(page.locator('[data-testid="consent-continue"]')).toBeEnabled()

    await page.click('[data-testid="consent-continue"]')

    // Triage input visible
    await expect(page.locator('[data-testid="triage-input"]')).toBeVisible({ timeout: 12000 })
    await expect(page.locator('text=full name')).toBeVisible({ timeout: 8000 })
  })

  test('Triage: name → DOB → phone (new patient path)', async ({ page }) => {
    await page.goto('/triage')
    const input = page.locator('[data-testid="triage-input"]')
    await expect(input).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=full name')).toBeVisible({ timeout: 8000 })

    await input.fill('E2E Testpatient')
    await page.keyboard.press('Enter')

    await expect(
      page.locator('text=date of birth').or(page.locator('text=Date of birth')).first()
    ).toBeVisible({ timeout: 8000 })
    await input.fill('1 January 2000')
    await page.keyboard.press('Enter')

    // New patient → phone step
    await expect(
      page.locator('text=mobile').or(page.locator('text=phone')).first()
    ).toBeVisible({ timeout: 12000 })
  })

  test('Consent page — research yes path', async ({ page }) => {
    await page.goto('/consent')
    await expect(page.locator('text=Before we begin')).toBeVisible({ timeout: 8000 })

    await page.click('[data-testid="hdc-consent-checkbox"]')
    await page.click('[data-testid="prescribing-acknowledge"]')
    await page.click('[data-testid="research-yes"]')

    await expect(page.locator('[data-testid="consent-continue"]')).toBeEnabled()
    await page.click('[data-testid="consent-continue"]')
    await expect(page.locator('[data-testid="triage-input"]')).toBeVisible({ timeout: 12000 })
  })

  test('Consent page — nav back to home', async ({ page }) => {
    await page.goto('/consent')
    await expect(page.locator('text=Before we begin')).toBeVisible({ timeout: 8000 })
    // Tere logo in nav navigates home
    await page.click('text=Tere', { timeout: 5000 })
    await expect(page).toHaveURL('/')
  })

})

// ── Landing page ──────────────────────────────────────────────────────────────

test.describe('Landing page routing', () => {

  test('TereIntro loads at / on localhost', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="kiwi-cta"]')).toBeVisible({ timeout: 8000 })
  })

  test('Landing page accessible at /landing', async ({ page }) => {
    await page.goto('/landing')
    // Nav bar renders
    await expect(page.locator('nav').first()).toBeVisible({ timeout: 8000 })
    // At least one link on the page
    await expect(page.locator('a[href]').first()).toBeVisible({ timeout: 5000 })
  })

  test('Landing page CTAs point to /triage on localhost', async ({ page }) => {
    await page.goto('/landing')
    await expect(page.locator('nav').first()).toBeVisible({ timeout: 8000 })
    // CTAs use CONSULT_URL = /triage on non-marketing host
    const ctaLinks = page.locator('a[href="/triage"], a[href="https://tere.co.nz"]')
    await expect(ctaLinks.first()).toBeVisible({ timeout: 5000 })
  })

})

// ── Clinician login ───────────────────────────────────────────────────────────

test.describe('Clinician portal', () => {

  test('Login page shows provider selector', async ({ page }) => {
    await page.goto('/clinician')
    // Login page shows either spinner then "Who is signing in?" or "Clinician dashboard" header
    await expect(
      page.locator('text=Who is signing in').or(page.locator('text=Clinician dashboard')).first()
    ).toBeVisible({ timeout: 12000 })
  })

  test('Admin page renders with admin auth', async ({ page }) => {
    await asAdmin(page)
    // Overview tab content visible
    await expect(page.locator('text=Clinic Admin')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=📊 Overview').or(page.locator('text=Providers')).first()).toBeVisible({ timeout: 5000 })
  })

  test('Admin Patients tab shows patient list', async ({ page }) => {
    await asAdmin(page)
    await expect(page.locator('text=Clinic Admin')).toBeVisible({ timeout: 10000 })

    // Click Patients tab using JS (emoji in label can confuse CSS selectors)
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
      const p = btns.find(b => b.textContent.includes('Patients'))
      if (p) p.click()
    })

    // Patient list or count should appear
    await expect(
      page.locator('text=patients').or(page.locator('text=patient records')).first()
    ).toBeVisible({ timeout: 10000 })
  })

})

// ── Provider portal ───────────────────────────────────────────────────────────

test.describe('Provider portal', () => {

  test('/provider redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/provider')
    // Should land on the clinician login page
    await expect(page).toHaveURL(/\/clinician/, { timeout: 5000 })
    await expect(
      page.locator('text=Who is signing in').or(page.locator('text=Clinician dashboard')).first()
    ).toBeVisible({ timeout: 12000 })
  })

  test('Provider app renders queue with auth', async ({ page }) => {
    await page.goto('/clinician')
    await page.evaluate(() => {
      sessionStorage.setItem('clinicianAuth', 'true')
      sessionStorage.setItem('providerIsProvider', 'true')
      sessionStorage.setItem('providerId', 'test-provider-id')
      sessionStorage.setItem('providerDisplayName', 'Dr Test Provider')
    })
    await page.goto('/provider')
    // Provider app should render — shows queue, notes, or menu tab
    await expect(
      page.locator('text=Queue').or(page.locator('text=queue')).or(page.locator('text=Today')).first()
    ).toBeVisible({ timeout: 12000 })
  })

})
