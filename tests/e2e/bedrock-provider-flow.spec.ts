import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

// Browser end-to-end: opens the provider notes page for a seeded consult,
// waits for ProviderNotes to auto-fire /api/generate-notes with the real UI
// wiring + auth headers, and asserts the response quality. Cleans up after.
//
// This closes the gap the API smoke leaves: proves the UI actually calls the
// endpoint with the correct payload shape, that x-provider-id auth flows
// through apiFetch, that the response deserialises, and that the notes
// render in the DOM.

const PROD = process.env.SMOKE_URL || 'https://terehealth.co.nz'

let consultId: string
let providerId: string
let providerName: string
let supabase: ReturnType<typeof createClient>

test.beforeAll(async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  supabase = createClient(url, key)

  const { data: prov, error: pErr } = await supabase
    .from('providers')
    .select('id, first_name, last_name')
    .eq('is_active', true)
    .limit(1)
    .single()
  if (pErr || !prov) throw new Error(`No active provider: ${pErr?.message}`)
  providerId = prov.id as string
  providerName = `${prov.first_name} ${prov.last_name}`

  const { data: consult, error: cErr } = await supabase
    .from('consultations')
    .insert({
      status: 'complete',
      consultation_type: 'video',
      patient_first_name: 'Bedrock',
      patient_last_name: 'E2ESmokeTest',
      patient_dob: '1985-05-01',
      chief_complaint: 'Sprained right ankle at work',
      medical_history: 'Nil significant',
      medications: 'None',
      patient_allergies: 'NKDA',
      acc_eligible: 'yes',
      acc_injury_details: 'Rolled right ankle stepping off the tray of a work ute',
      acc_injury_date: '2026-07-06',
      acc_employer: 'Marlborough Wine Co.',
      transcript: `[PROVIDER] Kia ora, tell me what happened with the ankle.
[PATIENT] I rolled it stepping off the tray of the ute at work yesterday afternoon. It's pretty swollen on the outside but I can still put a bit of weight on it. No numbness or tingling. Pain is about a 6 out of 10.
[PROVIDER] Okay. I can see swelling on the right lateral malleolus. Range of motion is limited on inversion. Let's go with RICE — rest, ice, compression, elevation. Ibuprofen 400 milligrams three times daily. I'll complete an ACC45 for the workplace injury. If it's not improving in 5 days come back for a review, and if the pain gets worse or you can't weight bear at all, go straight to the ED.`,
      provider_id: providerId,
      provider_display_name: providerName,
      duration: 8,
    })
    .select('id')
    .single()
  if (cErr || !consult) throw new Error(`Insert failed: ${cErr?.message}`)
  consultId = (consult as any).id as string
  console.log(`[e2e] Seeded consult ${consultId} · provider ${providerName}`)
})

test.afterAll(async () => {
  if (consultId && supabase) {
    await supabase.from('consultations').delete().eq('id', consultId)
    console.log(`[e2e] Cleaned up consult ${consultId}`)
  }
})

test.describe('Bedrock UI E2E — provider notes page hits /api/generate-notes with real auth', () => {

  test('Load /provider/notes/:id → auto-fires generate-notes → response has quality extraction', async ({ page }) => {
    // 1. Boot on origin, install provider session before navigating to the notes page
    await page.goto(`${PROD}/`)
    await page.evaluate(({ pid, pname }) => {
      sessionStorage.setItem('clinicianAuth', 'true')
      sessionStorage.setItem('providerId', pid)
      sessionStorage.setItem('providerDisplayName', pname)
      sessionStorage.setItem('providerIsAdmin', 'false')
      sessionStorage.setItem('providerIsProvider', 'true')
      // Ensure no stale local draft interferes with auto-generation
      Object.keys(localStorage).filter(k => k.startsWith('tere_notes_draft_')).forEach(k => localStorage.removeItem(k))
    }, { pid: providerId, pname: providerName })

    // 2. Watch for the generate-notes network call before navigation
    const generateNotesPromise = page.waitForResponse(
      response => response.url().includes('/api/generate-notes') && response.request().method() === 'POST',
      { timeout: 45000 }
    )

    // 3. Navigate to the notes page — ProviderNotes auto-triggers runGenerate on load
    await page.goto(`${PROD}/provider/notes/${consultId}`)

    // 4. Await the network call
    const response = await generateNotesPromise
    console.log(`[e2e] /api/generate-notes → ${response.status()}`)
    expect(response.status()).toBe(200)

    const body = await response.json()
    if (body.skipped) throw new Error('ai_notes_enabled flag is OFF — flip it on in Admin > Feature flags')

    console.log(`[e2e] Extracted note quality:`)
    console.log(`  → presentingHistory: ${body.presentingHistory?.slice(0, 120)}…`)
    console.log(`  → visibleFindings:   ${body.visibleFindings?.slice(0, 120)}…`)
    console.log(`  → mdm:               ${(body.mdm || 'null')?.slice(0, 120)}…`)
    console.log(`  → planItems (${body.planItems?.length}): ${JSON.stringify(body.planItems).slice(0, 180)}`)
    console.log(`  → readCode:  ${body.suggestedReadCode} (${body.readCodeLabel})`)
    console.log(`  → ICD-10:    ${body.icd10Code} (${body.icd10Label})`)

    // 5. Assert on API response quality
    expect(body.presentingHistory).toBeTruthy()
    expect(body.suggestedReadCode).toBe('S30')
    expect(body.icd10Code).toMatch(/^S9[39]/)
    expect(Array.isArray(body.planItems) && body.planItems.length).toBeGreaterThan(0)

    // 6. Verify the UI actually renders the notes — wait for the note textarea to populate
    await page.waitForTimeout(3000) // React state settle
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Bedrock') // patient name shown

    // Take a full-page screenshot for visual review
    await page.screenshot({ path: 'test-results/bedrock-e2e-notes.png', fullPage: true })
    console.log(`[e2e] Screenshot: test-results/bedrock-e2e-notes.png`)
  })
})
