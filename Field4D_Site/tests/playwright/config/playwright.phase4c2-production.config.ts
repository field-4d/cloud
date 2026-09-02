import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../../performance',
  testMatch: ['phase4c2-production-backend.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60 * 60 * 1000,
  expect: { timeout: 30_000 },
  reporter: [['line']],
  outputDir: '../../../docs/benchmarks/phase4c2_production_deploy/test-results',
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    headless: false,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
});
