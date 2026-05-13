import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './testsprite_tests/playwright',
  testMatch: ['**/prd-redflix.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  timeout: 30000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'testsprite_tests/playwright-report', open: 'never' }],
    ['json', { outputFile: 'testsprite_tests/playwright-results.json' }],
  ],
  webServer: {
    command: 'npm run dev -- --port 3000 --strictPort',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    headless: !!process.env.CI,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    navigationTimeout: 20000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // Skip boot animation in all E2E tests
    storageState: 'testsprite_tests/e2e-storage-state.json',
  },
  projects: [
    {
      name: 'chromium-tv',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        userAgent:
          'Mozilla/5.0 (Linux; Android 9; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
      },
    },
  ],
});
