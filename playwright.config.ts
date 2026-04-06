// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.TEST_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['html', { open: 'never' }], ['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    // Auth setup — runs first, saves storageState for each role
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
    },

    // Main test suite — depends on auth setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/admin.json',
      },
      dependencies: ['auth-setup'],
    },
  ],
});
