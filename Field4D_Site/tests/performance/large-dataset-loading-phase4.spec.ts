import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  getCompletedDatasetSnapshot,
  getExpectedDatasetSnapshot,
  getExpectedPlotSnapshot,
  getFetchBenchmarkEvents,
  getLongTaskSummary,
  getParsedResponses,
  getPlotSnapshot,
  getPlotTraceSamples,
  getProgressHistory,
  getScatterBenchmarkResults,
  installBrowserInstrumentation,
  installDeterministicFetchRoute,
  probeResponsiveness,
  selectParameters,
  startBrowserMetrics,
} from './large-dataset-loading-fixture';

const PARAMETERS = [
  'ztp_315_object_temperature',
  'ztp_315_ambient_temperature',
  'package_number',
  'opt_3001_u5_light_intensity',
  'opt_3001_u4_light_intensity',
];
const rawResultsPath = resolve(
  'docs/benchmarks/phase4_large_dataset_loading/raw-results.json'
);
const postChangeResults: unknown[] = [];

test.afterAll(() => {
  let baseline: unknown = null;
  try {
    baseline = JSON.parse(readFileSync(rawResultsPath, 'utf8')).baseline;
  } catch {
    baseline = null;
  }
  mkdirSync(dirname(rawResultsPath), { recursive: true });
  writeFileSync(rawResultsPath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseline,
    postChange: postChangeResults,
  }, null, 2));
});

interface BrowserDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  crashes: string[];
}

const captureDiagnostics = (page: Page): BrowserDiagnostics => {
  const diagnostics: BrowserDiagnostics = { consoleErrors: [], pageErrors: [], crashes: [] };
  page.on('console', (message) => {
    const text = message.text();
    if (
      message.type() === 'error'
      && !text.includes('favicon.ico')
      && !text.includes('status of 404')
      && !text.includes('status of 500')
      && !text.includes('500 (Internal Server Error)')
      && !text.includes('Error fetching data')
    ) {
      diagnostics.consoleErrors.push(text);
    }
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('crash', () => diagnostics.crashes.push('page crashed'));
  return diagnostics;
};

const validateLegendInteraction = async (page: Page) => {
  const firstLegendToggle = page.locator('.legendtoggle').first();
  await expect(firstLegendToggle).toBeVisible();
  await firstLegendToggle.click();
  await expect.poll(() => page.evaluate(() => {
    const graph = document.querySelector('.js-plotly-plot') as HTMLElement & {
      data?: Array<{ visible?: unknown }>;
    };
    return graph.data?.[0]?.visible;
  })).toBe('legendonly');
  await firstLegendToggle.click();
};

test.describe.serial('Phase 4 safe large dataset loading', () => {
  const cases = [
    { caseId: 'L1', sensors: 40, parameters: 1, days: 14, rows: 268_800, requests: 10 },
    { caseId: 'L2', sensors: 20, parameters: 5, days: 7, rows: 336_000, requests: 7 },
    { caseId: 'L3', sensors: 26, parameters: 5, days: 8, rows: 499_200, requests: 11 },
    { caseId: 'L4', sensors: 42, parameters: 5, days: 10, rows: 1_008_000, requests: 24 },
  ];

  for (const workload of cases) {
    test(`${workload.caseId}: complete exact raw dataset and render`, async ({ page }) => {
      test.setTimeout(12 * 60 * 1000);
      const diagnostics = captureDiagnostics(page);
      await installBrowserInstrumentation(page);
      const fixture = await installDeterministicFetchRoute(page);
      await page.goto(
        `/benchmarks/large-dataset-loading.html?sensors=${workload.sensors}`
        + `&parameters=${workload.parameters}&days=${workload.days}`
      );
      await expect(page.getByText(`(${workload.sensors}/${workload.sensors})`, { exact: true })).toBeVisible();
      const selectedParameters = PARAMETERS.slice(0, workload.parameters);
      await selectParameters(page, selectedParameters);
      if (workload.rows > 300_000) {
        await expect(page.getByTestId('large-request-warning')).toContainText(
          `estimated ${workload.rows.toLocaleString()} raw rows`
        );
      }
      const finishBrowserMetrics = await startBrowserMetrics(page);
      const startedAt = Date.now();
      await page.getByRole('button', { name: 'Fetch Data' }).click();
      await expect(page.getByText(new RegExp(`Complete dataset: ${workload.rows.toLocaleString()} raw rows`)))
        .toBeVisible({ timeout: 8 * 60 * 1000 });
      await expect(page.locator('.js-plotly-plot')).toBeVisible();
      await page.waitForFunction(() => (
        (window as typeof window & { __phase4ScatterResults?: unknown[] }).__phase4ScatterResults?.length ?? 0
      ) > 0, undefined, { timeout: 3 * 60 * 1000 });

      const parsed = await getParsedResponses(page);
      const canonical = await getCompletedDatasetSnapshot(page);
      const expectedCanonical = getExpectedDatasetSnapshot(
        workload.sensors,
        selectedParameters,
        workload.days
      );
      const plot = await getPlotSnapshot(page);
      const renderedParameterOrder = fixture.records[0].selectedParameters;
      const expectedPlot = getExpectedPlotSnapshot(
        workload.sensors,
        renderedParameterOrder,
        workload.days
      );
      if (workload.caseId === 'L2') {
        await validateLegendInteraction(page);
      }
      const result = {
        ...workload,
        completed: true,
        totalMs: Date.now() - startedAt,
        requests: fixture.records,
        responseBytes: fixture.records.reduce((sum, record) => sum + record.responseBytes, 0),
        parsed,
        parseMs: parsed.reduce((sum, response) => sum + response.parseMs, 0),
        canonical,
        expectedCanonical,
        plot,
        plotTraceSamples: await getPlotTraceSamples(page),
        expectedPlot,
        fetchEvents: await getFetchBenchmarkEvents(page),
        scatterResults: await getScatterBenchmarkResults(page),
        progress: await getProgressHistory(page),
        browserMetrics: await finishBrowserMetrics(),
        longTasks: await getLongTaskSummary(page),
        responsivenessMs: await probeResponsiveness(page),
        diagnostics,
      };
      console.log('PHASE4_RESULT', JSON.stringify(result));
      postChangeResults.push(result);

      expect(fixture.records).toHaveLength(workload.requests);
      expect(fixture.records.reduce((sum, record) => sum + record.rows, 0)).toBe(workload.rows);
      expect(parsed.reduce((sum, response) => sum + response.rows, 0)).toBe(workload.rows);
      expect(canonical).toEqual(expectedCanonical);
      expect(plot).toEqual(expectedPlot);
      expect(await page.getByRole('alert').count()).toBe(0);
      expect(diagnostics.consoleErrors).toEqual([]);
      expect(diagnostics.pageErrors).toEqual([]);
      expect(diagnostics.crashes).toEqual([]);
    });
  }

  test('failed and cancelled requests preserve explicit previous-dataset provenance', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    const diagnostics = captureDiagnostics(page);
    await installBrowserInstrumentation(page);
    const fixture = await installDeterministicFetchRoute(page);
    await page.goto('/benchmarks/large-dataset-loading.html?sensors=20&parameters=2&days=7');
    await selectParameters(page, PARAMETERS.slice(0, 1));
    await page.getByRole('button', { name: 'Fetch Data' }).click();
    await expect(page.getByText(/Complete dataset: 67,200 raw rows/)).toBeVisible({ timeout: 3 * 60 * 1000 });
    await page.waitForFunction(() => (
      (window as typeof window & { __phase4ScatterResults?: unknown[] }).__phase4ScatterResults?.length ?? 0
    ) > 0, undefined, { timeout: 60_000 });
    const oldCanonical = await getCompletedDatasetSnapshot(page);
    const oldPlot = await getPlotSnapshot(page);
    expect(oldPlot).toEqual(getExpectedPlotSnapshot(20, PARAMETERS.slice(0, 1), 7));

    await selectParameters(page, PARAMETERS.slice(1, 2));
    await expect(page.getByTestId('dataset-provenance')).toContainText('not the result of the current selection');
    fixture.failRequestNumber = fixture.records.length + 2;
    await page.getByRole('button', { name: 'Fetch Data' }).click();
    await expect(page.getByRole('alert')).toContainText('HTTP 500', { timeout: 2 * 60 * 1000 });
    await expect(page.getByTestId('dataset-provenance')).toContainText('failed request');
    await expect.poll(() => getPlotSnapshot(page), { timeout: 60_000 }).toEqual(oldPlot);
    expect(await getCompletedDatasetSnapshot(page)).toEqual(oldCanonical);
    await expect(page.getByRole('button', { name: 'Download previous completed CSV' })).toBeVisible();

    fixture.failRequestNumber = null;
    fixture.delayMs = 2_000;
    await page.getByRole('button', { name: 'Fetch Data' }).click();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('New data request cancelled. No incomplete rows were published.')).toBeVisible();
    await expect(page.getByTestId('dataset-provenance')).toContainText('cancelled request');
    await expect.poll(() => getPlotSnapshot(page), { timeout: 60_000 }).toEqual(oldPlot);
    expect(await getCompletedDatasetSnapshot(page)).toEqual(oldCanonical);

    const result = {
      caseId: 'failure-cancellation',
      oldCanonical,
      oldPlot,
      requests: fixture.records,
      parsed: await getParsedResponses(page),
      fetchEvents: await getFetchBenchmarkEvents(page),
      provenance: await page.getByTestId('dataset-provenance').textContent(),
      diagnostics,
    };
    console.log('PHASE4_RESULT', JSON.stringify(result));
    postChangeResults.push(result);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.crashes).toEqual([]);
  });
});
