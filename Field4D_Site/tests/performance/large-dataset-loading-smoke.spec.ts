import { expect, test } from '@playwright/test';
import {
  getCompletedDatasetSnapshot,
  getExpectedDatasetSnapshot,
  getExpectedPlotSnapshot,
  getParsedResponses,
  getPlotSnapshot,
  installBrowserInstrumentation,
  installDeterministicFetchRoute,
  selectParameters,
} from './large-dataset-loading-fixture';

test('Phase 4 bounded complete-state and exact-equivalence smoke', async ({ page }) => {
  test.setTimeout(3 * 60 * 1000);
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

  await installBrowserInstrumentation(page);
  const fixture = await installDeterministicFetchRoute(page);
  const parameter = 'ztp_315_object_temperature';
  await page.goto('/benchmarks/large-dataset-loading.html?sensors=5&parameters=1&days=1');
  await selectParameters(page, [parameter]);
  await page.getByRole('button', { name: 'Fetch Data' }).click();
  await expect(page.getByText(/Complete dataset: 2,400 raw rows/)).toBeVisible();
  await expect(page.locator('.js-plotly-plot')).toBeVisible();
  await expect.poll(() => getPlotSnapshot(page), { timeout: 60_000 }).toEqual(
    getExpectedPlotSnapshot(5, [parameter], 1)
  );

  expect(fixture.records).toHaveLength(1);
  expect((await getParsedResponses(page)).map(({ rows }) => rows)).toEqual([2_400]);
  expect(await getCompletedDatasetSnapshot(page)).toEqual(
    getExpectedDatasetSnapshot(5, [parameter], 1)
  );
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
