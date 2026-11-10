// tests/e2e/hpi-compliance-screenshots-round2.spec.ts
//
// IN-3502 round 2 (Noel Babu feedback 2026-11-09). Captures every test CPN
// and HPI-FAC-ID Noel listed per row, each screenshot named after the input
// value so the fill script can map row → image unambiguously.
//
// Noel's legibility note (2026-11-09):
//   "Please capture just the relevant part of the screen at full
//    resolution, so the input value and every displayed field can be read
//    without zooming."
// So we:
//   - Use a wide viewport (1600×1200) + deviceScaleFactor=2 so text stays
//     sharp when embedded in the docx at ~page width.
//   - Prefer a tight bounding-box screenshot of (input + result card) via
//     a parent-panel locator, not the full scrolled page. Full-page
//     fallback only if the panel locator fails.
//
// Run:
//   npx playwright test tests/e2e/hpi-compliance-screenshots-round2.spec.ts --headed
//
// On the auth pause, log in + navigate to Admin → HPI Lookup, then click
// ▶ Resume in the Playwright Inspector.
//
// Output lands in ~/Downloads/ named:
//   hpi-r2-practitioner-<ROW>-<CPN>.png
//   hpi-r2-facility-<ROW>-<FACID>.png
//   hpi-r2-search-<query>-nameonly.png

import { test, expect, Page, Locator } from '@playwright/test'
import path from 'path'
import os from 'os'

const PROD = 'https://terehealth.co.nz'
const OUT = path.join(os.homedir(), 'Downloads')

// Crisp text at docx embed size. The viewport is sized so the practitioner
// card renders single-column + readable; deviceScaleFactor=3 yields a 3×
// native-pixel PNG so Word can embed at ~page width without pixel scaling.
test.use({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 3,
})

// CPN lists mapped to Noel's row numbers. Keep in sync with the fill
// script row mapping (scripts/fill_hpi_compliance_docx.py).
const PRACTITIONER_CPNS: Record<string, string[]> = {
  'Get-1_dormant_redirect':        ['98ZZNY', '90ZZJF'],
  'Get-2':                          ['91ZZWJ', '90ZZLC'],
  // Keep 91ZZWJ (the one originally captured) + add Noel's new asks:
  //   91ZZVR — given name only (kept as family name)
  //   93ZZWU — official + usual names
  'Get-3_name_variants':             ['91ZZWJ', '91ZZVR', '93ZZWU'],
  'Get-4_multi_registration':       ['95ZZEJ', '95ZZQE', '98ZZQJ', '95ZZDR', '95ZZDE'],
  'Get-5_scope_of_practice':        ['90ZZJF', '98ZZNM', '98ZZNY'],
  'Get-6':                          ['90ZZLP'],
  'Get-7_registration_status':      ['98ZZYU', '98ZZYH', '98ZZXQ', '98ZZXD'],
  'Get-8_educational_quals':        ['97ZZYP', '94ZZXF', '97ZZYC', '94ZZWZ', '97ZZXW'],
  'Get-10_expired_apc':             ['90ZZSR', '90ZZMG', '91ZZWJ', '99ZZRT'],
  'Get-11_confidentiality_R':       ['93ZZRW', '96ZZSG', '98ZZWL'],
  'Get-12_deceased':                ['90ZZLP', '90ZZMG', '92ZZSJ', '92ZZRR', '99ZZRT'],
}

const FACILITY_IDS: Record<string, string[]> = {
  'L-Get-1_dormant_redirect':       ['FZZ997-J'],
  'L-Get-2_inactive':               ['FZZ754-E', 'FZZ753-C'],
  'L-Get-3_multi_contact':          ['FZZ968-B'],
  'L-Get-4_contact_rank':           ['FZZ065-D'],
  'L-Get-5_address_formats':        ['FZZ961-K', 'FZZ960-H', 'FZZ959-A', 'FZZ958-K'],
}

const SEARCH_NAME_ONLY: Array<{ family: string; file: string }> = [
  { family: "O'Reilly",   file: 'hpi-r2-search-oreilly-nameonly.png' },
  { family: 'Hunnicutt',  file: 'hpi-r2-search-hunnicutt-nameonly.png' },
]

// HPI-P-Search-3 evidence — surname + DOB narrows the result set. Uses
// HNZ UAT test personas. Evidences the "implemented when admin enters
// DOB" answer that replaces our old "not implemented" row text.
const SEARCH_WITH_DOB: Array<{ family: string; dob: string; file: string }> = [
  { family: "O'Reilly",   dob: '1952-01-14', file: 'hpi-r2-search-oreilly-withdob.png' },
  { family: 'Hunnicutt',  dob: '1945-06-01', file: 'hpi-r2-search-hunnicutt-withdob.png' },
]

// Proof that facility search has been stripped from the three prod
// surfaces Noel flagged. Patient GP clinic picker is free-text only,
// provider pharmacy picker only sources from the local pharmacies.json
// list, provider radiology picker is a plain text input. Each shot
// captures the surface after the picker loads — no HPI call fires.
interface StrippedSurface {
  file: string
  prompt: string
}
const STRIPPED_SURFACES: StrippedSurface[] = [
  {
    file: 'hpi-r2-stripped-patient-gp-clinic.png',
    prompt: 'Open an incognito window → walk a test patient through triage up to the "What is the name of their clinic or practice?" step. The free-text input visible here is the whole UI — no HPI call. Then click ▶ Resume.',
  },
  {
    file: 'hpi-r2-stripped-provider-pharmacy.png',
    prompt: 'Log in as provider → open a consult → open Prescribe modal → click to change pharmacy. The visible picker lists results from the local pharmacies.json register only (no "Search HPI directory" row). Then click ▶ Resume.',
  },
  {
    file: 'hpi-r2-stripped-provider-radiology.png',
    prompt: 'From the same consult → open the Imaging / Radiology referral modal. The "Radiology facility" field is now a plain text input (no HPI dropdown). Then click ▶ Resume.',
  },
]

// Screenshot a tight crop of the relevant admin HPI panel (input + result
// card). Falls back to full page if the panel can't be located. The panel
// wrapper is identified by scoping from the heading text to its nearest
// enclosing block. All PNG, 3× native resolution.
async function captureTightCrop(page: Page, panelHeading: string, out: string) {
  // Make sure any in-flight API call + font paint have settled before we
  // take the picture — avoids spinner artefacts and FOIT.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})

  // Find the heading first (visible result-block always sits beneath it).
  const headingLoc = page.locator(`text=${panelHeading}`).first()
  // The practitioner / facility card + its banners live as siblings of
  // the panel heading inside a padded white container. Walk up to that.
  const panel: Locator = headingLoc.locator(
    'xpath=ancestor::div[contains(@style, "padding")][1]'
  )
  try {
    await panel.waitFor({ state: 'visible', timeout: 10000 })
    await panel.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    const box = await panel.boundingBox()
    if (box && box.width > 200 && box.height > 100) {
      // Pad so any dormant/confidentiality/expired banners above the panel
      // stay visible, and the bottom edge doesn't crop the raw-JSON link.
      const PAD_TOP = 60
      const PAD_BOTTOM = 20
      const PAD_X = 8
      await page.screenshot({
        path: out,
        type: 'png',
        clip: {
          x: Math.max(0, box.x - PAD_X),
          y: Math.max(0, box.y - PAD_TOP),
          width:  Math.min(1600, box.width + PAD_X * 2),
          height: Math.min(3000, box.height + PAD_TOP + PAD_BOTTOM),
        },
      })
      return
    }
  } catch {
    // fall through to full-page
  }
  await page.screenshot({ path: out, fullPage: true, type: 'png' })
}

async function lookupCpn(page: Page, cpn: string) {
  const input = page.locator('input[placeholder*="99ZZRT"]').first()
  await input.waitFor({ state: 'visible', timeout: 15000 })
  await input.fill('')
  await input.type(cpn)
  // First "Get" button on the panel (practitioner).
  await page.locator('button', { hasText: /^\s*Get\s*$/ }).first().click()
  // Allow HPI round-trip + card paint.
  try {
    await Promise.race([
      page.locator('text=HPI Practitioner resource').first().waitFor({ state: 'visible', timeout: 25000 }),
      page.locator('text=No practitioner found').first().waitFor({ state: 'visible', timeout: 25000 }),
    ])
  } catch {
    // Still screenshot whatever rendered.
  }
  await page.waitForTimeout(1500)
}

async function lookupFacility(page: Page, hpi: string) {
  const input = page.locator('input[placeholder*="FZZ997-J"]').first()
  await input.waitFor({ state: 'visible', timeout: 15000 })
  await input.fill('')
  await input.type(hpi)
  // The Get button directly next to the facility input.
  await input.locator('xpath=following-sibling::button').first().click()
  try {
    await Promise.race([
      page.locator('text=HPI Location resource').first().waitFor({ state: 'visible', timeout: 25000 }),
      page.locator('text=Dormant facility').first().waitFor({ state: 'visible', timeout: 25000 }),
      page.locator('text=Requested facility ID is dormant').first().waitFor({ state: 'visible', timeout: 25000 }),
    ])
  } catch {
    // fall through — screenshot current state
  }
  await page.waitForTimeout(1500)
}

async function searchByFamilyOnly(page: Page, family: string) {
  const familyInput = page.locator('input[placeholder*="O\'Reilly"]').first()
  await familyInput.waitFor({ state: 'visible', timeout: 15000 })
  await familyInput.fill('')
  await familyInput.type(family)
  // Deliberately leave DOB blank — proves HPI accepts name-only (Noel's point).
  const dobInput = page.locator('input[placeholder*="YYYY-MM-DD"]').first()
  if (await dobInput.isVisible()) await dobInput.fill('')
  await page.locator('button', { hasText: /^\s*Search\s*$/ }).first().click()
  try {
    await page.locator('text=/matched via|Search results|No practitioner found/i').first().waitFor({ state: 'visible', timeout: 25000 })
  } catch {
    // fall through
  }
  await page.waitForTimeout(1500)
}

async function searchByFamilyAndDob(page: Page, family: string, dob: string) {
  const familyInput = page.locator('input[placeholder*="O\'Reilly"]').first()
  await familyInput.waitFor({ state: 'visible', timeout: 15000 })
  await familyInput.fill('')
  await familyInput.type(family)
  const dobInput = page.locator('input[placeholder*="YYYY-MM-DD"]').first()
  await dobInput.waitFor({ state: 'visible', timeout: 15000 })
  await dobInput.fill('')
  await dobInput.type(dob)
  await page.locator('button', { hasText: /^\s*Search\s*$/ }).first().click()
  try {
    await page.locator('text=/matched via|Search results|No practitioner found/i').first().waitFor({ state: 'visible', timeout: 25000 })
  } catch {
    // fall through
  }
  await page.waitForTimeout(1500)
}

test.describe('IN-3502 round 2 — admin HPI Lookup screenshots', () => {
  test.setTimeout(900_000)  // 15 min — comprehensive run with manual login

  test('All practitioner CPNs + facility IDs + name-only searches', async ({ page }) => {
    console.log('\n[Round 2] Admin HPI Lookup captures')

    await page.goto(`${PROD}/clinician/login`)
    console.log('  ⏸  PAUSED — log in as admin + MFA, then open Admin → HPI Lookup.')
    console.log('       You should see "HPI Practitioner Lookup" + "HPI Facility Lookup"')
    console.log('       panels. Then click ▶ Resume in the Playwright Inspector.')
    await page.pause()

    await page.locator('text=HPI Practitioner Lookup').first().waitFor({ state: 'visible', timeout: 30000 })
    await page.locator('text=HPI Facility Lookup').first().waitFor({ state: 'visible', timeout: 30000 })

    // ── Practitioner CPNs ────────────────────────────────────────────────
    for (const [row, cpns] of Object.entries(PRACTITIONER_CPNS)) {
      for (const cpn of cpns) {
        console.log(`\n  → ${row} · ${cpn}`)
        await lookupCpn(page, cpn)
        const out = path.join(OUT, `hpi-r2-practitioner-${row}-${cpn}.png`)
        // Tight crop: the practitioner panel contains both the search
        // input and the result card, which is exactly what Noel wants to
        // verify the row evidence against.
        await captureTightCrop(page, 'HPI Practitioner Lookup', out)
        console.log(`    ✓ ${out}`)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(300)
      }
    }

    // ── Facility IDs ─────────────────────────────────────────────────────
    for (const [row, ids] of Object.entries(FACILITY_IDS)) {
      for (const hpi of ids) {
        console.log(`\n  → ${row} · ${hpi}`)
        await lookupFacility(page, hpi)
        const safe = hpi.replace(/[^A-Z0-9]/gi, '')
        const out = path.join(OUT, `hpi-r2-facility-${row}-${safe}.png`)
        await captureTightCrop(page, 'HPI Facility Lookup', out)
        console.log(`    ✓ ${out}`)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(300)
      }
    }

    // ── Name-only Search Practitioner (Search-4) ─────────────────────────
    for (const { family, file } of SEARCH_NAME_ONLY) {
      console.log(`\n  → Search-4 name-only · ${family}`)
      await searchByFamilyOnly(page, family)
      const out = path.join(OUT, file)
      await captureTightCrop(page, 'HPI Practitioner Lookup', out)
      console.log(`    ✓ ${out}`)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(300)
    }

    // ── Surname + DOB Search Practitioner (Search-3) ─────────────────────
    // Evidences the row we're updating from "not implemented" → "implemented
    // when admin supplies DOB (optional)".
    for (const { family, dob, file } of SEARCH_WITH_DOB) {
      console.log(`\n  → Search-3 surname+DOB · ${family} ${dob}`)
      await searchByFamilyAndDob(page, family, dob)
      const out = path.join(OUT, file)
      await captureTightCrop(page, 'HPI Practitioner Lookup', out)
      console.log(`    ✓ ${out}`)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(300)
    }

    console.log('\n[Round 2 part A] Admin HPI Lookup captures complete.')
    console.log('    See part B for facility-search-removed evidence (separate test).')
    expect(true).toBe(true)
  })

  // ── Part B: facility search removed from 3 prod surfaces ──────────────
  // Interactive — pauses on each surface so you can navigate to it in the
  // browser. Noel saw demo data on these in his 2026-11-09 review; these
  // screenshots prove the HPI Location call has been stripped and the
  // local-only fallbacks (free-text, pharmacies.json, text input) are
  // now the only code path.
  test('Facility-search-removed evidence (patient GP / pharmacy / radiology)', async ({ page }) => {
    console.log('\n[Round 2 part B] Facility-search-removed surfaces')

    for (const { file, prompt } of STRIPPED_SURFACES) {
      console.log(`\n  ⏸  ${prompt}`)
      await page.pause()
      await page.waitForTimeout(500)
      const out = path.join(OUT, file)
      // No panel locator to scope to here — these are whole-step surfaces,
      // but they're already single-column and compact, so a viewport-sized
      // shot captures the relevant content at the configured 3× scale.
      await page.screenshot({ path: out, type: 'png' })
      console.log(`    ✓ ${out}`)
    }

    console.log('\n[Round 2] All captures complete.')
    console.log('    Next: run python3 scripts/fill_hpi_compliance_docx.py to regenerate the docx.')
    expect(true).toBe(true)
  })
})
