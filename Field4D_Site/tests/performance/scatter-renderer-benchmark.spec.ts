import { expect, test, type Page } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type CaseId = 'A' | 'B' | 'C' | 'D';
type Renderer = 'svg' | 'webgl';

interface MeasuredResult {
  caseId: CaseId;
  renderer: Renderer;
  repetition: number;
  sequence: number;
  tracePreparationMs: number | null;
  plotlyRenderMs: number | null;
  totalMs: number | null;
  traceCount: number | null;
  renderedPointCount: number | null;
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
const OUTPUT_DIR = path.join(
  PROJECT_ROOT,
  'docs',
  'benchmarks',
  'phase1_scatter_vs_scattergl'
);
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');
const RAW_RESULTS_PATH = path.join(OUTPUT_DIR, 'raw-results.json');
const CASE_IDS: CaseId[] = ['A', 'B', 'C', 'D'];
const RENDERERS: Renderer[] = ['svg', 'webgl'];
const MEASURED_REPETITIONS = 5;

function round(value: number): number {
  return Number(value.toFixed(3));
}

function getNpmVersion(): string {
  const userAgentMatch = process.env.npm_config_user_agent?.match(/(?:^|\s)npm\/([^\s]+)/);
  if (userAgentMatch) return userAgentMatch[1];

  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    const npmPackagePath = path.resolve(path.dirname(npmExecPath), '..', 'package.json');
    const npmPackage = JSON.parse(readFileSync(npmPackagePath, 'utf8'));
    if (typeof npmPackage.version === 'string') return npmPackage.version;
  }

  return 'unavailable';
}

function summarize(values: number[]): MetricSummary {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const p90Index = Math.max(0, Math.ceil(sorted.length * 0.9) - 1);
  return {
    median: round(median),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(mean),
    p90: round(sorted[p90Index]),
  };
}

function summarizeMeasuredResults(rawResults: MeasuredResult[]) {
  return CASE_IDS.flatMap((caseId) =>
    RENDERERS.map((renderer) => {
      const matching = rawResults.filter(
        (result) => result.caseId === caseId && result.renderer === renderer
      );
      const successful = matching.filter(
        (result) =>
          result.failure === null
          && result.tracePreparationMs !== null
          && result.plotlyRenderMs !== null
          && result.totalMs !== null
      );
      return {
        caseId,
        renderer,
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
    const svg = summaries.find((item) => item.caseId === caseId && item.renderer === 'svg');
    const webgl = summaries.find((item) => item.caseId === caseId && item.renderer === 'webgl');
    if (!svg?.plotlyRenderMs || !webgl?.plotlyRenderMs || !svg.totalMs || !webgl.totalMs) {
      return { caseId, renderImprovementPercent: null, totalImprovementPercent: null };
    }
    return {
      caseId,
      renderImprovementPercent: round(
        ((svg.plotlyRenderMs.median - webgl.plotlyRenderMs.median) / svg.plotlyRenderMs.median) * 100
      ),
      totalImprovementPercent: round(
        ((svg.totalMs.median - webgl.totalMs.median) / svg.totalMs.median) * 100
      ),
    };
  });
}

async function callBenchmark<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    async ({ methodName, methodArgs }) => {
      const api = (window as any).field4dPhase1Benchmark;
      if (!api || typeof api[methodName] !== 'function') {
        throw new Error(`Benchmark API method is unavailable: ${methodName}`);
      }
      return api[methodName](...methodArgs);
    },
    { methodName: method, methodArgs: args }
  );
}

async function clickModebarButton(page: Page, titleFragment: string) {
  const buttons = page.locator('.modebar-btn');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const title = (await button.getAttribute('data-title')) ?? '';
    if (title.toLowerCase().includes(titleFragment.toLowerCase())) {
      await button.click({ force: true });
      return title;
    }
  }
  throw new Error(`Modebar button containing "${titleFragment}" was not found.`);
}

async function readXRange(page: Page): Promise<unknown[] | null> {
  const snapshot = await callBenchmark<any>(page, 'snapshot');
  return snapshot.xRange;
}

async function dragPlot(
  page: Page,
  startFraction: { x: number; y: number },
  endFraction: { x: number; y: number }
) {
  const dragLayer = page.locator('.nsewdrag').first();
  const box = await dragLayer.boundingBox();
  if (!box) throw new Error('Plot drag layer has no bounding box.');
  const startX = box.x + box.width * startFraction.x;
  const startY = box.y + box.height * startFraction.y;
  const endX = box.x + box.width * endFraction.x;
  const endY = box.y + box.height * endFraction.y;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function validateHover(page: Page): Promise<boolean> {
  const dragLayer = page.locator('.nsewdrag').first();
  const box = await dragLayer.boundingBox();
  if (!box) return false;
  const xFractions = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
  const yFractions = [0.2, 0.35, 0.5, 0.65, 0.8];
  for (const xFraction of xFractions) {
    for (const yFraction of yFractions) {
      await page.mouse.move(
        box.x + box.width * xFraction,
        box.y + box.height * yFraction
      );
      await page.waitForTimeout(50);
      if (await page.locator('.hoverlayer .hovertext').count()) return true;
    }
  }
  return false;
}

async function validateRendererInteractions(page: Page, renderer: Renderer) {
  const run = await callBenchmark<any>(page, 'run', 'B', renderer);
  console.log(
    `[VALIDATION] case=B renderer=${renderer} prep=${round(run.tracePreparationMs)}ms render=${round(run.plotlyRenderMs)}ms total=${round(run.totalMs)}ms`
  );
  await expect(page.locator('.js-plotly-plot')).toBeVisible();

  const initialSnapshot = await callBenchmark<any>(page, 'snapshot');
  const expectedType = renderer === 'svg' ? 'scatter' : 'scattergl';
  expect(initialSnapshot.traceTypes).toEqual([expectedType]);
  expect(initialSnapshot.traceCount).toBe(40);
  expect(initialSnapshot.renderedPointCount).toBe(134_400);
  expect(initialSnapshot.yaxes).toContain('y2');

  const initialXRange = await readXRange(page);
  const zoomButton = await clickModebarButton(page, 'zoom');
  await dragPlot(page, { x: 0.25, y: 0.25 }, { x: 0.72, y: 0.72 });
  const zoomedXRange = await readXRange(page);
  const zoomWorked = JSON.stringify(initialXRange) !== JSON.stringify(zoomedXRange);

  const panButton = await clickModebarButton(page, 'pan');
  await dragPlot(page, { x: 0.6, y: 0.5 }, { x: 0.48, y: 0.5 });
  const pannedXRange = await readXRange(page);
  const panWorked = JSON.stringify(zoomedXRange) !== JSON.stringify(pannedXRange);

  const resetButton = await clickModebarButton(page, 'reset axes');
  await page.waitForTimeout(400);
  const hoverWorked = await validateHover(page);

  const legendToggle = page.locator('.legendtoggle').first();
  await legendToggle.click({ force: true });
  await page.waitForTimeout(300);
  const hiddenLegendState = await page.evaluate(() => {
    const graph = document.querySelector('.js-plotly-plot') as any;
    return graph?.data?.[0]?.visible ?? true;
  });
  await legendToggle.click({ force: true });
  await page.waitForTimeout(300);
  const restoredLegendState = await page.evaluate(() => {
    const graph = document.querySelector('.js-plotly-plot') as any;
    return graph?.data?.[0]?.visible ?? true;
  });
  const legendWorked = hiddenLegendState === 'legendonly' && restoredLegendState === true;

  const embeddedRect = (await callBenchmark<any>(page, 'snapshot')).graphRect;
  await page.getByTestId('expand-plot').click();
  await expect(page.getByTestId('expanded-plot-shell')).toBeVisible();
  await page.waitForTimeout(500);
  const expandedRect = (await callBenchmark<any>(page, 'snapshot')).graphRect;
  const fullscreenWorked =
    expandedRect.width > embeddedRect.width && expandedRect.height > embeddedRect.height;
  await page.getByTestId('close-expanded-plot').click();
  await page.waitForTimeout(500);

  const beforeResizeRect = (await callBenchmark<any>(page, 'snapshot')).graphRect;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  const afterResizeRect = (await callBenchmark<any>(page, 'snapshot')).graphRect;
  const resizeWorked =
    afterResizeRect.width < beforeResizeRect.width && afterResizeRect.height < beforeResizeRect.height;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  const exportButton = await clickModebarButton(page, 'download plot');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloadSize = downloadPath ? (await stat(downloadPath)).size : 0;
  const exportWorked = downloadSize > 0 && download.suggestedFilename().toLowerCase().endsWith('.png');

  const screenshotPath = path.join(SCREENSHOT_DIR, `case-B-${renderer}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const result = {
    renderer,
    run,
    plotVisible: true,
    expectedTraceType: expectedType,
    traceCount: initialSnapshot.traceCount,
    renderedPointCount: initialSnapshot.renderedPointCount,
    dualYAxis: initialSnapshot.yaxes.includes('y2'),
    zoom: { passed: zoomWorked, modebarButton: zoomButton },
    pan: { passed: panWorked, modebarButton: panButton },
    hover: { passed: hoverWorked },
    legendToggle: {
      passed: legendWorked,
      hiddenState: hiddenLegendState,
      restoredState: restoredLegendState,
    },
    fullscreen: { passed: fullscreenWorked, embeddedRect, expandedRect },
    resize: { passed: resizeWorked, beforeResizeRect, afterResizeRect },
    modebar: {
      passed: Boolean(zoomButton && panButton && resetButton && exportButton),
      buttons: initialSnapshot.modebarButtons,
    },
    export: {
      passed: exportWorked,
      suggestedFilename: download.suggestedFilename(),
      bytes: downloadSize,
    },
    screenshot: path.relative(PROJECT_ROOT, screenshotPath).replaceAll('\\', '/'),
    webglCanvasCount: initialSnapshot.webglCanvasCount,
    svgTracePathCount: initialSnapshot.svgTracePathCount,
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

test('Phase 1 compares ScatterPlot SVG and WebGL renderers with identical raw observations', async ({
  page,
  browser,
}) => {
  test.setTimeout(90 * 60 * 1000);
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const consoleMessages: Array<{ type: string; text: string }> = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'warning' || message.type() === 'error' || /webgl|gpu|context/i.test(text)) {
      consoleMessages.push({ type: message.type(), text });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/benchmarks/scatter-renderer.html');
  await page.waitForFunction(() => Boolean((window as any).field4dPhase1Benchmark));
  const webglInfo = await callBenchmark<any>(page, 'getWebGlInfo');

  const frontendLock = JSON.parse(
    readFileSync(path.join(PROJECT_ROOT, 'frontend', 'package-lock.json'), 'utf8')
  );
  const playwrightPackage = JSON.parse(
    readFileSync(path.join(PROJECT_ROOT, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')
  );
  const npmVersion = getNpmVersion();

  const environment = {
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    nodeVersion: process.version,
    npmVersion,
    browserName: browser.browserType().name(),
    browserVersion: browser.version(),
    playwrightVersion: playwrightPackage.version,
    plotlyVersion: frontendLock.packages['node_modules/plotly.js']?.version,
    plotlyDistVersion: frontendLock.packages['node_modules/plotly.js-dist-min']?.version,
    reactPlotlyVersion: frontendLock.packages['node_modules/react-plotly.js']?.version,
    reactVersion: frontendLock.packages['node_modules/react']?.version,
    browserMode: 'headed',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    workers: 1,
    launchFlags: [],
    webglInfo,
  };

  const datasets: Record<string, unknown> = {};
  const warmups: unknown[] = [];
  const rawResults: MeasuredResult[] = [];
  const equivalence: unknown[] = [];
  const interactionValidation: unknown[] = [];
  let sequence = 0;

  try {
    for (const caseId of CASE_IDS) {
      const dataset = await callBenchmark<any>(page, 'prepare', caseId);
      datasets[caseId] = dataset;
      expect(dataset.rawRowCount).toBeLessThanOrEqual(300_000);
      console.log(
        `[DATASET] case=${caseId} rows=${dataset.rawRowCount} traces=${dataset.expectedTraceCount} renderedPoints=${dataset.expectedRenderedPointCount} hash=${dataset.rawObservationHash}`
      );

      for (const renderer of RENDERERS) {
        const warmup = await callBenchmark<any>(page, 'run', caseId, renderer);
        warmups.push(warmup);
        console.log(
          `[WARMUP] case=${caseId} renderer=${renderer} prep=${round(warmup.tracePreparationMs)}ms render=${round(warmup.plotlyRenderMs)}ms total=${round(warmup.totalMs)}ms`
        );
      }

      for (let repetition = 1; repetition <= MEASURED_REPETITIONS; repetition += 1) {
        const rendererOrder: Renderer[] = repetition % 2 === 1
          ? ['svg', 'webgl']
          : ['webgl', 'svg'];
        for (const renderer of rendererOrder) {
          sequence += 1;
          try {
            const result = await callBenchmark<any>(page, 'run', caseId, renderer);
            const measured: MeasuredResult = {
              caseId,
              renderer,
              repetition,
              sequence,
              tracePreparationMs: round(result.tracePreparationMs),
              plotlyRenderMs: round(result.plotlyRenderMs),
              totalMs: round(result.totalMs),
              traceCount: result.traceCount,
              renderedPointCount: result.renderedPointCount,
              failure: null,
            };
            rawResults.push(measured);
            console.log(
              `[MEASURED] sequence=${sequence} case=${caseId} renderer=${renderer} repetition=${repetition} prep=${measured.tracePreparationMs}ms render=${measured.plotlyRenderMs}ms total=${measured.totalMs}ms`
            );
          } catch (error) {
            const failure = error instanceof Error ? error.message : String(error);
            rawResults.push({
              caseId,
              renderer,
              repetition,
              sequence,
              tracePreparationMs: null,
              plotlyRenderMs: null,
              totalMs: null,
              traceCount: null,
              renderedPointCount: null,
              failure,
            });
            console.log(
              `[MEASURED-FAILURE] sequence=${sequence} case=${caseId} renderer=${renderer} repetition=${repetition} error=${failure}`
            );
          }
        }
      }
    }

    for (const caseId of CASE_IDS) {
      await callBenchmark(page, 'prepare', caseId);
      const svgRun = await callBenchmark<any>(page, 'run', caseId, 'svg');
      const svgSnapshot = await callBenchmark<any>(page, 'snapshot');
      await callBenchmark(page, 'rememberTraceObservations', `case-${caseId}`);
      const webglRun = await callBenchmark<any>(page, 'run', caseId, 'webgl');
      const webglSnapshot = await callBenchmark<any>(page, 'snapshot');
      const comparison = await callBenchmark<any>(
        page,
        'compareRememberedTraceObservations',
        `case-${caseId}`
      );
      await callBenchmark(page, 'clearRememberedTraceObservations');

      expect(comparison.equal).toBe(true);
      expect(svgSnapshot.dataset.generation).toBe(webglSnapshot.dataset.generation);
      expect(svgSnapshot.dataset.rawObservationHash).toBe(webglSnapshot.dataset.rawObservationHash);
      expect(svgSnapshot.rawObservationHashNow).toBe(svgSnapshot.dataset.rawObservationHash);
      expect(webglSnapshot.rawObservationHashNow).toBe(webglSnapshot.dataset.rawObservationHash);
      expect(svgSnapshot.traceCount).toBe(svgSnapshot.dataset.expectedTraceCount);
      expect(webglSnapshot.traceCount).toBe(webglSnapshot.dataset.expectedTraceCount);
      expect(svgSnapshot.renderedPointCount).toBe(svgSnapshot.dataset.expectedRenderedPointCount);
      expect(webglSnapshot.renderedPointCount).toBe(webglSnapshot.dataset.expectedRenderedPointCount);
      expect(svgSnapshot.traceTypes).toEqual(['scatter']);
      expect(webglSnapshot.traceTypes).toEqual(['scattergl']);

      equivalence.push({
        caseId,
        svgRun,
        webglRun,
        svgSnapshot,
        webglSnapshot,
        exactElementComparison: comparison,
        sameDatasetGeneration: true,
        rawDatasetHashUnchanged: true,
      });
      console.log(
        `[EQUIVALENCE] case=${caseId} exactXY=${comparison.equal} rows=${svgSnapshot.dataset.rawRowCount} renderedPoints=${comparison.renderedPointCount}`
      );
    }

    for (const renderer of RENDERERS) {
      interactionValidation.push(await validateRendererInteractions(page, renderer));
    }

    expect(rawResults.filter((result) => result.failure !== null)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  } finally {
    const summaries = summarizeMeasuredResults(rawResults);
    const resultDocument = {
      schemaVersion: 1,
      phase: 'Phase 1 only',
      generatedAt: new Date().toISOString(),
      protocol: {
        fixtureIntervalMinutes: 3,
        warmupsPerCaseRenderer: 1,
        measuredRepetitionsPerCaseRenderer: MEASURED_REPETITIONS,
        alternatingRendererOrder: true,
        workerCount: 1,
        primaryMode: 'headed',
        tracing: false,
        video: false,
        timedScreenshots: false,
      },
      environment,
      datasets,
      warmups,
      rawResults,
      summaries,
      relativeComparison: buildRelativeComparison(summaries),
      equivalence,
      interactionValidation,
      consoleMessages,
      pageErrors,
    };
    await writeFile(RAW_RESULTS_PATH, `${JSON.stringify(resultDocument, null, 2)}\n`, 'utf8');
    console.log(`[ARTIFACT] ${path.relative(PROJECT_ROOT, RAW_RESULTS_PATH)}`);
  }
});
