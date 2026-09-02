import { expect, test, type Page } from '@playwright/test';
import {
  getBrowserMetrics,
  getExpectedPlotSnapshot,
  getParsedResponses,
  getPlotSnapshot,
  getProgressHistory,
  installBrowserInstrumentation,
  installDeterministicFetchRoute,
  probeResponsiveness,
  selectParameters,
} from './large-dataset-loading-fixture';

const PARAMETERS = [
  'ztp_315_object_temperature',
  'ztp_315_ambient_temperature',
  'package_number',
  'opt_3001_u5_light_intensity',
  'opt_3001_u4_light_intensity',
];

const diagnostics = (page: Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !message.text().includes('favicon.ico')
      && !message.text().includes('status of 404')
      && !message.text().includes('Error fetching data')
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
};

test.describe.serial('Phase 4 unchanged 300k boundary reproduction', () => {
  test.skip(
    process.env.PHASE4_RUN_BASELINE !== '1',
    'Baseline evidence is preserved; set PHASE4_RUN_BASELINE=1 to reproduce the pre-change guard.'
  );
  test('L1: 268,800 rows complete with exact plotted observations', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    const errors = diagnostics(page);
    await installBrowserInstrumentation(page);
    const fixture = await installDeterministicFetchRoute(page);

    await page.goto('/benchmarks/large-dataset-loading.html?sensors=40&parameters=1&days=14');
    await expect(page.getByText('(40/40)', { exact: true })).toBeVisible();
    await selectParameters(page, PARAMETERS.slice(0, 1));
    const startedAt = Date.now();
    await page.getByRole('button', { name: 'Fetch Data' }).click();
    await expect(page.locator('.js-plotly-plot')).toBeVisible({ timeout: 5 * 60 * 1000 });
    await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();

    const parsed = await getParsedResponses(page);
    const plot = await getPlotSnapshot(page);
    const result = {
      caseId: 'L1',
      plannedRows: 268_800,
      completed: true,
      totalMs: Date.now() - startedAt,
      requests: fixture.records,
      parsed,
      progress: await getProgressHistory(page),
      plot,
      browserMetrics: await getBrowserMetrics(page),
      responsivenessMs: await probeResponsiveness(page),
      errors,
    };
    console.log('PHASE4_BASELINE_RESULT', JSON.stringify(result));

    expect(fixture.records).toHaveLength(10);
    expect(fixture.records.reduce((sum, record) => sum + record.rows, 0)).toBe(268_800);
    expect(parsed.reduce((sum, response) => sum + response.rows, 0)).toBe(268_800);
    expect(plot.traceCount).toBe(40);
    expect(plot.pointCount).toBe(268_800);
    expect(plot).toEqual(getExpectedPlotSnapshot(40, PARAMETERS.slice(0, 1), 14));
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('L2: 336,000 rows parse fully before guard and old data reappears', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    const errors = diagnostics(page);
    await installBrowserInstrumentation(page);
    const fixture = await installDeterministicFetchRoute(page);

    await page.goto('/benchmarks/large-dataset-loading.html?sensors=20&parameters=5&days=7');
    await expect(page.getByText('(20/20)', { exact: true })).toBeVisible();
    await selectParameters(page, PARAMETERS.slice(0, 1));
    await page.getByRole('button', { name: 'Fetch Data' }).click();
    await expect(page.locator('.js-plotly-plot')).toBeVisible({ timeout: 3 * 60 * 1000 });
    const oldPlot = await getPlotSnapshot(page);
    expect(oldPlot.pointCount).toBe(67_200);

    const requestsBeforeOversize = fixture.records.length;
    const parsedBeforeOversize = (await getParsedResponses(page)).length;
    await selectParameters(page, PARAMETERS.slice(1));
    await page.getByRole('button', { name: 'Fetch Data' }).click();
    await expect(page.getByRole('alert')).toContainText('300,000', { timeout: 3 * 60 * 1000 });
    await expect(page.locator('.js-plotly-plot')).toBeVisible();
    const afterFailurePlot = await getPlotSnapshot(page);
    const parsed = (await getParsedResponses(page)).slice(parsedBeforeOversize);
    const progress = await getProgressHistory(page);
    const result = {
      caseId: 'L2',
      plannedRows: 336_000,
      completed: false,
      requests: fixture.records.slice(requestsBeforeOversize),
      parsed,
      progress,
      oldPlot,
      afterFailurePlot,
      staleDownloadVisible: await page.getByRole('button', { name: 'Download CSV' }).isVisible(),
      browserMetrics: await getBrowserMetrics(page),
      responsivenessMs: await probeResponsiveness(page),
      errors,
    };
    console.log('PHASE4_BASELINE_RESULT', JSON.stringify(result));

    expect(result.requests).toHaveLength(7);
    expect(parsed.reduce((sum, response) => sum + response.rows, 0)).toBe(336_000);
    expect(progress.some((entry) => entry.includes('288,000 rows loaded'))).toBe(true);
    expect(afterFailurePlot).toEqual(oldPlot);
    expect(result.staleDownloadVisible).toBe(true);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  for (const workload of [
    { caseId: 'L3', sensors: 26, parameters: 5, days: 8, plannedRows: 499_200 },
    { caseId: 'L4', sensors: 42, parameters: 5, days: 10, plannedRows: 1_008_000 },
  ]) {
    test(`${workload.caseId}: planned ${workload.plannedRows.toLocaleString()} stops after parsed boundary response`, async ({ page }) => {
      test.setTimeout(10 * 60 * 1000);
      const errors = diagnostics(page);
      await installBrowserInstrumentation(page);
      const fixture = await installDeterministicFetchRoute(page);
      await page.goto(
        `/benchmarks/large-dataset-loading.html?sensors=${workload.sensors}`
        + `&parameters=${workload.parameters}&days=${workload.days}`
      );
      await selectParameters(page, PARAMETERS);
      await page.getByRole('button', { name: 'Fetch Data' }).click();
      await expect(page.getByRole('alert')).toContainText('300,000', { timeout: 3 * 60 * 1000 });
      const parsed = await getParsedResponses(page);
      const result = {
        ...workload,
        completed: false,
        requests: fixture.records,
        parsed,
        progress: await getProgressHistory(page),
        browserMetrics: await getBrowserMetrics(page),
        responsivenessMs: await probeResponsiveness(page),
        errors,
      };
      console.log('PHASE4_BASELINE_RESULT', JSON.stringify(result));
      expect(fixture.records).toHaveLength(7);
      expect(parsed.reduce((sum, response) => sum + response.rows, 0)).toBe(336_000);
      expect(errors.consoleErrors).toEqual([]);
      expect(errors.pageErrors).toEqual([]);
    });
  }

  test('HTTP failure and cancellation leave old data without new-request provenance', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    const errors = diagnostics(page);
    await installBrowserInstrumentation(page);
    const fixture = await installDeterministicFetchRoute(page);
    await page.goto('/benchmarks/large-dataset-loading.html?sensors=20&parameters=2&days=7');
    await selectParameters(page, PARAMETERS.slice(0, 1));
    await page.getByRole('button', { name: 'Fetch Data' }).click();
    await expect(page.locator('.js-plotly-plot')).toBeVisible({ timeout: 3 * 60 * 1000 });
    const oldPlot = await getPlotSnapshot(page);

    await selectParameters(page, PARAMETERS.slice(1, 2));
    fixture.failRequestNumber = fixture.records.length + 2;
    await page.getByRole('button', { name: 'Fetch Data' }).click();
    await expect(page.getByRole('alert')).toContainText('HTTP 500', { timeout: 2 * 60 * 1000 });
    await expect.poll(() => getPlotSnapshot(page), { timeout: 60_000 }).toEqual(oldPlot);
    expect(await page.getByRole('button', { name: 'Download CSV' }).isVisible()).toBe(true);

    fixture.failRequestNumber = null;
    fixture.delayMs = 2_000;
    await page.getByRole('button', { name: 'Fetch Data' }).click();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.js-plotly-plot')).toBeVisible();
    await expect.poll(() => getPlotSnapshot(page), { timeout: 60_000 }).toEqual(oldPlot);
    expect(await page.getByRole('alert').count()).toBe(0);

    const result = {
      caseId: 'failure-cancellation',
      oldPlot,
      records: fixture.records,
      parsed: await getParsedResponses(page),
      progress: await getProgressHistory(page),
      oldDownloadVisible: await page.getByRole('button', { name: 'Download CSV' }).isVisible(),
      noCancelledStateVisible: await page.getByText(/cancelled/i).count() === 0,
      errors,
    };
    console.log('PHASE4_BASELINE_RESULT', JSON.stringify(result));
    expect(result.oldDownloadVisible).toBe(true);
    expect(result.noCancelledStateVisible).toBe(true);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});
