import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../../performance',
  testMatch: [
    'scatter-trace-preparation-smoke.spec.ts',
    'scatter-trace-preparation-benchmark.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90 * 60 * 1000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['line']],
  outputDir: '../../../docs/benchmarks/phase2_indexed_trace_preparation/test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: false,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    cwd: '../../..',
    command: 'node tests/performance/startPhase2Vite.mjs',
    url: 'http://127.0.0.1:4173/benchmarks/scatter-renderer.html',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
