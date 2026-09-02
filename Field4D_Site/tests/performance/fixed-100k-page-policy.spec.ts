import { expect, test, type Page } from '@playwright/test';
import {
  getCompletedDatasetSnapshot,
  getExpectedDatasetSnapshot,
  getExpectedPlotSnapshot,
  getParsedResponses,
  getPlotSnapshot,
  getProgressHistory,
  installBrowserInstrumentation,
  installDeterministicPageRoute,
  selectParameters,
} from './large-dataset-loading-fixture';

const parameters = [
  'ztp_315_object_temperature',
  'ztp_315_ambient_temperature',
  'package_number',
  'opt_3001_u5_light_intensity',
  'opt_3001_u4_light_intensity',
];

const collectErrors = (page: Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
};

test('production-default paged consumer requests 100K and completes a final partial page exactly', async ({ page }) => {
  const errors = collectErrors(page);
  await installBrowserInstrumentation(page);
  const fixture = await installDeterministicPageRoute(page);
  await page.goto(
    '/benchmarks/large-dataset-loading.html?sensors=20&parameters=5&days=6'
    + '&maxRows=400000&transport=paged&concurrency=1'
  );
  await selectParameters(page, parameters);

  await page.getByRole('button', { name: 'Fetch Data' }).click();
  await expect(
    page.getByText(/Complete dataset: 288,000 raw rows from 3 of 3 pages/)
  ).toBeVisible({ timeout: 3 * 60 * 1000 });

  const fulfilled = fixture.records.filter(({ outcome }) => outcome === 'fulfilled');
  expect(fulfilled).toHaveLength(3);
  expect(fulfilled.map(({ rows }) => rows)).toEqual([100_000, 100_000, 88_000]);
  expect(fulfilled.map(({ effectivePageSize }) => effectivePageSize)).toEqual([
    100_000,
    100_000,
    100_000,
  ]);
  expect(fulfilled[0].requestedPageSize).toBe(100_000);
  expect(fulfilled.slice(1).map(({ requestedPageSize }) => requestedPageSize)).toEqual([
    null,
    null,
  ]);
  expect(fixture.maxInFlight).toBe(1);

  await expect.poll(() => getCompletedDatasetSnapshot(page)).toEqual(
    getExpectedDatasetSnapshot(20, parameters, 6)
  );
  await expect.poll(() => getPlotSnapshot(page), { timeout: 2 * 60 * 1000 }).toEqual(
    getExpectedPlotSnapshot(20, parameters, 6)
  );

  const responses = await getParsedResponses(page);
  expect(responses).toHaveLength(3);
  expect(responses.every(({ url }) => url.includes('/api/v2/fetch-data-page'))).toBe(true);
  expect(responses.some(({ url }) => url.includes('/api/v2/fetch-data/page'))).toBe(false);
  expect(responses.some(({ url }) => url.endsWith('/api/fetch-data'))).toBe(false);
  expect((await getProgressHistory(page)).some((message) => message.includes('Page 2'))).toBe(true);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});
