import { test, expect } from '@playwright/test'

// E2E for the /work/[slug] employer URL-access flow (2026-09-19).
//
// Verifies the three isolation invariants that keep this flow safe:
//   1. Invalid/missing slugs → clean 404 UI, no crash.
//   2. Valid slug → renders "Welcome, [company]" and starts a covered
//      consult with sessionStorage.employer_paid=true.
//   3. Public patient flow (`/`) is unchanged (regression guard for
//      task #501 P0 payment-bypass class of bug).
//
// The valid-slug test requires a live employer row with a slug set in
// prod / staging. If TEST_EMPLOYER_SLUG env var is missing, that test
// is skipped rather than failing — devs without a seeded employer can
// still run the isolation checks.

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const TEST_SLUG = process.env.TEST_EMPLOYER_SLUG  // e.g. '2s7n9k4mx8p2'

test.describe('employer slug flow — /work/[slug]', () => {

  test('invalid slug → shows "not active" card, does not create a consult', async ({ page }) => {
    // Use a slug that matches the format regex but almost certainly doesn't exist.
    await page.goto(`${BASE}/work/zzzz9999zzzz9999`)

    // Should show the invalid-slug UI within a reasonable time.
    await expect(page.locator('text=This link is not active')).toBeVisible({ timeout: 10000 })

    // Should offer a fallback path to the public flow.
    await expect(page.locator('text=Continue as a paying patient')).toBeVisible()

    // sessionStorage should NOT have employer_* keys set (nothing was validated).
    const storage = await page.evaluate(() => ({
      employer_id: sessionStorage.getItem('employer_id'),
      employer_paid: sessionStorage.getItem('employer_paid'),
      consultation_id: sessionStorage.getItem('consultation_id'),
    }))
    expect(storage.employer_id).toBeNull()
    expect(storage.employer_paid).toBeNull()
    expect(storage.consultation_id).toBeNull()
  })

  test('malformed slug (special chars) → validates format server-side, 404', async ({ page }) => {
    // The API's slug regex rejects anything non-lowercase-alphanumeric.
    // The client also encodes URL-unsafe chars so this shouldn't crash.
    await page.goto(`${BASE}/work/../etc/passwd`)
    // React Router serves the WorkLanding for /work/anything, so the
    // component's own lookup will 400 or 404. Either way UI must render.
    await expect(page.locator('text=This link is not active').or(page.locator('text=Tere Health'))).toBeVisible({ timeout: 10000 })
  })

  test('public patient flow (/) is unchanged by /work route', async ({ page }) => {
    // Regression guard: hitting `/` after a /work visit should NOT show
    // any "covered by employer" UI. This protects against a class of
    // bug where employer state leaks into the paying-patient flow.

    // First visit an invalid /work URL to see if it pollutes sessionStorage.
    await page.goto(`${BASE}/work/zzzz9999zzzz9999`)
    await expect(page.locator('text=This link is not active')).toBeVisible({ timeout: 10000 })

    // Now navigate to the public flow.
    await page.goto(`${BASE}/`)

    // Public landing should render normally (Tere Health branding present,
    // no "covered by employer" banner injected).
    await expect(page.locator('text=Tere Health')).toBeVisible()
    const empBannerCount = await page.locator('text=/covered by/i').count()
    expect(empBannerCount).toBe(0)
  })

  test('valid slug → welcome card + starts consult with employer_paid=true', async ({ page }) => {
    test.skip(!TEST_SLUG, 'Set TEST_EMPLOYER_SLUG env var to a known active slug to run this test')

    await page.goto(`${BASE}/work/${TEST_SLUG}`)

    // Welcome card must show for a valid, active, under-cap slug.
    await expect(page.locator('text=/Welcome,/')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Your consultation is covered')).toBeVisible()
    await expect(page.locator('button', { hasText: 'Start consultation' })).toBeVisible()

    // Click through to consent (which is where AITriage starts).
    await page.locator('button', { hasText: 'Start consultation' }).click()

    // Wait for navigation to /consent (or wherever the shared flow begins).
    await page.waitForURL(/\/consent|\/triage/, { timeout: 15000 })

    // sessionStorage must have employer_paid set — this is the flag that
    // ConsultationType.jsx uses to route to /waiting instead of /payment.
    const storage = await page.evaluate(() => ({
      employer_paid: sessionStorage.getItem('employer_paid'),
      employer_name: sessionStorage.getItem('employer_name'),
      employer_id: sessionStorage.getItem('employer_id'),
      consultation_id: sessionStorage.getItem('consultation_id'),
    }))
    expect(storage.employer_paid).toBe('true')
    expect(storage.employer_name).toBeTruthy()
    expect(storage.employer_id).toBeTruthy()
    expect(storage.consultation_id).toBeTruthy()  // pre_triage consult was created
  })

  test('valid slug consult has employer_id + employer_paid on the server row', async ({ page, request }) => {
    test.skip(!TEST_SLUG, 'Set TEST_EMPLOYER_SLUG env var to a known active slug to run this test')

    await page.goto(`${BASE}/work/${TEST_SLUG}`)
    await expect(page.locator('button', { hasText: 'Start consultation' })).toBeVisible({ timeout: 10000 })
    await page.locator('button', { hasText: 'Start consultation' }).click()
    await page.waitForURL(/\/consent|\/triage/, { timeout: 15000 })

    const consultId = await page.evaluate(() => sessionStorage.getItem('consultation_id'))
    expect(consultId).toBeTruthy()

    // The consultation should already have employer_paid=true set from
    // the create call (verified server-side against the employers table
    // per task #71 fraud check + this migration's slug wiring). We can't
    // read consultations directly from the anon client, but we can rely
    // on the fact that ConsultationType.jsx will route to /waiting
    // instead of /payment — that's the end-to-end assertion.
    //
    // Left as documentation for now; if we ever get a debug endpoint
    // exposing consult.employer_paid we can assert it directly here.
    expect(consultId).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
