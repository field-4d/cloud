import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIRECTORY = path.resolve(
  'docs/benchmarks/phase4b0_backend_pull_performance'
);
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, 'browser-results.json');

test('measure real R1-R3 browser pull stages without persisting rows', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  const workloads = ['R1', 'R2', 'R3'] as const;
  const results: unknown[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !message.text().includes('favicon.ico')
      && !message.text().includes('status of 404')
    ) {
      consoleErrors.push(message.text());
    }
  });

  for (const workload of workloads) {
    await page.goto(
      `/benchmarks/phase4b0-backend-pull-audit.html?workload=${workload}`
    );
    await expect(page.getByTestId('phase4b0-status')).toHaveText('ready');
    await page.getByRole('button', { name: 'Run read-only pull' }).click();
    await page.waitForFunction(
      () => {
        const status = document.querySelector('[data-testid="phase4b0-status"]')
          ?.textContent ?? '';
        return status.startsWith('complete:') || status.startsWith('failed:');
      },
      undefined,
      { timeout: 10 * 60 * 1000 }
    );
    const captured = await page.evaluate(() => ({
      result: window.__phase4b0BrowserResult ?? null,
      error: window.__phase4b0BrowserError ?? null,
      status: document.querySelector('[data-testid="phase4b0-status"]')
        ?.textContent ?? null,
    }));
    console.log('PHASE4B0_BROWSER_RESULT', JSON.stringify(captured));
    expect(captured.error).toBeNull();
    expect(captured.result).not.toBeNull();
    results.push(captured.result);
  }

  const output = {
    audit: 'FIELD4D_PHASE4B0_BACKEND_PULL_PERFORMANCE_AUDIT',
    generatedAt: new Date().toISOString(),
    safety: {
      rawRowsPersisted: false,
      credentialsOrTokensPersisted: false,
      bigQueryWrites: false,
    },
    browser: await page.evaluate(() => navigator.userAgent),
    results,
    pageErrors,
    consoleErrors,
  };
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
