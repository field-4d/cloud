import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type WorkloadId = 'C0-A' | 'C0-B' | 'C0-C';

const OUTPUT_DIRECTORY = path.resolve('docs/benchmarks/phase4c0_stage_decomposition');
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, 'browser-results.json');
const proofMode = process.env.PHASE4C0_PROOF === '1';
const repetitions: Record<WorkloadId, number> = proofMode
  ? { 'C0-A': 1, 'C0-B': 0, 'C0-C': 0 }
  : { 'C0-A': 3, 'C0-B': 3, 'C0-C': 2 };

async function runOnce(page: import('@playwright/test').Page, workloadId: WorkloadId) {
  await page.goto(`/benchmarks/phase4c0-stage-decomposition.html?workload=${workloadId}`);
  await expect(page.getByTestId('phase4c0-status')).toHaveText('ready');
  await page.getByRole('button', { name: 'Run read-only paged pull' }).click();
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-testid="phase4c0-status"]')?.textContent ?? '';
    return text.startsWith('complete:') || text.startsWith('failed:');
  }, undefined, { timeout: 15 * 60 * 1000 });
  const captured = await page.evaluate(() => ({
    result: window.__phase4c0Result ?? null,
    error: window.__phase4c0Error ?? null,
  }));
  expect(captured.error).toBeNull();
  expect(captured.result).not.toBeNull();
  return captured.result as Record<string, unknown>;
}

test('measure repeated real v2 browser stages in headed Chromium', async ({ page }) => {
  test.setTimeout(60 * 60 * 1000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !message.text().includes('favicon.ico')
      && !message.text().includes('status of 404')
    ) {
      consoleErrors.push(message.text());
    }
  });

  console.log('PHASE4C0_BROWSER_WARMUP C0-A');
  await runOnce(page, 'C0-A');
  const results: Record<WorkloadId, Array<Record<string, unknown>>> = {
    'C0-A': [], 'C0-B': [], 'C0-C': [],
  };
  for (const workloadId of Object.keys(repetitions) as WorkloadId[]) {
    for (let repetition = 1; repetition <= repetitions[workloadId]; repetition += 1) {
      console.log(`PHASE4C0_BROWSER_MEASURED ${workloadId} repetition=${repetition}`);
      const result = await runOnce(page, workloadId);
      results[workloadId].push({ repetition, ...result });
      await mkdir(OUTPUT_DIRECTORY, { recursive: true });
      await writeFile(OUTPUT_PATH, `${JSON.stringify({
        benchmark: 'FIELD4D_PHASE4C0_STAGE_DECOMPOSITION_READONLY',
        generatedAt: new Date().toISOString(),
        headedChromium: true,
        safety: { rawRowsPersisted: false, bigQueryWrites: false },
        results,
        pageErrors,
        consoleErrors,
      }, null, 2)}\n`, 'utf8');
    }
  }

  await page.goto('/benchmarks/phase4c0-stage-decomposition.html?workload=C0-A');
  await page.getByRole('button', { name: 'Run read-only paged pull' }).click();
  await page.waitForFunction(() => window.__phase4c0Result?.rows === 95_788, undefined, {
    timeout: 5 * 60 * 1000,
  });
  await expect(page.locator('.js-plotly-plot')).toBeVisible();
  const graph = page.locator('.js-plotly-plot');
  const before = await graph.evaluate((element: any) => element.layout.xaxis.range ?? null);
  await graph.evaluate((element: any) => {
    const plotly = (window as any).Plotly;
    const values = element.data[0].x;
    return plotly.relayout(element, {
      'xaxis.range': [values[Math.floor(values.length * 0.2)], values[Math.floor(values.length * 0.8)]],
    });
  });
  const after = await graph.evaluate((element: any) => element.layout.xaxis.range ?? null);
  expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  const firstLegend = page.locator('.legendtoggle').first();
  await firstLegend.click({ force: true });
  await firstLegend.click({ force: true });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
