// tests/e2e/nhi-compliance-screenshots.spec.ts
//
// Walks the Admin NHI Lookup panel through every HNZ compliance scenario and
// writes a fresh admin-UI capture per test NHI to ~/Downloads/nhi-shots/
// using the exact filenames scripts/fill_nhi_compliance_docx.py expects.
//
// Trigger: HNZ reviewer Noel Babu (IN-3589, 2026-10-26) asked for clinician-
// view screenshots of all GET-1..GET-10, a UI render of Match-3 (not JSON),
// and the admin mirror of the drift banner.
//
// Run (requires manual admin login + MFA at the first pause gate):
//   npx playwright test tests/e2e/nhi-compliance-screenshots.spec.ts --headed
//
// PREREQUISITE for NHI-GET-8 drift banner: seed a stored-patient row with
// NHI=ZCX7065 and intentionally different demographics BEFORE running:
//   INSERT INTO patients (nhi, first_name, last_name, dob, address,
//     created_at, updated_at)
//   VALUES ('ZCX7065', 'DifferentFirst', 'OverriddenSurname', '1900-01-01',
//     '99 Wrong Street, Wrongville 0000', NOW(), NOW());
// After capture is complete, delete it:
//   DELETE FROM patients WHERE nhi = 'ZCX7065' AND first_name = 'DifferentFirst';

import { test, expect, Page } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

const PROD = 'https://terehealth.co.nz'
const OUT  = path.join(os.homedir(), 'Downloads', 'nhi-shots')

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

interface Scenario {
  // Button-text prefix (anchored at start). Regex metacharacters escaped at
  // match time; the middle-dot that follows the scenario id (e.g. 'NHI-GET-1 ·')
  // is sufficient to disambiguate from similarly-prefixed labels.
  button: string
  // Output basename. Matches the SCREENSHOT_PATHS dict in fill_nhi_compliance_docx.py.
  file: string
  // Optional distinctive substring to wait for post-click before screenshot
  // (deceased banner, dormant notice, etc). Not required for every scenario.
  waitFor?: string
  note: string
}

const SCENARIOS: Scenario[] = [
  { button: 'NHI-GET-1 ·',       file: '01-nhi-get-1.png',         note: 'GET-1 ZJS7596 positive' },
  { button: 'NHI-GET-2 ·',       file: '02-nhi-get-2.png',         waitFor: 'DECEASED',  note: 'GET-2 ZAT2348 deceased' },
  { button: 'NHI-GET-3 ·',       file: '14-nhi-get-3.png',         note: 'GET-3 ZAT2364 full positive' },
  { button: 'NHI-GET-4 ·',       file: '03-nhi-get-4.png',         note: 'GET-4 ZAT2496 partial DOB' },
  { button: 'NHI-GET-5 ·',       file: '04-nhi-get-5.png',         waitFor: 'Dormant',   note: 'GET-5 ZAT2518 dormant redirect' },
  { button: 'NHI-GET-6 ·',       file: '15-nhi-get-6.png',         note: 'GET-6 ZBE4905 max-length names (name-wrap fix)' },
  { button: 'NHI-GET-7 ·',       file: '16-nhi-get-7.png',         note: 'GET-7 ZUA48EH new 7-char format' },
  { button: 'NHI-GET-8 ·',       file: '17-nhi-get-8.png',         note: 'GET-8 ZCX7065 drift banner (SEED REQUIRED)' },
  { button: 'NHI-GET-9 ·',       file: '18-nhi-get-9.png',         note: 'GET-9 ZJM9567 postal address split' },
  { button: 'NHI-GET-10a ·',     file: '19-nhi-get-10a.png',       note: 'GET-10a ZAU8023 surname only' },
  { button: 'NHI-GET-10b ·',     file: '20-nhi-get-10b.png',       note: 'GET-10b ZAV8657 surname only' },
  { button: 'NHI-GET-10c ·',     file: '21-nhi-get-10c.png',       note: 'GET-10c ZHS7524 multi given names' },
  { button: 'NHI-GET-Neg ·',     file: '05-nhi-get-negative.png',  note: 'GET-Neg ZAA0044 404' },
  { button: 'NHI-GET-Mal ·',     file: '06-nhi-get-malformed.png', note: 'GET-Mal malformed' },
  { button: 'NHI-Match-1 ·',     file: '07-nhi-match-1.png',       note: 'Match-1 Noah Owen (with address)' },
  { button: 'NHI-Match-2 ·',     file: '22-nhi-match-2.png',       note: 'Match-2 Summer MacKenzie (HNZ 422)' },
  { button: 'NHI-Match-3 ·',     file: '23-nhi-match-3.png',       note: 'Match-3 Compliance Thebook (9 results, descending)' },
  { button: 'NHI-Match-Err-1 ·', file: '08-nhi-match-err-1.png',   note: 'Match-Err-1 missing DOB' },
  { button: 'NHI-Match-Err-2 ·', file: '09-nhi-match-err-2.png',   note: 'Match-Err-2 missing name' },
  { button: 'NHI-Validate-1 ·',  file: '10-nhi-validate-1.png',    note: 'Validate-1 Jamie Maraka' },
  { button: 'NHI-Validate-3 ·',  file: '11-nhi-validate-3.png',    note: 'Validate-3 Jaime Jones (negative)' },
  { button: 'NHI-Extra-1 ·',     file: '12-nhi-extra-1.png',       note: 'Extra-1 ZXE24NV new-format' },
]

// Escape regex metacharacters in the button-prefix string so a trailing
// hyphen in e.g. 'NHI-GET-1' doesn't blow up the RegExp constructor.
function anchorRegex(prefix: string): RegExp {
  const esc = prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  return new RegExp('^\\s*' + esc)
}

test.describe('NHI compliance screenshot capture', () => {
  test.setTimeout(900_000) // 15 min total; 22 scenarios * ~15s each + login

  test('capture all NHI scenarios', async ({ page }) => {
    console.log('\n[NHI compliance] Open prod and sign in as admin')
    await page.goto(`${PROD}/clinician/login`)

    console.log('  ⏸  PAUSED - log in as an admin (email + PIN + MFA), then')
    console.log('       navigate to the Admin area and click the "🩺 NHI Lookup" tab.')
    console.log('       You should see the NHI Patient Lookup panel with the row')
    console.log('       of scenario buttons. Then click ▶ Resume in the Playwright')
    console.log('       Inspector.')
    console.log('')
    console.log('       NOTE: For NHI-GET-8 to show the admin drift banner, you must')
    console.log('       first run the seed SQL in Supabase (ZCX7065 with intentionally')
    console.log('       different stored demographics). See spec header for the exact')
    console.log('       INSERT statement.')
    await page.pause()

    // Verify we actually landed on the NHI panel before iterating.
    await page.locator('text=NHI Patient Lookup').first().waitFor({ state: 'visible', timeout: 20000 })

    for (const sc of SCENARIOS) {
      console.log(`\n  → ${sc.note}`)
      const btn = page.locator('button', { hasText: anchorRegex(sc.button) }).first()
      await btn.scrollIntoViewIfNeeded()
      await btn.click()

      // "Input received by the application" is a stable footer that renders in
      // every result-card variant (Patient card, Bundle, OperationOutcome). Wait
      // for it so we know the result finished rendering before screenshotting.
      await page.locator('text=Input received by the application').first().waitFor({ state: 'visible', timeout: 30000 })
      // Settle any async re-renders (drift lookup for GET-8, Bundle sort for Match-3).
      await page.waitForTimeout(1500)
      if (sc.waitFor) {
        try { await page.locator(`text=${sc.waitFor}`).first().waitFor({ state: 'visible', timeout: 5000 }) } catch { /* non-fatal */ }
      }

      // Full-page capture so Noel sees scenario-buttons + banner (if any) +
      // Patient card / Bundle + input echo in one shot. Match-3 will be tall
      // (~5000px for 9 results) but Word scales the embed with the
      // fill-script's width cap.
      const out = path.join(OUT, sc.file)
      await page.screenshot({ path: out, fullPage: true })
      console.log(`    ✓ ${out}`)

      // Scroll back to the top so the next scenario button is visible.
      await page.evaluate(() => window.scrollTo(0, 0))
    }

    console.log('\n[NHI compliance] All scenarios captured → ~/Downloads/nhi-shots/')
    console.log('    Next: run scripts/fill_nhi_compliance_docx.py to regenerate the docx.')
    expect(true).toBe(true)
  })
})
