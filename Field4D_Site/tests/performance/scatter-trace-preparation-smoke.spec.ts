import { expect, test, type Page } from '@playwright/test';

type PreparationMode = 'legacy' | 'indexed';

const API_READY_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 60_000;

async function callBenchmark<T>(
  page: Page,
  method: string,
  args: unknown[] = [],
  timeoutMs = RUN_TIMEOUT_MS
): Promise<T> {
  return page.evaluate(
    async ({ methodName, methodArgs, boundedTimeoutMs }) => {
      const api = (window as any).field4dPhase2Benchmark;
      if (!api || typeof api[methodName] !== 'function') {
        throw new Error(`Phase 2 benchmark API method is unavailable: ${methodName}`);
      }

      let timeoutId: number | undefined;
      try {
        return await Promise.race([
          api[methodName](...methodArgs),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(
              () => reject(new Error(
                `Phase 2 smoke stage ${methodName} exceeded ${boundedTimeoutMs} ms.`
              )),
              boundedTimeoutMs
            );
          }),
        ]);
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      }
    },
    { methodName: method, methodArgs: args, boundedTimeoutMs: timeoutMs }
  );
}

test('Phase 2 bounded Case A legacy/indexed smoke and exact equivalence', async ({ page }) => {
  test.setTimeout(3 * 60 * 1000);

  const consoleErrors: Array<{
    text: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  }> = [];
  const pageErrors: string[] = [];
  const httpErrors: Array<{ status: number; url: string }> = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push({ text: message.text(), ...message.location() });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      httpErrors.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto('/benchmarks/scatter-renderer.html');
  await page.waitForFunction(
    () => Boolean((window as any).field4dPhase2Benchmark),
    undefined,
    { timeout: API_READY_TIMEOUT_MS }
  );

  const apiExists = await page.evaluate(() => Boolean((window as any).field4dPhase2Benchmark));
  expect(apiExists).toBe(true);

  const dataset = await callBenchmark<any>(page, 'prepare', ['A']);
  expect(dataset.rawRowCount).toBe(2_400);
  expect(dataset.expectedRenderedPointCount).toBe(2_400);

  const runs: Record<PreparationMode, any> = {} as Record<PreparationMode, any>;
  for (const preparationMode of ['legacy', 'indexed'] as const) {
    const startedAt = Date.now();
    runs[preparationMode] = await callBenchmark<any>(
      page,
      'run',
      ['A', 'svg', preparationMode]
    );
    expect(Date.now() - startedAt).toBeLessThan(RUN_TIMEOUT_MS);
    expect(runs[preparationMode].tracePreparationMode).toBe(preparationMode);
    expect(runs[preparationMode].rendererMode).toBe('svg');
    expect(runs[preparationMode].traceCount).toBe(5);
    expect(runs[preparationMode].renderedPointCount).toBe(2_400);
  }

  const equivalence = await callBenchmark<any>(page, 'comparePreparedDataset', ['A']);
  expect(equivalence.equal, equivalence.mismatch ?? 'unknown mismatch').toBe(true);
  expect(equivalence.sourceUnchanged).toBe(true);
  expect(equivalence.renderedPointCount).toBe(2_400);
  expect(equivalence.traceCount).toBe(5);

  const expectedFaviconMisses = httpErrors.filter(
    ({ status, url }) => status === 404 && new URL(url).pathname === '/favicon.ico'
  );
  const unexpectedHttpErrors = httpErrors.filter((error) => !expectedFaviconMisses.includes(error));
  const expectedFaviconConsoleErrors = consoleErrors.filter(
    ({ text, url }) => text === 'Failed to load resource: the server responded with a status of 404 (Not Found)'
      && new URL(url).pathname === '/favicon.ico'
  );
  const fatalConsoleErrors = consoleErrors.filter(
    (error) => !expectedFaviconConsoleErrors.includes(error)
  );
  console.log('Phase 2 smoke browser diagnostics', {
    consoleErrors,
    httpErrors,
    fatalConsoleErrors,
    pageErrors,
  });
  expect(pageErrors).toEqual([]);
  expect(unexpectedHttpErrors).toEqual([]);
  expect(fatalConsoleErrors).toEqual([]);

  console.log(JSON.stringify({
    apiExists,
    dataset,
    legacy: runs.legacy,
    indexed: runs.indexed,
    equivalence: {
      equal: equivalence.equal,
      sourceUnchanged: equivalence.sourceUnchanged,
      traceCount: equivalence.traceCount,
      renderedPointCount: equivalence.renderedPointCount,
      traceHashes: equivalence.traceHashes,
    },
    consoleErrors,
    httpErrors,
    fatalConsoleErrors,
    pageErrors,
  }, null, 2));
});
