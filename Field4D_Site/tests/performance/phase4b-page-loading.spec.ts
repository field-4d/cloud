import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  getCompletedDatasetSnapshot,
  getExpectedDatasetSnapshot,
  getExpectedPlotSnapshot,
  getLongTaskSummary,
  getPlotSnapshot,
  installBrowserInstrumentation,
  installDeterministicPageRoute,
  probeResponsiveness,
  selectParameters,
  startBrowserMetrics,
} from './large-dataset-loading-fixture';

const parameter = 'ztp_315_object_temperature';
const PRODUCTION_PAGE_SIZE = 100_000;

const collectPageErrors = (page: import('@playwright/test').Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !message.text().includes('favicon.ico')
      && !message.text().includes('status of 404')
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
};

test('Phase 4B paged consumer is exact, complete, and bounded to concurrency two', async ({ page }) => {
  const errors = collectPageErrors(page);
  await installBrowserInstrumentation(page);
  const fixture = await installDeterministicPageRoute(page);
  fixture.delayMs = 20;
  await page.goto(
    '/benchmarks/large-dataset-loading.html?sensors=5&parameters=1&days=1'
    + '&transport=paged&concurrency=2&pageSize=500'
  );
  await selectParameters(page, [parameter]);
  await page.getByRole('button', { name: 'Fetch Data' }).click();
  await expect(page.getByText(/Complete dataset: 2,400 raw rows from 5 of 5 pages/)).toBeVisible();
  await expect.poll(() => getCompletedDatasetSnapshot(page)).toEqual(
    getExpectedDatasetSnapshot(5, [parameter], 1)
  );
  await expect.poll(() => getPlotSnapshot(page), { timeout: 60_000 }).toEqual(
    getExpectedPlotSnapshot(5, [parameter], 1)
  );
  expect(fixture.records.filter(({ outcome }) => outcome === 'fulfilled')).toHaveLength(5);
  expect(fixture.records.reduce((sum, record) => sum + record.rows, 0)).toBe(2_400);
  expect(fixture.maxInFlight).toBe(2);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test('Phase 4B retries the same failed cursor without missing or duplicate rows', async ({ page }) => {
  const errors = collectPageErrors(page);
  await installBrowserInstrumentation(page);
  const fixture = await installDeterministicPageRoute(page);
  fixture.failOncePageSequence = 2;
  await page.goto(
    '/benchmarks/large-dataset-loading.html?sensors=3&parameters=1&days=1'
    + '&transport=paged&concurrency=1&pageSize=400'
  );
  await selectParameters(page, [parameter]);
  await page.getByRole('button', { name: 'Fetch Data' }).click();
  await expect(page.getByText(/Complete dataset: 1,440 raw rows from 4 of 4 pages/)).toBeVisible();
  await expect.poll(() => getCompletedDatasetSnapshot(page)).toEqual(
    getExpectedDatasetSnapshot(3, [parameter], 1)
  );
  const failed = fixture.records.find(({ outcome }) => outcome === 'failed');
  expect(failed).toBeDefined();
  const retry = fixture.records.find(
    ({ outcome, cursor }) => outcome === 'fulfilled' && cursor === failed?.cursor
  );
  expect(retry).toBeDefined();
  expect(fixture.records.filter(({ outcome }) => outcome === 'fulfilled')).toHaveLength(4);
  expect(fixture.maxInFlight).toBe(1);
  expect(errors.consoleErrors).toHaveLength(1);
  expect(errors.consoleErrors[0]).toContain('status of 503');
  expect(errors.pageErrors).toEqual([]);
});

test('Phase 4B cancellation keeps the previous complete dataset and a later request recovers', async ({ page }) => {
  const errors = collectPageErrors(page);
  await installBrowserInstrumentation(page);
  const fixture = await installDeterministicPageRoute(page);
  await page.goto(
    '/benchmarks/large-dataset-loading.html?sensors=2&parameters=1&days=1'
    + '&transport=paged&concurrency=1&pageSize=300'
  );
  await selectParameters(page, [parameter]);
  await page.getByRole('button', { name: 'Fetch Data' }).click();
  await expect(page.getByText(/Complete dataset: 960 raw rows from 4 of 4 pages/)).toBeVisible();
  const completeBefore = await getCompletedDatasetSnapshot(page);

  fixture.delayMs = 200;
  await page.getByRole('button', { name: 'Fetch Data' }).click();
  await expect(page.getByTestId('fetch-progress')).toContainText('Page 1');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(/New data request cancelled/)).toBeVisible();
  expect(await getCompletedDatasetSnapshot(page)).toEqual(completeBefore);

  fixture.delayMs = 0;
  await page.getByRole('button', { name: 'Fetch Data' }).click();
  await expect(page.getByText(/Complete dataset: 960 raw rows from 4 of 4 pages/)).toBeVisible();
  expect(await getCompletedDatasetSnapshot(page)).toEqual(completeBefore);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test('Phase 4B B5 browser completes with the 100K policy and preserves 2.88M deterministic rows', async ({ page }, testInfo) => {
  test.setTimeout(20 * 60 * 1000);
  const errors = collectPageErrors(page);
  const crashes: string[] = [];
  page.on('crash', () => crashes.push('page crashed'));
  await installBrowserInstrumentation(page);
  const fixture = await installDeterministicPageRoute(page);
  const parameters = [
    'ztp_315_object_temperature',
    'ztp_315_ambient_temperature',
    'package_number',
    'opt_3001_u5_light_intensity',
  ];
  const expectedCanonical = getExpectedDatasetSnapshot(50, parameters, 30);
  const expectedPageCount = Math.ceil(expectedCanonical.rowCount / PRODUCTION_PAGE_SIZE);
  const expectedFinalPageRows = expectedCanonical.rowCount
    - PRODUCTION_PAGE_SIZE * (expectedPageCount - 1);
  await page.goto(
    '/benchmarks/large-dataset-loading.html?sensors=50&parameters=4&days=30'
    + `&maxRows=3000000&transport=paged&concurrency=1&pageSize=${PRODUCTION_PAGE_SIZE}`
  );
  await selectParameters(page, parameters);
  const finishBrowserMetrics = await startBrowserMetrics(page);
  const startedAt = Date.now();
  await page.getByRole('button', { name: 'Fetch Data' }).click();
  await expect(
    page.getByText(new RegExp(
      `Complete dataset: 2,880,000 raw rows from ${expectedPageCount} of ${expectedPageCount} pages`
    ))
  ).toBeVisible({ timeout: 12 * 60 * 1000 });
  await page.waitForFunction(() => (
    (window as typeof window & { __phase4ScatterResults?: unknown[] })
      .__phase4ScatterResults?.length ?? 0
  ) > 0, undefined, { timeout: 5 * 60 * 1000 });

  const canonical = await getCompletedDatasetSnapshot(page);
  const plot = await getPlotSnapshot(page);
  const expectedPlot = getExpectedPlotSnapshot(50, parameters, 30);
  const result = {
    rows: canonical.rowCount,
    pages: fixture.records.filter(({ outcome }) => outcome === 'fulfilled').length,
    fixtureRows: fixture.records.reduce((sum, record) => sum + record.rows, 0),
    maxInFlight: fixture.maxInFlight,
    totalMs: Date.now() - startedAt,
    canonical,
    expectedCanonical,
    plot,
    expectedPlot,
    browserMetrics: await finishBrowserMetrics(),
    longTasks: await getLongTaskSummary(page),
    responsivenessMs: await probeResponsiveness(page),
    consoleErrors: errors.consoleErrors,
    pageErrors: errors.pageErrors,
    crashes,
  };
  writeFileSync(
    testInfo.outputPath('browser-b5-result.json'),
    JSON.stringify(result, null, 2)
  );

  const fulfilled = fixture.records.filter(({ outcome }) => outcome === 'fulfilled');
  expect(fulfilled).toHaveLength(expectedPageCount);
  expect(fulfilled[0].requestedPageSize).toBe(PRODUCTION_PAGE_SIZE);
  expect(fulfilled.slice(1).every(({ requestedPageSize }) => requestedPageSize === null)).toBe(true);
  expect(fulfilled.every(({ effectivePageSize }) => effectivePageSize === PRODUCTION_PAGE_SIZE)).toBe(true);
  expect(fulfilled.slice(0, -1).every(({ rows }) => rows === PRODUCTION_PAGE_SIZE)).toBe(true);
  expect(fulfilled[fulfilled.length - 1]?.rows).toBe(expectedFinalPageRows);
  expect(fulfilled.map(({ pageSequence }) => pageSequence)).toEqual(
    Array.from({ length: expectedPageCount }, (_, index) => index + 1)
  );
  expect(fulfilled[0].cursor).toBeNull();
  expect(fulfilled.slice(1).every(({ cursor }) => typeof cursor === 'string')).toBe(true);
  expect(result.fixtureRows).toBe(2_880_000);
  expect(fixture.maxInFlight).toBe(1);
  expect(canonical).toEqual(expectedCanonical);
  expect(plot).toEqual(expectedPlot);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(crashes).toEqual([]);
});
