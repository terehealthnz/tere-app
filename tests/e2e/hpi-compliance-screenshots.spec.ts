// tests/e2e/hpi-compliance-screenshots.spec.ts
//
// Captures the 4 HPI-compliance UI screenshots Noel Babu asked for on
// 2026-08-26 (ticket IN-3502). Written to ~/Downloads/ where
// scripts/fill_hpi_compliance_docx.py picks them up and embeds them in
// the resubmission docx.
//
// Runs against prod (terehealth.co.nz) so /api/hpi-search returns real
// HPI registry data.
//
// This suite runs ONLY in --headed mode with page.pause() at each auth
// gate — you drive the browser through login, the script drives the rest.
//
// Run:
//   npx playwright test tests/e2e/hpi-compliance-screenshots.spec.ts --headed
//
// When the Playwright Inspector opens on a pause(), do whatever the script
// prints ("please log in as admin / please navigate to a consult / …"),
// then click ▶ Resume in the Inspector to continue.

import { test, expect, Page } from '@playwright/test'
import path from 'path'
import os from 'os'

const PROD = 'https://terehealth.co.nz'
const OUT = path.join(os.homedir(), 'Downloads')

// Text answers to feed the AI-triage chat, in order, to reach the gp_name
// step. Skips / yes-no handled inline.
const TRIAGE_STEPS: Array<{ kind: 'text' | 'yes' | 'no' | 'skip'; value?: string; note: string }> = [
  { kind: 'text',  value: 'Patrick Test',                                    note: 'greeting (name)' },
  { kind: 'text',  value: '14 March 1986',                                   note: 'dob_lookup' },
  { kind: 'text',  value: '021234567',                                       note: 'phone' },
  { kind: 'text',  value: 'test@terehealth.co.nz',                           note: 'email' },
  { kind: 'text',  value: '41 Adams Lane, Blenheim 7201',                    note: 'address' },
  { kind: 'text',  value: 'Testing HPI GP-search flow for HNZ compliance.',  note: 'complaint' },
  { kind: 'no',                                                               note: 'acc_check' },
  { kind: 'text',  value: 'None',                                            note: 'history' },
  { kind: 'text',  value: 'None',                                            note: 'medications' },
  { kind: 'text',  value: 'None',                                            note: 'allergies' },
  { kind: 'skip',                                                             note: 'nhi' },
]

async function fillTextReply(page: Page, value: string) {
  const input = page.locator('textarea[placeholder="Type your reply…"]')
  await input.waitFor({ state: 'visible', timeout: 15000 })
  await input.fill(value)
  await input.press('Enter')
}

async function clickYesNo(page: Page, yes: boolean) {
  const label = yes ? 'Yes' : 'No'
  await page.locator('button', { hasText: new RegExp(`^\\s*${label}`, 'i') }).first().click()
}

async function clickSkip(page: Page) {
  await page.locator('button', { hasText: /^\s*Skip/i }).first().click()
}

test.describe('HPI compliance screenshots', () => {
  test.setTimeout(600_000)  // 10 min — allows manual login pauses

  test('1. Patient GP picker (fully automated)', async ({ page }) => {
    console.log('\n[Screenshot 1/4] Patient GP picker')

    // ── Consent page — tick both required checkboxes ──────────────────
    await page.goto(`${PROD}/consent`)
    await page.locator('[data-testid="hdc-consent-checkbox"]').click()
    await page.locator('[data-testid="prescribing-acknowledge"]').click()
    // Research is optional — click "no" to satisfy the null → non-null
    // transition without opting in.
    await page.locator('[data-testid="research-no"]').click()
    await page.locator('[data-testid="consent-continue"]').click()

    // ── Triage — walk steps to reach gp_name ──────────────────────────
    await page.waitForURL(/\/triage/, { timeout: 20000 })
    await page.locator('textarea[placeholder="Type your reply…"]').waitFor({ state: 'visible', timeout: 15000 })

    for (const step of TRIAGE_STEPS) {
      console.log(`  → ${step.note}`)
      if (step.kind === 'text') await fillTextReply(page, step.value!)
      else if (step.kind === 'yes') await clickYesNo(page, true)
      else if (step.kind === 'no') await clickYesNo(page, false)
      else if (step.kind === 'skip') await clickSkip(page)
      await page.waitForTimeout(1500)
    }

    // Pharmacy step — free-text input (bypasses picker dropdown).
    console.log('  → pharmacy')
    const pharmacyInput = page.locator('input[placeholder*="Name, suburb"]')
    await pharmacyInput.waitFor({ state: 'visible', timeout: 15000 })
    await pharmacyInput.fill('Unichem Blenheim')
    await pharmacyInput.press('Enter')
    await page.waitForTimeout(1500)

    // gp_name — HPI lookup fires here.
    console.log('  → gp_name → HPI search (type=gp)')
    await fillTextReply(page, 'Herling')

    // Wait for either the gp_confirm bubble (HPI hit) or gp_clinic fallback.
    const confirmed = page.locator('text=/Found .+ at .+ — is that right\\?/i')
    try {
      await confirmed.waitFor({ state: 'visible', timeout: 25000 })
      console.log('  ✓ HPI confirmation bubble visible')
    } catch {
      console.warn('  ! No HPI hit — capturing fallback state (still shows the search fired)')
    }
    await page.waitForTimeout(1200)

    const out = path.join(OUT, 'hpi-screenshot-location-gp.png')
    await page.screenshot({ path: out, fullPage: false })
    console.log(`  ✓ wrote ${out}`)
    expect(true).toBe(true)
  })

  test('2. Admin HPI Practitioner lookup (interactive)', async ({ page, context }) => {
    console.log('\n[Screenshot 2/4] Admin HPI Practitioner lookup')

    await page.goto(`${PROD}/clinician/login`)
    console.log('  ⏸  PAUSED — log in as an admin, then navigate to')
    console.log('       Admin → Team & Careers → Providers')
    console.log('       and open the HPI Practitioner lookup panel.')
    console.log('       Type a real HPI-CPN (e.g. 92ZZRR) so the response shows.')
    console.log('       Then click ▶ Resume in the Playwright Inspector.')
    await page.pause()

    // After you Resume, capture whatever's on screen.
    await page.waitForTimeout(500)
    const out = path.join(OUT, 'hpi-screenshot-practitioner.png')
    await page.screenshot({ path: out, fullPage: false })
    console.log(`  ✓ wrote ${out}`)
    expect(true).toBe(true)
  })

  test('3. Provider pharmacy picker (interactive)', async ({ page }) => {
    console.log('\n[Screenshot 3/4] Provider pharmacy picker (type=PHARM)')

    await page.goto(`${PROD}/clinician/login`)
    console.log('  ⏸  PAUSED — log in as a provider, open ANY consultation,')
    console.log('       open the Prescribe modal, type a pharmacy name in the')
    console.log('       "Search HPI directory…" field so real results show,')
    console.log('       then click ▶ Resume in the Playwright Inspector.')
    await page.pause()

    await page.waitForTimeout(500)
    const out = path.join(OUT, 'hpi-screenshot-location-pharm.png')
    await page.screenshot({ path: out, fullPage: false })
    console.log(`  ✓ wrote ${out}`)
    expect(true).toBe(true)
  })

  test('4. Provider radiology picker (interactive)', async ({ page }) => {
    console.log('\n[Screenshot 4/4] Provider radiology picker (type=RADDX)')

    await page.goto(`${PROD}/clinician/login`)
    console.log('  ⏸  PAUSED — log in as a provider, open ANY consultation,')
    console.log('       open the Referral modal (imaging), type a radiology')
    console.log('       facility name in the "Search radiology providers…"')
    console.log('       field so real results show, then click ▶ Resume.')
    await page.pause()

    await page.waitForTimeout(500)
    const out = path.join(OUT, 'hpi-screenshot-location-raddx.png')
    await page.screenshot({ path: out, fullPage: false })
    console.log(`  ✓ wrote ${out}`)
    expect(true).toBe(true)
  })
})
