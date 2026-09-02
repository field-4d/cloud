import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type WorkloadId = 'C0-A' | 'C0-B' | 'C0-C';

const BACKEND = 'https://f4d-fastapi-backend-1000435921680.us-central1.run.app';
const OUTPUT_DIRECTORY = path.resolve('docs/benchmarks/phase4c2_production_deploy');
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, 'browser-e2e-results.json');
const EXPECTED_ROWS: Record<WorkloadId, number> = {
  'C0-A': 95_788,
  'C0-B': 287_360,
  'C0-C': 711_269,
};
const REPETITIONS: Record<WorkloadId, number> = {
  'C0-A': 1,
  'C0-B': 1,
  'C0-C': 3,
};

interface NetworkRecord {
  method: string;
  url: string;
  path: string;
  name: string;
  status: number;
}

async function runOnce(page: import('@playwright/test').Page, workloadId: WorkloadId) {
  const network: NetworkRecord[] = [];
  const responseHandler = (response: import('@playwright/test').Response) => {
    const url = new URL(response.url());
    if (url.pathname.includes('fetch-data')) {
      network.push({
        method: response.request().method(),
        url: response.url(),
        path: url.pathname,
        name: url.pathname.split('/').at(-1) ?? '',
        status: response.status(),
      });
    }
  };
  page.on('response', responseHandler);
  try {
    await page.goto(`/benchmarks/phase4c0-stage-decomposition.html?workload=${workloadId}`);
    await expect(page.getByTestId('phase4c0-status')).toHaveText('ready');
    await page.getByRole('button', { name: 'Run read-only paged pull' }).click();
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-testid="phase4c0-status"]')?.textContent ?? '';
      return text.startsWith('complete:') || text.startsWith('failed:');
    }, undefined, { timeout: 15 * 60 * 1000 });
    const captured = await page.evaluate(() => ({
      result: window.__phase4c0Result ?? null,
      error: window.__phase4c0Error ?? null,
    }));
    expect(captured.error).toBeNull();
    expect(captured.result).not.toBeNull();
    const result = captured.result as Record<string, unknown>;
    expect(result.rows).toBe(EXPECTED_ROWS[workloadId]);
    expect(result.complete).toBe(true);
    expect(result.endpoint).toBe(`${BACKEND}/api/v2/fetch-data-page`);
    expect(network.length).toBeGreaterThan(0);
    expect(network.every((item) => item.method === 'POST')).toBe(true);
    expect(network.every((item) => item.status === 200)).toBe(true);
    expect(network.every((item) => item.path === '/api/v2/fetch-data-page')).toBe(true);
    expect(network.every((item) => item.name === 'fetch-data-page')).toBe(true);
    return { ...result, network };
  } finally {
    page.off('response', responseHandler);
  }
}

test('measure Phase 4C.2 production backend through plot in headed Chromium', async ({ page }) => {
  test.setTimeout(60 * 60 * 1000);
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

  console.log('PHASE4C2_PRODUCTION_BROWSER_WARMUP C0-A');
  await runOnce(page, 'C0-A');
  const results: Record<WorkloadId, Array<Record<string, unknown>>> = {
    'C0-A': [], 'C0-B': [], 'C0-C': [],
  };
  for (const workloadId of Object.keys(REPETITIONS) as WorkloadId[]) {
    for (let repetition = 1; repetition <= REPETITIONS[workloadId]; repetition += 1) {
      console.log(`PHASE4C2_PRODUCTION_BROWSER_MEASURED ${workloadId} repetition=${repetition}`);
      const result = await runOnce(page, workloadId);
      results[workloadId].push({ repetition, ...result });
      await mkdir(OUTPUT_DIRECTORY, { recursive: true });
      await writeFile(OUTPUT_PATH, `${JSON.stringify({
        benchmark: 'FIELD4D_PHASE4C2_PRODUCTION_BACKEND_DEPLOY',
        generatedAt: new Date().toISOString(),
        headedChromium: true,
        frontendOrigin: 'http://localhost:5173',
        backendOrigin: BACKEND,
        revision: 'f4d-fastapi-backend-00017-g7j',
        safety: {
          rawRowsPersisted: false,
          bigQueryWrites: false,
          frontendDeployed: false,
        },
        results,
        pageErrors,
        consoleErrors,
      }, null, 2)}\n`, 'utf8');
    }
  }

  await page.goto('/benchmarks/phase4c0-stage-decomposition.html?workload=C0-A');
  await page.getByRole('button', { name: 'Run read-only paged pull' }).click();
  await page.waitForFunction(() => window.__phase4c0Result?.rows === 95_788, undefined, {
    timeout: 5 * 60 * 1000,
  });
  const graph = page.locator('.js-plotly-plot');
  await expect(graph).toBeVisible();
  const before = await graph.evaluate((element: any) => element.layout.xaxis.range ?? null);
  await graph.evaluate((element: any) => {
    const plotly = (window as any).Plotly;
    const values = element.data[0].x;
    return plotly.relayout(element, {
      'xaxis.range': [values[Math.floor(values.length * 0.2)], values[Math.floor(values.length * 0.8)]],
    });
  });
  const after = await graph.evaluate((element: any) => element.layout.xaxis.range ?? null);
  expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  const firstLegend = page.locator('.legendtoggle').first();
  await firstLegend.click({ force: true });
  await firstLegend.click({ force: true });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
