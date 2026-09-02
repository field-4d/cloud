import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../../performance',
  testMatch: 'scatter-renderer-benchmark.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90 * 60 * 1000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['line']],
  outputDir: '../../../docs/benchmarks/phase1_scatter_vs_scattergl/test-results',
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
    command: 'npm --prefix frontend run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/benchmarks/scatter-renderer.html',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
