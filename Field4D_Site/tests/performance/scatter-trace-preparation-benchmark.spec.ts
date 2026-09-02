import { expect, test, type Page } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type CaseId = 'A' | 'B' | 'C' | 'D';
type PreparationMode = 'legacy' | 'indexed';

interface MeasuredResult {
  caseId: CaseId;
  preparationMode: PreparationMode;
  repetition: number;
  sequence: number;
  tracePreparationMs: number | null;
  plotlyRenderMs: number | null;
  totalMs: number | null;
  traceCount: number | null;
  renderedPointCount: number | null;
  preparationStats: unknown;
  failure: string | null;
}

interface MetricSummary {
  median: number;
  min: number;
  max: number;
  mean: number;
  p90: number;
}

const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'docs', 'benchmarks', 'phase2_indexed_trace_preparation');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');
const RAW_RESULTS_PATH = path.join(OUTPUT_DIR, 'raw-results.json');
const RUN_PROGRESS_PATH = path.join(OUTPUT_DIR, 'run-progress.json');
const CASE_IDS: CaseId[] = ['A', 'B', 'C', 'D'];
const PREPARATION_MODES: PreparationMode[] = ['legacy', 'indexed'];
const MEASURED_REPETITIONS = 7;
const EXPECTED_DATASET_HASHES: Record<CaseId, string> = {
  A: 'f7f58dcd',
  B: '46c1bb7e',
  C: '14a8e85c',
  D: 'eb3d147c',
};

function round(value: number): number {
  return Number(value.toFixed(3));
}

function summarize(values: number[]): MetricSummary {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return {
    median: round(median),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p90: round(sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)]),
  };
}

function summarizeMeasuredResults(rawResults: MeasuredResult[]) {
  return CASE_IDS.flatMap((caseId) =>
    PREPARATION_MODES.map((preparationMode) => {
      const matching = rawResults.filter(
        (result) => result.caseId === caseId && result.preparationMode === preparationMode
      );
      const successful = matching.filter(
        (result) => result.failure === null
          && result.tracePreparationMs !== null
          && result.plotlyRenderMs !== null
          && result.totalMs !== null
      );
      return {
        caseId,
        preparationMode,
        successfulRuns: successful.length,
        failureCount: matching.length - successful.length,
        tracePreparationMs: successful.length
          ? summarize(successful.map((result) => result.tracePreparationMs as number))
          : null,
        plotlyRenderMs: successful.length
          ? summarize(successful.map((result) => result.plotlyRenderMs as number))
          : null,
        totalMs: successful.length
          ? summarize(successful.map((result) => result.totalMs as number))
          : null,
      };
    })
  );
}

function buildRelativeComparison(summaries: ReturnType<typeof summarizeMeasuredResults>) {
  return CASE_IDS.map((caseId) => {
    const legacy = summaries.find(
      (item) => item.caseId === caseId && item.preparationMode === 'legacy'
    );
    const indexed = summaries.find(
      (item) => item.caseId === caseId && item.preparationMode === 'indexed'
    );
    if (!legacy?.tracePreparationMs || !indexed?.tracePreparationMs) {
      return { caseId, preparationSpeedup: null, preparationReductionPercent: null };
    }
    return {
      caseId,
      preparationSpeedup: round(
        legacy.tracePreparationMs.median / indexed.tracePreparationMs.median
      ),
      preparationReductionPercent: round(
        ((legacy.tracePreparationMs.median - indexed.tracePreparationMs.median)
          / legacy.tracePreparationMs.median) * 100
      ),
      renderChangePercent: legacy.plotlyRenderMs && indexed.plotlyRenderMs
        ? round(
            ((legacy.plotlyRenderMs.median - indexed.plotlyRenderMs.median)
              / legacy.plotlyRenderMs.median) * 100
          )
        : null,
      totalReductionPercent: legacy.totalMs && indexed.totalMs
        ? round(
            ((legacy.totalMs.median - indexed.totalMs.median)
              / legacy.totalMs.median) * 100
          )
        : null,
    };
  });
}

async function callBenchmark<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    async ({ methodName, methodArgs }) => {
      const api = (window as any).field4dPhase2Benchmark;
      if (!api || typeof api[methodName] !== 'function') {
        throw new Error(`Phase 2 benchmark API method is unavailable: ${methodName}`);
      }
      return api[methodName](...methodArgs);
    },
    { methodName: method, methodArgs: args }
  );
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
  throw new Error(`Modebar button containing "${titleFragment}" was not found.`);
}

async function dragPlot(
  page: Page,
  startFraction: { x: number; y: number },
  endFraction: { x: number; y: number }
) {
  const dragLayer = page.locator('.nsewdrag').first();
  const box = await dragLayer.boundingBox();
  if (!box) throw new Error('Plot drag layer has no bounding box.');
  await page.mouse.move(
    box.x + box.width * startFraction.x,
    box.y + box.height * startFraction.y
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * endFraction.x,
    box.y + box.height * endFraction.y,
    { steps: 12 }
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function validateHover(page: Page): Promise<boolean> {
  const dragLayer = page.locator('.nsewdrag').first();
  const box = await dragLayer.boundingBox();
  if (!box) return false;
  for (const xFraction of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    for (const yFraction of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      await page.mouse.move(box.x + box.width * xFraction, box.y + box.height * yFraction);
      await page.waitForTimeout(50);
      if (await page.locator('.hoverlayer .hovertext').count()) return true;
    }
  }
  return false;
}

async function validateInteractions(page: Page, preparationMode: PreparationMode) {
  const run = await callBenchmark<any>(page, 'run', 'B', 'svg', preparationMode);
  await expect(page.locator('.js-plotly-plot')).toBeVisible();
  const initial = await callBenchmark<any>(page, 'snapshot');
  expect(initial.traceTypes).toEqual(['scatter']);
  expect(initial.traceCount).toBe(40);
  expect(initial.renderedPointCount).toBe(134_400);
  expect(initial.yaxes).toContain('y2');

  const initialXRange = initial.xRange;
  const zoomButton = await clickModebarButton(page, 'zoom');
  await dragPlot(page, { x: 0.25, y: 0.25 }, { x: 0.72, y: 0.72 });
  const zoomedXRange = (await callBenchmark<any>(page, 'snapshot')).xRange;
  const zoomPassed = JSON.stringify(initialXRange) !== JSON.stringify(zoomedXRange);

  const panButton = await clickModebarButton(page, 'pan');
  await dragPlot(page, { x: 0.6, y: 0.5 }, { x: 0.48, y: 0.5 });
  const pannedXRange = (await callBenchmark<any>(page, 'snapshot')).xRange;
  const panPassed = JSON.stringify(zoomedXRange) !== JSON.stringify(pannedXRange);

  const resetButton = await clickModebarButton(page, 'reset axes');
  await page.waitForTimeout(400);
  const hoverPassed = await validateHover(page);

  const legendToggle = page.locator('.legendtoggle').first();
  await legendToggle.click({ force: true });
  await page.waitForTimeout(300);
  const hiddenState = await page.evaluate(() => {
    const graph = document.querySelector('.js-plotly-plot') as any;
    return graph?.data?.[0]?.visible ?? true;
  });
  await legendToggle.click({ force: true });
  await page.waitForTimeout(300);
  const restoredState = await page.evaluate(() => {
    const graph = document.querySelector('.js-plotly-plot') as any;
    return graph?.data?.[0]?.visible ?? true;
  });
  const legendPassed = hiddenState === 'legendonly' && restoredState === true;

  const embeddedRect = initial.graphRect;
  await page.getByTestId('expand-plot').click();
  await expect(page.getByTestId('expanded-plot-shell')).toBeVisible();
  await page.waitForTimeout(500);
  const expandedRect = (await callBenchmark<any>(page, 'snapshot')).graphRect;
  const fullscreenPassed = expandedRect.width > embeddedRect.width && expandedRect.height > embeddedRect.height;
  await page.getByTestId('close-expanded-plot').click();
  await page.waitForTimeout(500);

  const beforeResizeRect = (await callBenchmark<any>(page, 'snapshot')).graphRect;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  const afterResizeRect = (await callBenchmark<any>(page, 'snapshot')).graphRect;
  const resizePassed = afterResizeRect.width < beforeResizeRect.width
    && afterResizeRect.height < beforeResizeRect.height;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  const exportButton = await clickModebarButton(page, 'download plot');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloadSize = downloadPath ? (await stat(downloadPath)).size : 0;
  const exportPassed = downloadSize > 0 && download.suggestedFilename().toLowerCase().endsWith('.png');

  const screenshotPath = path.join(SCREENSHOT_DIR, `case-B-${preparationMode}-svg.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const result = {
    preparationMode,
    run,
    plotVisible: true,
    traceType: 'scatter',
    traceCount: initial.traceCount,
    renderedPointCount: initial.renderedPointCount,
    dualYAxis: initial.yaxes.includes('y2'),
    zoom: { passed: zoomPassed, modebarButton: zoomButton },
    pan: { passed: panPassed, modebarButton: panButton },
    hover: { passed: hoverPassed },
    legendToggle: { passed: legendPassed, hiddenState, restoredState },
    fullscreen: { passed: fullscreenPassed, embeddedRect, expandedRect },
    resize: { passed: resizePassed, beforeResizeRect, afterResizeRect },
    modebar: {
      passed: Boolean(zoomButton && panButton && resetButton && exportButton),
      buttons: initial.modebarButtons,
    },
    export: {
      passed: exportPassed,
      suggestedFilename: download.suggestedFilename(),
      bytes: downloadSize,
    },
    screenshot: path.relative(PROJECT_ROOT, screenshotPath).replaceAll('\\', '/'),
  };

  for (const check of [
    result.zoom,
    result.pan,
    result.hover,
    result.legendToggle,
    result.fullscreen,
    result.resize,
    result.modebar,
    result.export,
  ]) {
    expect(check.passed).toBe(true);
  }
  return result;
}

test('Phase 2 compares legacy and indexed sensor trace preparation with identical SVG observations', async ({
  page,
  browser,
}) => {
  test.setTimeout(90 * 60 * 1000);
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const consoleMessages: Array<{ type: string; text: string }> = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleMessages.push({ type: message.type(), text });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/benchmarks/scatter-renderer.html');
  await page.waitForFunction(() => Boolean((window as any).field4dPhase2Benchmark));

  const frontendLock = JSON.parse(
    readFileSync(path.join(PROJECT_ROOT, 'frontend', 'package-lock.json'), 'utf8')
  );
  const playwrightPackage = JSON.parse(
    readFileSync(path.join(PROJECT_ROOT, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')
  );
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

  const datasets: Record<string, unknown> = {};
  const edgeCaseEquivalence: unknown[] = [];
  const benchmarkEquivalence: unknown[] = [];
  const warmups: unknown[] = [];
  const rawResults: MeasuredResult[] = [];
  const interactionValidation: unknown[] = [];
  let sequence = 0;

  async function checkpoint(stage: string, details: Record<string, unknown> = {}) {
    const progress = {
      status: 'in_progress',
      stage,
      updatedAt: new Date().toISOString(),
      measuredResultsCompleted: rawResults.length,
      sequence,
      ...details,
    };
    await writeFile(RUN_PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
    console.log(`[STAGE] ${stage} ${JSON.stringify(details)}`);
  }

  try {
    await checkpoint('edge-case-equivalence');
    const edgeCases = await callBenchmark<any[]>(page, 'runEdgeCaseEquivalence');
    edgeCaseEquivalence.push(...edgeCases);
    expect(edgeCases).toHaveLength(8);
    for (const edgeCase of edgeCases) {
      expect(edgeCase.equal, `${edgeCase.id}: ${edgeCase.mismatch}`).toBe(true);
      expect(edgeCase.sourceUnchanged, `${edgeCase.id}: source mutated`).toBe(true);
    }
    const natural = edgeCases.find((item) => item.id === 'multiple-sensors-one-parameter-natural-ids');
    expect(natural.traceSummary.map((trace: any) => trace.name)).toEqual(['1', '2', '10']);
    const special = edgeCases.find((item) => item.id === 'null-nan-and-special-values');
    expect(special.traceSummary[0].y).toEqual([
      null,
      { number: 'NaN' },
      { number: 'Infinity' },
      { number: '-0' },
    ]);

    for (const caseId of CASE_IDS) {
      await checkpoint('dataset-prepare', { caseId });
      const dataset = await callBenchmark<any>(page, 'prepare', caseId);
      datasets[caseId] = dataset;
      expect(dataset.rawRowCount).toBeLessThanOrEqual(300_000);
      expect(dataset.rawObservationHash).toBe(EXPECTED_DATASET_HASHES[caseId]);

      await checkpoint('benchmark-equivalence', { caseId });
      const equivalence = await callBenchmark<any>(page, 'comparePreparedDataset', caseId);
      expect(equivalence.equal, `case ${caseId}: ${equivalence.mismatch}`).toBe(true);
      expect(equivalence.sourceUnchanged).toBe(true);
      expect(equivalence.renderedPointCount).toBe(dataset.expectedRenderedPointCount);
      benchmarkEquivalence.push({ caseId, ...equivalence });

      for (const preparationMode of PREPARATION_MODES) {
        await checkpoint('warmup', { caseId, preparationMode });
        const warmup = await callBenchmark<any>(page, 'run', caseId, 'svg', preparationMode);
        warmups.push(warmup);
      }

      for (let repetition = 1; repetition <= MEASURED_REPETITIONS; repetition += 1) {
        const order: PreparationMode[] = repetition % 2 === 1
          ? ['legacy', 'indexed']
          : ['indexed', 'legacy'];
        for (const preparationMode of order) {
          sequence += 1;
          await checkpoint('measured-run', { caseId, preparationMode, repetition, sequence });
          try {
            const result = await callBenchmark<any>(page, 'run', caseId, 'svg', preparationMode);
            const measured: MeasuredResult = {
              caseId,
              preparationMode,
              repetition,
              sequence,
              tracePreparationMs: round(result.tracePreparationMs),
              plotlyRenderMs: round(result.plotlyRenderMs),
              totalMs: round(result.totalMs),
              traceCount: result.traceCount,
              renderedPointCount: result.renderedPointCount,
              preparationStats: result.preparationStats,
              failure: null,
            };
            rawResults.push(measured);
            console.log(
              `[MEASURED] sequence=${sequence} case=${caseId} mode=${preparationMode} repetition=${repetition} prep=${measured.tracePreparationMs}ms render=${measured.plotlyRenderMs}ms total=${measured.totalMs}ms`
            );
          } catch (error) {
            const failure = error instanceof Error ? error.message : String(error);
            rawResults.push({
              caseId,
              preparationMode,
              repetition,
              sequence,
              tracePreparationMs: null,
              plotlyRenderMs: null,
              totalMs: null,
              traceCount: null,
              renderedPointCount: null,
              preparationStats: null,
              failure,
            });
          }
        }
      }
    }

    for (const preparationMode of PREPARATION_MODES) {
      await checkpoint('interaction-validation', { preparationMode });
      interactionValidation.push(await validateInteractions(page, preparationMode));
    }

    expect(rawResults.filter((result) => result.failure !== null)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  } finally {
    const summaries = summarizeMeasuredResults(rawResults);
    const resultDocument = {
      schemaVersion: 1,
      phase: 'Phase 2 indexed sensor trace preparation',
      generatedAt: new Date().toISOString(),
      protocol: {
        fixtureIntervalMinutes: 3,
        warmupsPerCasePreparationMode: 1,
        measuredRepetitionsPerCasePreparationMode: MEASURED_REPETITIONS,
        alternatingPreparationOrder: true,
        workerCount: 1,
        primaryMode: 'headed',
        renderer: 'Plotly SVG scatter with lines',
        tracing: false,
        video: false,
        timedScreenshots: false,
      },
      environment,
      datasets,
      edgeCaseEquivalence,
      benchmarkEquivalence,
      warmups,
      rawResults,
      summaries,
      relativeComparison: buildRelativeComparison(summaries),
      interactionValidation,
      consoleMessages,
      pageErrors,
    };
    await writeFile(RAW_RESULTS_PATH, `${JSON.stringify(resultDocument, null, 2)}\n`, 'utf8');
    await writeFile(RUN_PROGRESS_PATH, `${JSON.stringify({
      status: 'complete',
      stage: 'complete',
      updatedAt: new Date().toISOString(),
      measuredResultsCompleted: rawResults.length,
      sequence,
    }, null, 2)}\n`, 'utf8');
    console.log(`[ARTIFACT] ${path.relative(PROJECT_ROOT, RAW_RESULTS_PATH)}`);
  }
});
