import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../../auth',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    headless: false,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    cwd: '../../..',
    command: 'npm --prefix frontend run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
