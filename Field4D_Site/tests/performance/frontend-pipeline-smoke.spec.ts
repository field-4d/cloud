import { expect, test } from '@playwright/test';

test('Phase 3 exact pipeline equivalence and memo invalidation smoke', async ({ page }) => {
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

  const equivalence = await page.evaluate(() => {
    const api = window.field4dPhase3Benchmark;
    return [
      api.compareModes('A', 'E'),
      api.compareModes('B', 'E'),
      api.compareModes('C', 'E'),
      api.compareModes('D', 'E'),
      api.compareModes('B', 'F'),
      api.compareModes('B', 'G'),
      api.compareModes('B', 'H'),
      api.compareModes('B', 'I'),
    ];
  });
  for (const result of equivalence) {
    expect(result.equal, `${result.caseId}/${result.scenarioId}: ${result.rowDifference ?? result.traceDifference}`).toBe(true);
    expect(result.sourceHashAfter).toBe(result.rawObservationHash);
    expect(result.outlierHintEqual).toBe(true);
  }

  const snapshots: Record<string, any> = {};
  snapshots.initial = await page.evaluate(() => window.field4dPhase3Benchmark.mountMemoHarness());
  snapshots.unrelated = await page.evaluate(() => window.field4dPhase3Benchmark.updateMemoHarness('unrelated'));
  snapshots.sensor = await page.evaluate(() => window.field4dPhase3Benchmark.updateMemoHarness('sensor'));
  snapshots.parameter = await page.evaluate(() => window.field4dPhase3Benchmark.updateMemoHarness('parameter'));
  snapshots.date = await page.evaluate(() => window.field4dPhase3Benchmark.updateMemoHarness('date'));
  snapshots.filter = await page.evaluate(() => window.field4dPhase3Benchmark.updateMemoHarness('filter'));
  snapshots.source = await page.evaluate(() => window.field4dPhase3Benchmark.updateMemoHarness('source'));

  expect(snapshots.initial.preparationCount).toBe(1);
  expect(snapshots.unrelated.preparationCount).toBe(1);
  expect(snapshots.sensor.preparationCount).toBe(2);
  expect(snapshots.parameter.preparationCount).toBe(3);
  expect(snapshots.date.preparationCount).toBe(4);
  expect(snapshots.filter.preparationCount).toBe(5);
  expect(snapshots.source.preparationCount).toBe(6);
  expect(snapshots.sensor.traceCount).toBeLessThan(snapshots.initial.traceCount);
  expect(snapshots.parameter.traceCount).toBeLessThan(snapshots.sensor.traceCount);
  expect(snapshots.date.renderedPointCount).toBeLessThan(snapshots.parameter.renderedPointCount);
  expect(snapshots.source.traces).not.toEqual(snapshots.filter.traces);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
