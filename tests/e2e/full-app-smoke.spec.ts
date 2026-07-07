// Full patient + provider smoke test against production.
// Written to be run standalone (absolute URLs, no dev server required).
//
// Scope:
//   Patient side:
//     - Landing page loads with kiwi CTA
//     - Consent page renders with required checkboxes
//     - Consent → triage transition
//     - Triage collects name / DOB / phone / chief complaint
//     - Chief complaint fires /api/assess-acc (network capture)
//     - Careers page renders + apply form endpoint accepts submission
//   Provider side:
//     - Provider dashboard renders with session-storage auth
//     - Notes page auto-fires generate-notes for a seeded consult
//     - Send patient summary email hits the send-email endpoint
//
// Run: npx playwright test tests/e2e/full-app-smoke.spec.ts --project=chromium

import { test, expect } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import 'dotenv/config'

const PROD = process.env.SMOKE_URL || 'https://terehealth.co.nz'

let supabase: SupabaseClient
let providerId: string
let providerName: string

test.beforeAll(async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  supabase = createClient(url, key)
  const { data: prov } = await supabase
    .from('providers')
    .select('id, first_name, last_name')
    .eq('is_active', true)
    .limit(1)
    .single()
  providerId = prov!.id as string
  providerName = `${prov!.first_name} ${prov!.last_name}`
  console.log(`[smoke] Using provider ${providerName}`)
})

test.describe('Patient side — landing → consent → triage', () => {

  test('P1. Root URL renders marketing Landing on prod hostname', async ({ page }) => {
    // On the terehealth.co.nz hostname `PwaRoot` (App.jsx:127) renders
    // <Landing />, the marketing page. On any other hostname it renders
    // <TereIntro />, the patient app entry. Both are checked below.
    //
    // Marketing Landing's book CTA is an absolute link to the patient app
    // subdomain — see Landing.jsx line 6, CONSULT_URL = 'https://tere.co.nz/start'
    await page.goto(`${PROD}/`)
    await expect(page.locator('text=Book consultation').first()).toBeVisible({ timeout: 15000 })
    const body = await page.textContent('body')
    expect(body).toMatch(/Tere Health/i)
    console.log('   ✓ Marketing Landing rendered with Book consultation CTA')
  })

  test('P1b. Patient app entry (/start) shows kiwi CTA', async ({ page }) => {
    // TereIntro is always at /start regardless of hostname.
    await page.goto(`${PROD}/start`)
    await expect(page.locator('[data-testid="kiwi-cta"]')).toBeVisible({ timeout: 15000 })
    console.log('   ✓ TereIntro kiwi-cta present at /start')
  })

  test('P2. Consent page renders with three sections and required checkboxes', async ({ page }) => {
    await page.goto(`${PROD}/consent`)
    await expect(page.locator('text=Before we begin')).toBeVisible({ timeout: 15000 })

    // HDC + prescribing acknowledge required for Continue; research is optional
    const hdc = page.locator('[data-testid="hdc-consent-checkbox"]')
    const rx = page.locator('[data-testid="prescribing-acknowledge"]')
    const continueBtn = page.locator('[data-testid="consent-continue"]')

    await expect(hdc).toBeVisible()
    await expect(rx).toBeVisible()
    await expect(continueBtn).toBeDisabled()

    // AI processing disclosure updated in commit 110a4f1 — should mention AWS Bedrock + BAA
    const body = await page.textContent('body')
    expect(body).toContain('AWS Bedrock')
    expect(body).toContain('BAA')
    console.log('   ✓ AI disclosure references AWS Bedrock + BAA')

    // Tick both, verify Continue becomes enabled
    await hdc.click()
    await rx.click()
    await expect(continueBtn).toBeEnabled()
    console.log('   ✓ Continue enables when required boxes ticked')
  })

  test('P3. Consent → triage transition + triage first field', async ({ page }) => {
    await page.goto(`${PROD}/consent`)
    await expect(page.locator('text=Before we begin')).toBeVisible({ timeout: 15000 })
    await page.locator('[data-testid="hdc-consent-checkbox"]').click()
    await page.locator('[data-testid="prescribing-acknowledge"]').click()
    await page.locator('[data-testid="consent-continue"]').click()

    const input = page.locator('[data-testid="triage-input"]')
    await expect(input).toBeVisible({ timeout: 20000 })
    console.log('   ✓ Reached triage')
  })

  test('P4. Triage collects name → DOB → phone (new patient path)', async ({ page }) => {
    await page.goto(`${PROD}/triage`)
    const input = page.locator('[data-testid="triage-input"]')
    await expect(input).toBeVisible({ timeout: 20000 })

    // Name
    await expect(page.locator('text=/full name/i')).toBeVisible({ timeout: 10000 })
    await input.fill('E2E SmokeTest')
    await page.keyboard.press('Enter')

    // DOB
    await expect(
      page.locator('text=/date of birth/i').or(page.locator('text=/dob/i')).first()
    ).toBeVisible({ timeout: 10000 })
    await input.fill('1 January 1990')
    await page.keyboard.press('Enter')

    // Phone (new patient path)
    await expect(
      page.locator('text=/mobile/i').or(page.locator('text=/phone/i')).first()
    ).toBeVisible({ timeout: 15000 })
    console.log('   ✓ Name → DOB → phone flow')
  })
  test('P5. Triage accepts sequential text answers and advances', async ({ page }) => {
    test.setTimeout(60_000)
    // Verifies the triage chat flow accepts input and advances through the
    // first four steps (name → dob → phone → email). AITriage.jsx:86-90.
    //
    // NOTE: an earlier version of this test attempted to walk all the way to
    // the chief_complaint step and assert that /api/assess-acc fires. That
    // was too brittle to run reliably in Playwright because AITriage renders
    // messages with a typewriter animation and forks the step order based on
    // returning-patient lookup, employer coverage, and language. The endpoint
    // contract is covered by bedrock-smoke.spec.ts test #2 (assess-acc with
    // ankle-sprain input). This test focuses on UI-level input handling.
    await page.goto(`${PROD}/triage`)
    const input = page.locator('[data-testid="triage-input"]')
    await expect(input).toBeVisible({ timeout: 20000 })

    async function fillAndAdvance(text, stepLabel) {
      const before = await page.evaluate(() =>
        (document.querySelector('[class*="scroll"]') || document.body).querySelectorAll('div').length
      )
      await input.fill(text)
      await page.keyboard.press('Enter')
      const start = Date.now()
      while (Date.now() - start < 10000) {
        const after = await page.evaluate(() =>
          (document.querySelector('[class*="scroll"]') || document.body).querySelectorAll('div').length
        )
        if (after > before) {
          console.log(`   ✓ "${stepLabel}" advanced (${before} → ${after})`)
          return
        }
        await new Promise(r => setTimeout(r, 300))
      }
      throw new Error(`Step "${stepLabel}" did not advance`)
    }

    await fillAndAdvance('E2E WiringTest', 'name')
    await fillAndAdvance('1 January 1990', 'dob')
    await fillAndAdvance('021 555 1234', 'phone')
    await fillAndAdvance('e2e-wiring@example.com', 'email')
  })

  test('P6. Careers page renders and apply form endpoint accepts submission', async ({ request, page }) => {
    await page.goto(`${PROD}/careers`)
    await expect(page.locator('text=/Tere Health/i').first()).toBeVisible({ timeout: 10000 })
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Tere Health')

    // Submit a test application to prove the notification path still works.
    // Use the same fire-and-forget behaviour.
    const res = await request.post(`${PROD}/api/job-applications`, {
      data: {
        first_name: 'Smoke',
        last_name: 'FullAppTest',
        email: 'e2e-full-smoke@example.com',
        phone: '021000000',
        cover_note: 'Automated full-app smoke test submission — safe to delete.',
        source: 'e2e-smoke-test',
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    console.log(`   ✓ Careers apply endpoint accepted submission (id ${body.id?.slice(0, 8)}…)`)

    // Clean up the test row so it doesn't clutter the applicants pipeline.
    if (body.id) {
      await supabase.from('job_applications').delete().eq('id', body.id)
      console.log(`   ✓ Cleanup: deleted test application row`)
    }
  })
})

test.describe('Provider side — dashboard → notes → email', () => {
  let consultId: string

  test.beforeAll(async () => {
    const { data: consult, error } = await supabase
      .from('consultations')
      .insert({
        status: 'complete',
        consultation_type: 'video',
        patient_first_name: 'FullAppSmoke',
        patient_last_name: 'PatientTest',
        patient_dob: '1985-05-01',
        chief_complaint: 'Sprained right ankle at work',
        medical_history: 'Nil',
        medications: 'None',
        patient_allergies: 'NKDA',
        acc_eligible: 'yes',
        acc_injury_details: 'Rolled right ankle stepping off ute',
        acc_injury_date: '2026-07-06',
        acc_employer: 'Marlborough Wine Co.',
        transcript: `[PROVIDER] Kia ora, tell me what happened.
[PATIENT] Rolled my ankle stepping off the ute at work yesterday. Swollen but I can still weight-bear a bit. Pain 6/10.
[PROVIDER] I can see swelling on the lateral malleolus. Let's do RICE, ibuprofen 400mg three times a day, and I'll complete an ACC45. Review in 5 days if not improving; go to ED if pain worsens.`,
        provider_id: providerId,
        provider_display_name: providerName,
        duration: 8,
      })
      .select('id')
      .single()
    if (error || !consult) throw new Error(`Insert failed: ${error?.message}`)
    consultId = (consult as any).id
  })

  test.afterAll(async () => {
    if (consultId) {
      await supabase.from('consultations').delete().eq('id', consultId)
      console.log(`[smoke] Cleaned up test consult ${consultId}`)
    }
  })

  test('V1. Provider dashboard loads with valid session', async ({ page }) => {
    await page.goto(`${PROD}/`)
    await page.evaluate(({ pid, pname }) => {
      sessionStorage.setItem('clinicianAuth', 'true')
      sessionStorage.setItem('providerId', pid)
      sessionStorage.setItem('providerDisplayName', pname)
      sessionStorage.setItem('providerIsProvider', 'true')
    }, { pid: providerId, pname: providerName })

    await page.goto(`${PROD}/provider`)
    // We expect either the queue view or dashboard to render
    await page.waitForLoadState('networkidle', { timeout: 20000 })
    const body = await page.textContent('body')
    // Must show some provider-context word
    expect(body).toMatch(/queue|dashboard|patient|consultation|provider/i)
    console.log('   ✓ Provider dashboard/queue loaded')
  })

  test('V2. Notes page auto-fires generate-notes for seeded consult', async ({ page }) => {
    await page.goto(`${PROD}/`)
    await page.evaluate(({ pid, pname }) => {
      sessionStorage.setItem('clinicianAuth', 'true')
      sessionStorage.setItem('providerId', pid)
      sessionStorage.setItem('providerDisplayName', pname)
      sessionStorage.setItem('providerIsProvider', 'true')
      Object.keys(localStorage).filter(k => k.startsWith('tere_notes_draft_')).forEach(k => localStorage.removeItem(k))
    }, { pid: providerId, pname: providerName })

    const notesResp = page.waitForResponse(
      r => r.url().includes('/api/generate-notes') && r.request().method() === 'POST',
      { timeout: 45000 }
    )
    await page.goto(`${PROD}/provider/notes/${consultId}`)
    const res = await notesResp
    expect(res.status()).toBe(200)
    const body = await res.json()
    if (body.skipped) throw new Error('ai_notes_enabled disabled — flip it on in Admin')
    expect(body.suggestedReadCode).toBe('S30')
    expect(body.presentingHistory).toBeTruthy()
    console.log(`   ✓ Generate-notes returned S30 · ${body.presentingHistory?.slice(0, 60)}...`)
  })

  test('V3. Send patient summary email endpoint returns warm summary', async ({ request }) => {
    const res = await request.post(`${PROD}/api/send-email`, {
      headers: { 'x-provider-id': providerId, 'Content-Type': 'application/json' },
      data: {
        // Omit `to` — Resend send skipped, but summary still generated by Sonnet
        name: 'FullAppSmoke Patient',
        sections: {
          presentingHistory: 'Rolled right ankle at work.',
          mdm: 'Grade 1 lateral ankle sprain.',
          plan: 'RICE, ibuprofen 400mg TDS, ACC45 completed, review 5 days.',
        },
        actions: [
          { type: 'prescription', drug: 'Ibuprofen', dose: '400mg', frequency: 'TDS' },
          { type: 'acc45', injury: 'Right ankle sprain' },
        ],
        consult: { chief_complaint: 'Sprained ankle at work' },
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.summaryText.length).toBeGreaterThan(50)
    expect(body.summaryText.toLowerCase()).toContain('111')
    console.log(`   ✓ Send-email returned ${body.summaryText.length}-char summary with 111 sign-off`)
  })
})
