import { test, expect } from '@playwright/test'

test.setTimeout(180000)

// ── Full patient encounter ────────────────────────────────────────────────────

test('Patient — full encounter', async ({ page }) => {
  // ── 1. Home screen ──────────────────────────────────────────────────────────
  await page.goto('/')
  await expect(page.locator('[data-testid="kiwi-cta"]')).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(2000)

  await page.click('[data-testid="kiwi-cta"]')

  // ── 2. Consent page ─────────────────────────────────────────────────────────
  await expect(page.locator('text=Before we begin')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1500)

  // Scroll through to read it
  await page.mouse.wheel(0, 280)
  await page.waitForTimeout(900)

  // Tick HDC rights
  await page.click('[data-testid="hdc-consent-checkbox"]')
  await page.waitForTimeout(700)

  await page.mouse.wheel(0, 280)
  await page.waitForTimeout(700)

  // Tick prescribing limitations
  await page.click('[data-testid="prescribing-acknowledge"]')
  await page.waitForTimeout(700)

  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(600)

  // Opt in to research
  await page.click('[data-testid="research-yes"]')
  await page.waitForTimeout(800)

  // Scroll to Continue button and click
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(500)
  await page.click('[data-testid="consent-continue"]')

  // ── 3. Triage chat ──────────────────────────────────────────────────────────
  await expect(page.locator('[data-testid="triage-input"]')).toBeVisible({ timeout: 12000 })
  await page.waitForTimeout(2000)

  const input = page.locator('[data-testid="triage-input"]')

  // Name
  await input.click()
  await page.keyboard.type('Sarah Mitchell', { delay: 75 })
  await page.waitForTimeout(900)
  await page.keyboard.press('Enter')

  // DOB
  await expect(page.locator('text=date of birth').or(page.locator('text=Date of birth')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1200)
  await input.click()
  await page.keyboard.type('12 March 1988', { delay: 70 })
  await page.waitForTimeout(800)
  await page.keyboard.press('Enter')

  // Phone
  await expect(page.locator('text=mobile').or(page.locator('text=phone')).first()).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(1000)
  await input.click()
  await page.keyboard.type('021 456 7890', { delay: 70 })
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')

  // Email
  await expect(page.locator('text=email').first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(800)
  await input.click()
  await page.keyboard.type('sarah.mitchell@example.com', { delay: 60 })
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')

  // Chief complaint
  await expect(page.locator('text=brought you in').or(page.locator('text=today')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1500)
  await input.click()
  await page.keyboard.type('Sore throat and fever for 2 days. Difficulty swallowing.', { delay: 55 })
  await page.waitForTimeout(900)
  await page.keyboard.press('Enter')

  // ACC check — No
  await expect(page.locator('text=accident').or(page.locator('text=ACC')).first()).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(1500)
  const noBtn = page.locator('button', { hasText: /^No$/ }).first()
  if (await noBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await noBtn.click()
  } else {
    await input.click()
    await page.keyboard.type('No', { delay: 60 })
    await page.keyboard.press('Enter')
  }

  // Medical history — none
  await expect(page.locator('text=medical history').or(page.locator('text=Medical history')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1200)
  await input.click()
  await page.keyboard.type('None', { delay: 60 })
  await page.keyboard.press('Enter')

  // Medications — none
  await expect(page.locator('text=medications').or(page.locator('text=Medications')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1000)
  await input.click()
  await page.keyboard.type('None', { delay: 60 })
  await page.keyboard.press('Enter')

  // Allergies — none
  await expect(page.locator('text=allerg').first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1000)
  await input.click()
  await page.keyboard.type('No known allergies', { delay: 60 })
  await page.keyboard.press('Enter')

  // NHI — skip
  await expect(page.locator('text=NHI').first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1200)
  const skipNhi = page.locator('button', { hasText: /skip/i }).first()
  if (await skipNhi.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipNhi.click()
  } else {
    await input.click()
    await page.keyboard.type('skip', { delay: 60 })
    await page.keyboard.press('Enter')
  }

  // Pharmacy
  await expect(page.locator('text=pharmacy').or(page.locator('text=Pharmacy')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1000)
  await input.click()
  await page.keyboard.type('Unichem Picton', { delay: 65 })
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')

  // GP — skip
  await expect(page.locator('text=GP').or(page.locator('text=doctor')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1200)
  const skipGp = page.locator('button', { hasText: /skip/i }).first()
  if (await skipGp.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipGp.click()
  } else {
    await input.click()
    await page.keyboard.type('skip', { delay: 60 })
    await page.keyboard.press('Enter')
  }

  // Tobacco — No
  await expect(page.locator('text=smoke').or(page.locator('text=tobacco')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1000)
  const noTobacco = page.locator('button', { hasText: /^No$/ }).first()
  if (await noTobacco.isVisible({ timeout: 2000 }).catch(() => false)) {
    await noTobacco.click()
  } else {
    await input.click()
    await page.keyboard.type('No', { delay: 60 })
    await page.keyboard.press('Enter')
  }

  // Alcohol — No
  await expect(page.locator('text=alcohol').or(page.locator('text=Alcohol')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1000)
  const noAlcohol = page.locator('button', { hasText: /^No$/ }).first()
  if (await noAlcohol.isVisible({ timeout: 2000 }).catch(() => false)) {
    await noAlcohol.click()
  } else {
    await input.click()
    await page.keyboard.type('No', { delay: 60 })
    await page.keyboard.press('Enter')
  }

  // Photo — skip
  await expect(page.locator('text=photo').or(page.locator('text=Photo')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1500)
  const skipPhoto = page.locator('button', { hasText: /skip/i }).first()
  if (await skipPhoto.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipPhoto.click()
  } else {
    await input.click()
    await page.keyboard.type('skip', { delay: 60 })
    await page.keyboard.press('Enter')
  }

  // Recording consent — Yes
  await expect(page.locator('text=recording').or(page.locator('text=transcrib')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1500)
  const yesRecording = page.locator('button', { hasText: /^Yes$/ }).first()
  if (await yesRecording.isVisible({ timeout: 2000 }).catch(() => false)) {
    await yesRecording.click()
  } else {
    await input.click()
    await page.keyboard.type('Yes', { delay: 60 })
    await page.keyboard.press('Enter')
  }

  // "Setting you up..." — triage complete, wait for navigation
  await page.waitForTimeout(2000)

  // ── 4. Consultation type ────────────────────────────────────────────────────
  // Navigate directly — triage may have gone to /consultation-type already,
  // or we can jump there with session state set
  await page.evaluate(() => {
    if (!sessionStorage.getItem('consultationId')) {
      sessionStorage.setItem('consultationId', 'demo-consult-' + Date.now())
    }
    sessionStorage.setItem('paymentAmount', '65')
  })

  // Wait to see if we land on consultation-type, else navigate there
  await page.waitForTimeout(1500)
  const currentUrl = page.url()
  if (!currentUrl.includes('consultation-type')) {
    await page.goto('/consultation-type')
  }

  await expect(page.locator('text=Video').or(page.locator('text=consultation type')).first()).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(2000)

  // Select video consultation
  const videoBtn = page.locator('button', { hasText: /video/i }).first()
  if (await videoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await videoBtn.click()
  }
  await page.waitForTimeout(1500)

  // ── 5. Payment ──────────────────────────────────────────────────────────────
  // Navigate to payment — employer sees the Stripe form
  await page.waitForTimeout(1000)
  const afterConsultUrl = page.url()
  if (!afterConsultUrl.includes('payment') && !afterConsultUrl.includes('vitals')) {
    await page.goto('/payment')
  }

  await page.waitForTimeout(3000)

  // ── 6. Vitals capture ───────────────────────────────────────────────────────
  const cId = await page.evaluate(() => sessionStorage.getItem('consultationId') || 'demo')
  await page.goto(`/vitals/${cId}`)

  // Camera will be denied — wait for error or manual entry option
  await page.waitForTimeout(2500)

  // Click "Enter manually" if camera fails
  const manualBtn = page.locator('button:has-text("manually"), button:has-text("Manual")').first()
  if (await manualBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await manualBtn.click()
    await page.waitForTimeout(1000)
  }

  // Fill in vitals manually
  const hrInput = page.locator('input[placeholder*="HR"], input[placeholder*="heart"], input[name="hr"]').first()
  const bpInput = page.locator('input[placeholder*="BP"], input[placeholder*="blood"], input[name="bp"]').first()
  const spo2Input = page.locator('input[placeholder*="SpO2"], input[placeholder*="oxygen"], input[name="spo2"]').first()

  if (await hrInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await hrInput.fill('72')
    await page.waitForTimeout(400)
  }
  if (await bpInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await bpInput.fill('120/80')
    await page.waitForTimeout(400)
  }
  if (await spo2Input.isVisible({ timeout: 2000 }).catch(() => false)) {
    await spo2Input.fill('98')
    await page.waitForTimeout(400)
  }

  await page.waitForTimeout(1000)

  // Submit vitals
  const submitVitals = page.locator('button.btn-primary, button:has-text("Submit"), button:has-text("Continue")').last()
  if (await submitVitals.isVisible({ timeout: 2000 }).catch(() => false)) {
    await submitVitals.click()
    await page.waitForTimeout(1500)
  }

  // ── 7. Waiting room ─────────────────────────────────────────────────────────
  const consultationId = await page.evaluate(() => sessionStorage.getItem('consultationId') || 'demo')
  await page.goto(`/vitals-waiting/${consultationId}`)
  await page.waitForTimeout(1000)

  // Or the regular waiting room
  const waitingUrl = page.url()
  if (waitingUrl.includes('vitals-waiting') || waitingUrl.includes('waiting')) {
    // show waiting room
  } else {
    await page.goto('/waiting')
  }

  await page.waitForTimeout(3500)

  // Scroll to show the full waiting room
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(1000)
  await page.mouse.wheel(0, -200)
  await page.waitForTimeout(2500)

  // ── 8. Video call ───────────────────────────────────────────────────────────
  await page.goto('/call')
  await page.waitForTimeout(3500)

  // ── 9. Consultation complete ────────────────────────────────────────────────
  await page.goto('/done')
  await expect(page.locator('text=Consultation complete')).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(3000)
})


// ── Provider walkthrough ──────────────────────────────────────────────────────

test('Provider — queue and consultation view', async ({ page }) => {
  // ── 1. Login page ───────────────────────────────────────────────────────────
  await page.goto('/clinician')
  await expect(
    page.locator('text=Who is signing in').or(page.locator('text=Clinician dashboard')).first()
  ).toBeVisible({ timeout: 12000 })
  await page.waitForTimeout(2500)

  // ── 2. Provider queue ───────────────────────────────────────────────────────
  await page.evaluate(() => {
    sessionStorage.setItem('clinicianAuth', 'true')
    sessionStorage.setItem('providerIsProvider', 'true')
    sessionStorage.setItem('providerIsAdmin', 'true')
    sessionStorage.setItem('providerId', 'test-id')
    sessionStorage.setItem('providerDisplayName', 'Dr Patrick Herling')
    sessionStorage.setItem('providerColor', '#0B6E76')
  })
  await page.goto('/provider')

  await expect(
    page.locator('text=Queue').or(page.locator('text=queue')).first()
  ).toBeVisible({ timeout: 12000 })
  await page.waitForTimeout(3000)

  // Scroll to show queue contents
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(1000)
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(1500)

  // ── 3. Admin overview — analytics ──────────────────────────────────────────
  await page.goto('/clinician/admin')
  await expect(page.locator('text=Clinic Admin')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(2000)

  // Show analytics
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(700)
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(700)
  await page.mouse.wheel(0, -800)
  await page.waitForTimeout(600)

  // ── 4. Patients tab ─────────────────────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const p = btns.find(b => b.textContent.includes('Patients'))
    if (p) p.click()
  })
  await expect(
    page.locator('text=patients').or(page.locator('text=patient records')).first()
  ).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(2000)

  // Click first patient record
  const firstPatient = page.locator('button').filter({ hasText: /@/ }).first()
  if (await firstPatient.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstPatient.click()
    await page.waitForTimeout(2500)
    await page.mouse.wheel(0, 350)
    await page.waitForTimeout(700)
    await page.mouse.wheel(0, -350)
    await page.waitForTimeout(1500)
  }
})
