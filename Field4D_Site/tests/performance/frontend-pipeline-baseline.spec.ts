import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('records the pre-optimization Phase 2 frontend pipeline baseline', async ({ page }) => {
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

  await page.goto('/benchmarks/frontend-pipeline.html');
  await page.waitForFunction(() => Boolean(window.field4dPhase3Benchmark));

  const environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
  }));
  const runs: Record<string, unknown>[] = [];

  for (const [caseId, scenarioId] of [['D', 'E'], ['B', 'F'], ['B', 'G'], ['B', 'H']] as const) {
    await page.evaluate(([nextCase, nextScenario]) => {
      window.field4dPhase3Benchmark.prepare(nextCase, nextScenario);
    }, [caseId, scenarioId]);
    await page.evaluate(() => window.field4dPhase3Benchmark.run('baseline'));
    for (let repetition = 1; repetition <= 3; repetition += 1) {
      const result = await page.evaluate(() => window.field4dPhase3Benchmark.run('baseline'));
      runs.push({ ...result, repetition });
    }
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  for (const run of runs) {
    expect(run.sourceHashAfter).toBe(run.rawObservationHash);
    expect(run.traceCount).toBeGreaterThan(0);
    expect(run.renderedPointCount).toBeGreaterThan(0);
  }

  const outputDir = path.resolve('docs/benchmarks/phase3_frontend_recomputation');
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, 'baseline-pre-optimization.json'),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), environment, runs, consoleErrors, pageErrors }, null, 2)}\n`,
    'utf8'
  );
});
