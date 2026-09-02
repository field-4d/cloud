import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIRECTORY = path.resolve(
  'docs/benchmarks/adaptive_page_size_reoptimization'
);
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, 'browser-results.json');
const pageSizes = (process.env.ADAPTIVE_PAGE_SIZES
  ?? '20000,25000,40000,60000,80000,100000,125000,150000,200000,250000,300000,400000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value > 0);

async function runOnce(page: import('@playwright/test').Page, pageSize: number) {
  await page.goto(`/benchmarks/adaptive-page-size.html?pageSize=${pageSize}`);
  await expect(page.getByTestId('adaptive-status')).toHaveText('ready');
  await page.getByRole('button', { name: 'Run adaptive page-size pull' }).click();
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-testid="adaptive-status"]')?.textContent ?? '';
    return text.startsWith('complete:') || text.startsWith('failed:');
  }, undefined, { timeout: 20 * 60 * 1000 });
  const captured = await page.evaluate(() => ({
    result: window.__adaptivePageSizeResult ?? null,
    error: window.__adaptivePageSizeError ?? null,
  }));
  expect(captured.error).toBeNull();
  expect(captured.result).not.toBeNull();
  expect(captured.result?.rows).toBe(711_269);
  expect(captured.result?.pages).toBe(Math.ceil(711_269 / pageSize));
  expect(captured.result?.complete).toBe(true);
  await expect(page.locator('.js-plotly-plot')).toBeVisible();
  return captured.result as Record<string, unknown>;
}

test('measure real adaptive page sizes in headed Chromium', async ({ page }) => {
  test.setTimeout(3 * 60 * 60 * 1000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responseFailures: Array<{ url: string; status: number }> = [];
  const activeFetchPaths = new Set<string>();
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
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes('fetch-data')) activeFetchPaths.add(url.pathname);
    if (response.status() >= 400) {
      responseFailures.push({ url: response.url(), status: response.status() });
    }
  });

  let previous: {
    results?: Array<Record<string, unknown>>;
    activeFetchPaths?: string[];
  } = {};
  try {
    previous = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  } catch {
    previous = {};
  }
  const results = previous.results ?? [];
  for (const value of previous.activeFetchPaths ?? []) activeFetchPaths.add(value);
  const completedSizes = new Set(results.map((result) => Number(result.pageSize)));
  const pendingSizes = pageSizes.filter((pageSize) => !completedSizes.has(pageSize));
  for (const pageSize of pendingSizes) {
    console.log(`ADAPTIVE_PAGE_SIZE_BROWSER pageSize=${pageSize}`);
    const result = await runOnce(page, pageSize);
    results.push(result);
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify({
      benchmark: 'FIELD4D_ADAPTIVE_PAGE_SIZE_HEADED_BROWSER',
      generatedAt: new Date().toISOString(),
      headedChromium: true,
      pageSizes,
      safety: {
        benchmarkOnlyBackend: true,
        rawRowsPersisted: false,
        bigQueryWrites: false,
      },
      results,
      activeFetchPaths: [...activeFetchPaths],
      pageErrors,
      consoleErrors,
      responseFailures,
    }, null, 2)}\n`, 'utf8');
  }

  if (pendingSizes.length > 0) {
    const graph = page.locator('.js-plotly-plot');
    const before = await graph.evaluate((element: any) => element.layout.xaxis.range ?? null);
    await graph.evaluate((element: any) => {
      const plotly = (window as any).Plotly;
      const values = element.data[0].x;
      return plotly.relayout(element, {
        'xaxis.range': [
          values[Math.floor(values.length * 0.2)],
          values[Math.floor(values.length * 0.8)],
        ],
      });
    });
    const after = await graph.evaluate((element: any) => element.layout.xaxis.range ?? null);
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
    const legend = page.locator('.legendtoggle').first();
    await legend.click({ force: true });
    await legend.click({ force: true });
  }

  expect([...activeFetchPaths]).toEqual(['/api/v2/fetch-data-page']);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(responseFailures).toEqual([]);
});
