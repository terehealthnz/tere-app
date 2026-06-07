import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'demo',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        video: 'on',
        launchOptions: { slowMo: 600 },
      },
      testMatch: '**/demo-walkthrough.spec.ts',
    },
    {
      name: 'patient-recording',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },  // iPhone 14 dimensions
        video: 'on',
        headless: false,
        permissions: ['camera', 'geolocation', 'microphone'],
        geolocation: { latitude: -36.8485, longitude: 174.7633 }, // Auckland
        launchOptions: {
          slowMo: 400,
          args: [
            '--use-fake-device-for-media-stream=false',
            '--allow-file-access-from-files',
          ],
        },
      },
      testMatch: '**/patient-recording.spec.ts',
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
