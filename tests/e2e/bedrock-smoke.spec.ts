import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const PROD = process.env.SMOKE_URL || 'https://terehealth.co.nz'

let PROVIDER_ID: string

test.beforeAll(async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing in .env / .env.local')
  const s = createClient(url, key)
  const { data, error } = await s
    .from('providers')
    .select('id, first_name, last_name')
    .eq('is_active', true)
    .limit(1)
    .single()
  if (error || !data) throw new Error(`No active provider row: ${error?.message}`)
  PROVIDER_ID = data.id
  console.log(`[smoke] Using provider ${data.first_name} ${data.last_name} (${PROVIDER_ID.slice(0, 8)}…) for x-provider-id`)
})

test.describe('Bedrock migration smoke test — all clinical AI endpoints', () => {

  test('1. /api/bedrock-test — Haiku + Sonnet return pong', async ({ request }) => {
    const res = await request.get(`${PROD}/api/bedrock-test`)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.haiku.ok).toBe(true)
    expect(body.haiku.reply.toLowerCase()).toContain('pong')
    expect(body.sonnet.ok).toBe(true)
    expect(body.sonnet.reply.toLowerCase()).toContain('pong')
    console.log(`   → haiku ${body.haiku.latencyMs}ms · sonnet ${body.sonnet.latencyMs}ms · region ${body.region}`)
  })

  test('2. /api/assess-acc (Haiku) — ankle sprain flagged ACC-eligible', async ({ request }) => {
    const res = await request.post(`${PROD}/api/assess-acc`, {
      data: { complaint: 'I sprained my ankle at work yesterday when I stepped off the tray of a ute.' },
    })
    const body = await res.json()
    expect(res.status()).toBe(200)
    expect(body.isLikelyACC).toBe(true)
    console.log(`   → isLikelyACC: ${body.isLikelyACC}`)
  })

  test('2b. /api/assess-acc (Haiku) — sore throat NOT flagged ACC', async ({ request }) => {
    const res = await request.post(`${PROD}/api/assess-acc`, {
      data: { complaint: 'Sore throat for 3 days, no swelling, mild fever.' },
    })
    const body = await res.json()
    expect(res.status()).toBe(200)
    expect(body.isLikelyACC).toBe(false)
    console.log(`   → isLikelyACC: ${body.isLikelyACC}`)
  })

  test('3. /api/verify-acc (Sonnet) — returns valid JSON verdict', async ({ request }) => {
    const res = await request.post(`${PROD}/api/verify-acc`, {
      data: {
        complaint: 'Sprained ankle',
        injuryDetails: 'Rolled right ankle stepping off the tray of my work ute',
        injuryDate: '2026-07-06',
        employer: 'Marlborough Wine Co.',
      },
    })
    const body = await res.json()
    expect(res.status()).toBe(200)
    expect(['ELIGIBLE','BORDERLINE','FLAGGED','PENDING']).toContain(body.verdict)
    expect(body.confidence).toMatch(/^(high|moderate|low)$/)
    expect(body.reasoning?.length).toBeGreaterThan(20)
    console.log(`   → verdict: ${body.verdict} · confidence: ${body.confidence}`)
    console.log(`   → reasoning: ${body.reasoning.slice(0, 140)}…`)
  })

  test('4. /api/async-consult check_suitability (Haiku) — common cold is suitable', async ({ request }) => {
    const res = await request.post(`${PROD}/api/async-consult`, {
      data: { action: 'check_suitability', complaint: 'Runny nose, mild cough, sore throat for 3 days. No fever.' },
    })
    const body = await res.json()
    expect(res.status()).toBe(200)
    expect(body.suitable).toBe(true)
    console.log(`   → suitable: ${body.suitable}`)
  })

  test('4b. /api/async-consult check_suitability (Haiku) — chest pain NOT suitable', async ({ request }) => {
    const res = await request.post(`${PROD}/api/async-consult`, {
      data: { action: 'check_suitability', complaint: 'Central crushing chest pain radiating to left arm, started 2 hours ago.' },
    })
    const body = await res.json()
    expect(res.status()).toBe(200)
    expect(body.suitable).toBe(false)
    console.log(`   → suitable: ${body.suitable} (chest pain correctly excluded)`)
  })

  test('5. /api/generate-notes (Sonnet, Tere Scribe) — extracts clinical facts from transcript', async ({ request }) => {
    const res = await request.post(`${PROD}/api/generate-notes`, {
      headers: { 'x-provider-id': PROVIDER_ID, 'Content-Type': 'application/json' },
      data: {
        transcript: `[PROVIDER] Kia ora, tell me what happened with the ankle.
[PATIENT] I rolled it stepping off the tray of the ute at work yesterday afternoon. It's pretty swollen on the outside but I can still put a bit of weight on it. No numbness or tingling. Pain is about a 6 out of 10.
[PROVIDER] Okay. I can see swelling on the right lateral malleolus. Range of motion is limited on inversion. Let's go with RICE — rest, ice, compression, elevation. Ibuprofen 400 milligrams three times daily. I'll complete an ACC45 for the workplace injury. If it's not improving in 5 days come back for a review, and if the pain gets worse or you can't weight bear at all, go straight to the ED.`,
        triage: {
          patientName: 'Smoke Test Patient',
          chiefComplaint: 'Sprained right ankle at work',
          accEligible: true,
          accInjuryDescription: 'Rolled right ankle stepping off ute',
          accEmployer: 'Marlborough Wine Co.',
        },
        durationMinutes: 8,
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    if (body.skipped) throw new Error('generate-notes flag disabled — enable ai_notes_enabled in Admin')
    expect(body.presentingHistory).toBeTruthy()
    expect(body.suggestedReadCode).toBe('S30')
    expect(body.icd10Code).toContain('S93')
    console.log(`   → presentingHistory: ${body.presentingHistory?.slice(0, 100)}…`)
    console.log(`   → visibleFindings: ${body.visibleFindings?.slice(0, 100)}…`)
    console.log(`   → mdm: ${(body.mdm || '').slice(0, 100)}…`)
    console.log(`   → planItems (${body.planItems?.length}): ${JSON.stringify(body.planItems).slice(0, 160)}`)
    console.log(`   → sources: ${JSON.stringify(body._sources)}`)
    console.log(`   → confidence: ${JSON.stringify(body._confidence)}`)
  })

  test('6. /api/send-email (Sonnet) — generates 3-paragraph patient summary (email skipped)', async ({ request }) => {
    const res = await request.post(`${PROD}/api/send-email`, {
      headers: { 'x-provider-id': PROVIDER_ID, 'Content-Type': 'application/json' },
      data: {
        // no `to` field → Resend send is skipped, but Bedrock summary still generated
        name: 'Smoke Test Patient',
        sections: {
          presentingHistory: 'Rolled right ankle at work stepping off ute.',
          mdm: 'Grade 1 lateral ankle sprain, weight-bearing tolerated, no red flags.',
          plan: 'RICE, ibuprofen 400mg TDS, ACC45 completed, review 5 days.',
        },
        actions: [
          { type: 'prescription', drug: 'Ibuprofen', dose: '400mg', frequency: 'TDS', pharmacy: 'Marlborough Pharmacy' },
          { type: 'acc45', injury: 'Right ankle sprain' },
        ],
        consult: { chief_complaint: 'Sprained ankle at work' },
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.summaryText).toBeTruthy()
    expect(body.summaryText.length).toBeGreaterThan(50)
    expect(body.summaryText.toLowerCase()).toContain('111') // safety closer
    console.log(`   → summary (${body.summaryText.length} chars):`)
    console.log(`     ${body.summaryText.replace(/\n+/g, '\n     ').slice(0, 500)}`)
  })
})
