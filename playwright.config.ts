import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /** Opt-in: requires DATABASE_URL + built dist (`npm run build`) so `npm run start` succeeds. */
  webServer:
    process.env.E2E_USE_WEBSERVER === '1'
      ? {
          command: 'npm run start',
          url: 'http://localhost:3000/health',
          reuseExistingServer: true,
          timeout: 120_000,
        }
      : undefined,
});
