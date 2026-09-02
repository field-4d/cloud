import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type CaseId = 'A' | 'B' | 'C' | 'D';
type ScenarioId = 'E' | 'F' | 'G' | 'H' | 'I';
type PipelineMode = 'baseline' | 'optimized';

const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'docs', 'benchmarks', 'phase3_frontend_recomputation');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');
const RAW_RESULTS_PATH = path.join(OUTPUT_DIR, 'raw-results.json');
const REPETITIONS = 7;
const TIMING_MATRIX: Array<[CaseId, ScenarioId]> = [
  ['A', 'E'], ['B', 'E'], ['C', 'E'], ['D', 'E'], ['B', 'F'], ['B', 'G'], ['B', 'H'], ['B', 'I'],
];
const EXPECTED_CASE_HASHES: Record<CaseId, string> = {
  A: 'f7f58dcd', B: '46c1bb7e', C: '14a8e85c', D: 'eb3d147c',
};

function round(value: number): number {
  return Number(value.toFixed(3));
}

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p90: round(sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)]),
  };
}

async function call<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ({ methodName, methodArgs }) => {
    const api = (window as any).field4dPhase3Benchmark;
    if (!api || typeof api[methodName] !== 'function') throw new Error(`Missing Phase 3 API: ${methodName}`);
    return api[methodName](...methodArgs);
  }, { methodName: method, methodArgs: args });
}

async function clickModebarButton(page: Page, titleFragment: string) {
  const buttons = page.locator('.modebar-btn');
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    const title = (await button.getAttribute('data-title')) ?? '';
    if (title.toLowerCase().includes(titleFragment.toLowerCase())) {
      await button.click({ force: true });
      return title;
    }
  }
  throw new Error(`Modebar button containing ${titleFragment} was not found.`);
}

async function dragPlot(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const layer = page.locator('.nsewdrag').first();
  const box = await layer.boundingBox();
  if (!box) throw new Error('Plot drag layer has no bounding box.');
  await page.mouse.move(box.x + box.width * start.x, box.y + box.height * start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end.x, box.y + box.height * end.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function validateHover(page: Page) {
  const layer = page.locator('.nsewdrag').first();
  const box = await layer.boundingBox();
  if (!box) return false;
  for (const x of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    for (const y of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
      await page.waitForTimeout(50);
      if (await page.locator('.hoverlayer .hovertext').count()) return true;
    }
  }
  return false;
}

async function validateInteractions(page: Page) {
  await call(page, 'prepare', 'B', 'E');
  const run = await call<any>(page, 'run', 'optimized');
  await expect(page.locator('.js-plotly-plot')).toBeVisible();
  const initial = await call<any>(page, 'snapshot');
  expect(initial.traceTypes).toEqual(['scatter']);
  expect(initial.traceCount).toBe(40);
  expect(initial.renderedPointCount).toBe(134_400);
  expect(initial.yaxes).toContain('y2');

  const zoomButton = await clickModebarButton(page, 'zoom');
  await dragPlot(page, { x: 0.25, y: 0.25 }, { x: 0.72, y: 0.72 });
  const zoomedRange = (await call<any>(page, 'snapshot')).xRange;
  const zoomPassed = JSON.stringify(initial.xRange) !== JSON.stringify(zoomedRange);

  const panButton = await clickModebarButton(page, 'pan');
  await dragPlot(page, { x: 0.6, y: 0.5 }, { x: 0.48, y: 0.5 });
  const pannedRange = (await call<any>(page, 'snapshot')).xRange;
  const panPassed = JSON.stringify(zoomedRange) !== JSON.stringify(pannedRange);

  const resetButton = await clickModebarButton(page, 'reset axes');
  await page.waitForTimeout(400);
  const hoverPassed = await validateHover(page);

  const legend = page.locator('.legendtoggle').first();
  await legend.click({ force: true });
  await page.waitForTimeout(300);
  const hiddenState = await page.evaluate(() => (document.querySelector('.js-plotly-plot') as any)?.data?.[0]?.visible ?? true);
  await legend.click({ force: true });
  await page.waitForTimeout(300);
  const restoredState = await page.evaluate(() => (document.querySelector('.js-plotly-plot') as any)?.data?.[0]?.visible ?? true);

  await page.getByTestId('expand-plot').click();
  await expect(page.getByTestId('expanded-plot-shell')).toBeVisible();
  await page.waitForTimeout(500);
  const expanded = await call<any>(page, 'snapshot');
  const fullscreenPassed = expanded.graphRect.width > initial.graphRect.width
    && expanded.graphRect.height > initial.graphRect.height;
  await page.getByTestId('close-expanded-plot').click();
  await page.waitForTimeout(500);

  const beforeResize = await call<any>(page, 'snapshot');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  const afterResize = await call<any>(page, 'snapshot');
  const resizePassed = afterResize.graphRect.width < beforeResize.graphRect.width
    && afterResize.graphRect.height < beforeResize.graphRect.height;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  const exportButton = await clickModebarButton(page, 'download plot');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const bytes = downloadPath ? (await stat(downloadPath)).size : 0;
  const screenshotPath = path.join(SCREENSHOT_DIR, 'case-B-optimized-svg.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const result = {
    run,
    plotVisible: true,
    traceType: 'scatter',
    traceCount: initial.traceCount,
    renderedPointCount: initial.renderedPointCount,
    dualYAxis: initial.yaxes.includes('y2'),
    zoom: { passed: zoomPassed, modebarButton: zoomButton },
    pan: { passed: panPassed, modebarButton: panButton },
    hover: { passed: hoverPassed },
    legendToggle: { passed: hiddenState === 'legendonly' && restoredState === true, hiddenState, restoredState },
    fullscreen: { passed: fullscreenPassed, embeddedRect: initial.graphRect, expandedRect: expanded.graphRect },
    resize: { passed: resizePassed, beforeResizeRect: beforeResize.graphRect, afterResizeRect: afterResize.graphRect },
    modebar: { passed: Boolean(zoomButton && panButton && resetButton && exportButton), buttons: initial.modebarButtons },
    export: { passed: bytes > 0 && download.suggestedFilename().toLowerCase().endsWith('.png'), bytes, suggestedFilename: download.suggestedFilename() },
    screenshot: path.relative(PROJECT_ROOT, screenshotPath).replaceAll('\\', '/'),
  };
  for (const check of [result.zoom, result.pan, result.hover, result.legendToggle, result.fullscreen, result.resize, result.modebar, result.export]) {
    expect(check.passed).toBe(true);
  }
  return result;
}

test('Phase 3 baseline versus optimized frontend recomputation benchmark', async ({ page, browser }) => {
  test.setTimeout(90 * 60 * 1000);
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const consoleMessages: Array<{ type: string; text: string }> = [];
  const fatalConsoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleMessages.push({ type: message.type(), text: message.text() });
      if (message.type() === 'error' && !message.text().includes('status of 404')) fatalConsoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/benchmarks/frontend-pipeline.html');
  await page.waitForFunction(() => Boolean((window as any).field4dPhase3Benchmark));
  const frontendLock = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'frontend', 'package-lock.json'), 'utf8'));
  const playwrightPackage = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8'));
  const environment = {
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    nodeVersion: process.version,
    browserName: browser.browserType().name(),
    browserVersion: browser.version(),
    playwrightVersion: playwrightPackage.version,
    plotlyVersion: frontendLock.packages['node_modules/plotly.js']?.version,
    reactPlotlyVersion: frontendLock.packages['node_modules/react-plotly.js']?.version,
    reactVersion: frontendLock.packages['node_modules/react']?.version,
    browserMode: 'headed',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    workers: 1,
  };

  const equivalence: any[] = [];
  const warmups: any[] = [];
  const rawResults: any[] = [];
  let interactionValidation: any = null;
  let repeatedRender: any = null;
  let invalidation: any = null;
  let sequence = 0;

  try {
    for (const [caseId, scenarioId] of TIMING_MATRIX) {
      const compared = await call<any>(page, 'compareModes', caseId, scenarioId);
      expect(compared.equal, `${caseId}/${scenarioId}: ${compared.rowDifference ?? compared.traceDifference}`).toBe(true);
      expect(compared.sourceHashAfter).toBe(compared.rawObservationHash);
      expect(compared.outlierHintEqual).toBe(true);
      if (scenarioId === 'E') expect(compared.rawObservationHash).toBe(EXPECTED_CASE_HASHES[caseId]);
      equivalence.push(compared);

      const dataset = await call<any>(page, 'prepare', caseId, scenarioId);
      expect(dataset.rawRowCount).toBeLessThanOrEqual(300_000);
      for (const mode of ['baseline', 'optimized'] as PipelineMode[]) {
        warmups.push(await call(page, 'run', mode));
      }
      for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
        const order: PipelineMode[] = repetition % 2 ? ['baseline', 'optimized'] : ['optimized', 'baseline'];
        for (const mode of order) {
          sequence += 1;
          const result = await call<any>(page, 'run', mode);
          rawResults.push({ ...result, repetition, sequence });
        }
      }
    }

    const baselineRepeated: any[] = [];
    baselineRepeated.push(await call(page, 'mountMemoHarness', 'baseline'));
    for (let index = 0; index < 5; index += 1) baselineRepeated.push(await call(page, 'updateMemoHarness', 'unrelated'));
    const optimizedRepeated: any[] = [];
    optimizedRepeated.push(await call(page, 'mountMemoHarness', 'optimized'));
    for (let index = 0; index < 5; index += 1) optimizedRepeated.push(await call(page, 'updateMemoHarness', 'unrelated'));
    repeatedRender = { baseline: baselineRepeated, optimized: optimizedRepeated };
    expect(baselineRepeated.at(-1).preparationCount).toBe(6);
    expect(optimizedRepeated.at(-1).preparationCount).toBe(1);

    const initial = optimizedRepeated.at(-1);
    const sensor = await call<any>(page, 'updateMemoHarness', 'sensor');
    const parameter = await call<any>(page, 'updateMemoHarness', 'parameter');
    const date = await call<any>(page, 'updateMemoHarness', 'date');
    const filter = await call<any>(page, 'updateMemoHarness', 'filter');
    const source = await call<any>(page, 'updateMemoHarness', 'source');
    invalidation = { initial, sensor, parameter, date, filter, source };
    expect([sensor, parameter, date, filter, source].map((item) => item.preparationCount)).toEqual([2, 3, 4, 5, 6]);
    expect(sensor.traceCount).toBeLessThan(initial.traceCount);
    expect(parameter.traceCount).toBeLessThan(sensor.traceCount);
    expect(date.renderedPointCount).toBeLessThan(parameter.renderedPointCount);
    expect(source.traces).not.toEqual(filter.traces);

    interactionValidation = await validateInteractions(page);
    expect(fatalConsoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    const summaries = TIMING_MATRIX.flatMap(([caseId, scenarioId]) =>
      (['baseline', 'optimized'] as PipelineMode[]).map((mode) => {
        const matching = rawResults.filter((result) => result.caseId === caseId && result.scenarioId === scenarioId && result.mode === mode);
        return {
          caseId,
          scenarioId,
          mode,
          successfulRuns: matching.length,
          pipelineMs: matching.length ? summarize(matching.map((result) => result.pipelineMs)) : null,
          tracePreparationMs: matching.length ? summarize(matching.map((result) => result.tracePreparationMs)) : null,
          preRenderMs: matching.length ? summarize(matching.map((result) => result.preRenderMs)) : null,
          plotlyRenderMs: matching.length ? summarize(matching.map((result) => result.plotlyRenderMs)) : null,
          totalMs: matching.length ? summarize(matching.map((result) => result.totalMs)) : null,
        };
      })
    );
    const relativeComparison = TIMING_MATRIX.map(([caseId, scenarioId]) => {
      const baseline = summaries.find((item) => item.caseId === caseId && item.scenarioId === scenarioId && item.mode === 'baseline');
      const optimized = summaries.find((item) => item.caseId === caseId && item.scenarioId === scenarioId && item.mode === 'optimized');
      const reduction = (before: number, after: number) => round(((before - after) / before) * 100);
      return {
        caseId,
        scenarioId,
        pipelineReductionPercent: baseline?.pipelineMs && optimized?.pipelineMs ? reduction(baseline.pipelineMs.median, optimized.pipelineMs.median) : null,
        preRenderReductionPercent: baseline?.preRenderMs && optimized?.preRenderMs ? reduction(baseline.preRenderMs.median, optimized.preRenderMs.median) : null,
        totalReductionPercent: baseline?.totalMs && optimized?.totalMs ? reduction(baseline.totalMs.median, optimized.totalMs.median) : null,
      };
    });
    await writeFile(RAW_RESULTS_PATH, `${JSON.stringify({
      schemaVersion: 1,
      phase: 'Phase 3 frontend recomputation and copy reduction',
      generatedAt: new Date().toISOString(),
      protocol: {
        fixtureIntervalMinutes: 3,
        warmupsPerCaseScenarioMode: 1,
        measuredRepetitionsPerCaseScenarioMode: REPETITIONS,
        alternatingModeOrder: true,
        workerCount: 1,
        primaryMode: 'headed Chromium',
        renderer: 'Plotly SVG scatter with lines',
        tracing: false,
        video: false,
        timedScreenshots: false,
      },
      environment,
      equivalence,
      warmups,
      rawResults,
      summaries,
      relativeComparison,
      repeatedRender,
      invalidation,
      interactionValidation,
      consoleMessages,
      fatalConsoleErrors,
      pageErrors,
    }, null, 2)}\n`, 'utf8');
  }
});
