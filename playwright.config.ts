import { defineConfig, devices } from '@playwright/test';

const regressionMode = process.env.SWITCHPATH_REGRESSION_MODE === '1';

export default defineConfig({
  testDir: regressionMode ? './tests/generated' : './tests',
  testIgnore: regressionMode ? [] : ['**/generated/**'],
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: { chromiumSandbox: true },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});