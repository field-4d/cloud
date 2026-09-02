import { expect, type Page, type Route } from '@playwright/test';
import { getParameterDisplayLabel } from '../../frontend/src/constants/parameterMetadata';

export const THREE_MINUTES_MS = 3 * 60 * 1000;

export interface FixtureRequestRecord {
  requestNumber: number;
  sensors: number;
  parameters: number;
  selectedParameters: string[];
  rows: number;
  responseBytes: number;
  generationMs: number;
  start: string;
  end: string;
  outcome: 'fulfilled' | 'failed' | 'delayed';
}

interface FetchPayload {
  selectedSensors: string[];
  selectedParameters: string[];
  dateRange: { start: string; end: string };
}

interface FetchPagePayload extends FetchPayload {
  owner: string;
  mac_address: string;
  experimentId: number;
  experiment: string;
  cursor?: string;
  pageSize?: number;
}

export interface FixtureController {
  records: FixtureRequestRecord[];
  failRequestNumber: number | null;
  delayMs: number;
}

export interface PageFixtureRequestRecord {
  requestNumber: number;
  pageSequence: number;
  rows: number;
  cursor: string | null;
  requestedPageSize: number | null;
  effectivePageSize: number;
  outcome: 'fulfilled' | 'failed' | 'delayed';
}

export interface PageFixtureController {
  records: PageFixtureRequestRecord[];
  failOncePageSequence: number | null;
  delayMs: number;
  maxInFlight: number;
}

const parameterIndex = (parameter: string): number => {
  let hash = 0;
  for (let index = 0; index < parameter.length; index += 1) {
    hash = (Math.imul(hash, 31) + parameter.charCodeAt(index)) | 0;
  }
  return Math.abs(hash % 1000);
};

const sensorIndex = (sensor: string): number => {
  const parsed = Number(sensor.split('-').at(-1));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const deterministicValue = (
  sensor: string,
  parameter: string,
  timestampMs: number
): number =>
  sensorIndex(sensor) * 1000
  + parameterIndex(parameter)
  + ((timestampMs / THREE_MINUTES_MS) % 1000) / 1000;

const buildResponseBody = (payload: FetchPayload): { body: string; rows: number } => {
  const startMs = Date.parse(payload.dateRange.start);
  const endMs = Date.parse(payload.dateRange.end);
  const rows: Array<Record<string, string | number | null>> = [];

  for (let timestampMs = startMs; timestampMs <= endMs; timestampMs += THREE_MINUTES_MS) {
    const timestamp = new Date(timestampMs).toISOString();
    for (const sensor of payload.selectedSensors) {
      for (const parameter of payload.selectedParameters) {
        rows.push({
          timestamp,
          sensor,
          parameter,
          value: deterministicValue(sensor, parameter, timestampMs),
          label: null,
          location: null,
          experiment: 'Phase 4 deterministic fixture',
          owner: 'phase4-local-owner',
          mac_address: 'phase4-local-device',
        });
      }
    }
  }

  return { body: JSON.stringify(rows), rows: rows.length };
};

const encodeFixtureCursor = (value: object): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const decodeFixtureCursor = (value: string): {
  streamKey: string;
  offset: number;
  pageSize: number;
  pageSequence: number;
} => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const buildPageRows = (
  payload: FetchPagePayload,
  offset: number,
  pageSize: number
): { rows: Array<Record<string, string | number | null>>; totalRows: number } => {
  const sensors = payload.selectedSensors.slice().sort();
  const parameters = payload.selectedParameters.slice().sort();
  const startMs = Date.parse(payload.dateRange.start);
  const endMs = Date.parse(payload.dateRange.end);
  const sampleCount = Math.floor((endMs - startMs) / THREE_MINUTES_MS) + 1;
  const rowsPerSample = sensors.length * parameters.length;
  const totalRows = sampleCount * rowsPerSample;
  const endOffset = Math.min(offset + pageSize, totalRows);
  const rows: Array<Record<string, string | number | null>> = [];
  for (let rowIndex = offset; rowIndex < endOffset; rowIndex += 1) {
    const sample = Math.floor(rowIndex / rowsPerSample);
    const withinSample = rowIndex % rowsPerSample;
    const sensor = sensors[Math.floor(withinSample / parameters.length)];
    const parameter = parameters[withinSample % parameters.length];
    const timestampMs = startMs + sample * THREE_MINUTES_MS;
    rows.push({
      timestamp: new Date(timestampMs).toISOString(),
      sensor,
      parameter,
      value: deterministicValue(sensor, parameter, timestampMs),
      label: null,
      location: null,
      experiment: payload.experiment,
      owner: payload.owner,
      mac_address: payload.mac_address,
    });
  }
  return { rows, totalRows };
};

export const installDeterministicPageRoute = async (
  page: Page
): Promise<PageFixtureController> => {
  const controller: PageFixtureController = {
    records: [],
    failOncePageSequence: null,
    delayMs: 0,
    maxInFlight: 0,
  };
  const failedSequences = new Set<number>();
  let requestCount = 0;
  let inFlight = 0;

  await page.route('**/api/v2/fetch-data-page', async (route: Route) => {
    const payload = route.request().postDataJSON() as FetchPagePayload;
    const cursorState = payload.cursor ? decodeFixtureCursor(payload.cursor) : null;
    const streamKey = payload.selectedSensors.slice().sort().join(',');
    const offset = cursorState?.offset ?? 0;
    const pageSize = cursorState?.pageSize ?? payload.pageSize ?? 100_000;
    const pageSequence = cursorState?.pageSequence ?? 1;
    if (cursorState && cursorState.streamKey !== streamKey) {
      await route.fulfill({ status: 400, body: 'fixture cursor selection mismatch' });
      return;
    }

    const record: PageFixtureRequestRecord = {
      requestNumber: ++requestCount,
      pageSequence,
      rows: 0,
      cursor: payload.cursor ?? null,
      requestedPageSize: payload.pageSize ?? null,
      effectivePageSize: pageSize,
      outcome: controller.delayMs > 0 ? 'delayed' : 'fulfilled',
    };
    controller.records.push(record);
    inFlight += 1;
    controller.maxInFlight = Math.max(controller.maxInFlight, inFlight);
    try {
      if (controller.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, controller.delayMs));
      }
      if (
        controller.failOncePageSequence === pageSequence
        && !failedSequences.has(pageSequence)
      ) {
        failedSequences.add(pageSequence);
        record.outcome = 'failed';
        await route.fulfill({ status: 503, body: 'retry this deterministic page' });
        return;
      }

      const result = buildPageRows(payload, offset, pageSize);
      record.rows = result.rows.length;
      record.outcome = 'fulfilled';
      const nextOffset = offset + result.rows.length;
      const complete = nextOffset >= result.totalRows;
      const nextCursor = complete
        ? null
        : encodeFixtureCursor({
            streamKey,
            offset: nextOffset,
            pageSize,
            pageSequence: pageSequence + 1,
          });
      const body = JSON.stringify({
        schema_version: 'field4d.fetch-data.page.v1',
        query_id: `fixture-${streamKey}`,
        selection_signature: `fixture-selection-${streamKey}`,
        snapshot_at: '2026-06-01T00:00:00.000000Z',
        page_sequence: pageSequence,
        rows: result.rows,
        rows_in_page: result.rows.length,
        cumulative_rows: nextOffset,
        total_rows: result.totalRows,
        next_cursor: nextCursor,
        complete,
        error: null,
        retryable: false,
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    } finally {
      inFlight -= 1;
    }
  });
  return controller;
};

export const installDeterministicFetchRoute = async (
  page: Page
): Promise<FixtureController> => {
  const controller: FixtureController = {
    records: [],
    failRequestNumber: null,
    delayMs: 0,
  };
  let requestCount = 0;

  await page.route('**/api/fetch-data', async (route: Route) => {
    const payload = route.request().postDataJSON() as FetchPayload;
    const requestNumber = ++requestCount;
    const record: FixtureRequestRecord = {
      requestNumber,
      sensors: payload.selectedSensors.length,
      parameters: payload.selectedParameters.length,
      selectedParameters: payload.selectedParameters.slice(),
      rows: 0,
      responseBytes: 0,
      generationMs: 0,
      start: payload.dateRange.start,
      end: payload.dateRange.end,
      outcome: controller.delayMs > 0 ? 'delayed' : 'fulfilled',
    };
    controller.records.push(record);

    if (controller.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, controller.delayMs));
    }

    if (controller.failRequestNumber === requestNumber) {
      record.outcome = 'failed';
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'deterministic Phase 4 failure',
      });
      return;
    }

    const generationStarted = performance.now();
    const response = buildResponseBody(payload);
    const generationMs = performance.now() - generationStarted;
    record.rows = response.rows;
    record.responseBytes = Buffer.byteLength(response.body);
    record.generationMs = generationMs;
    record.outcome = 'fulfilled';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: response.body,
    });
  });

  return controller;
};

export const installBrowserInstrumentation = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const phase4Window = window as typeof window & {
      __phase4ParsedResponses?: Array<{ rows: number; parseMs: number; url: string }>;
      __phase4Progress?: string[];
      __phase4LongTasks?: number[];
    };
    phase4Window.__phase4ParsedResponses = [];
    phase4Window.__phase4Progress = [];
    phase4Window.__phase4LongTasks = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          phase4Window.__phase4LongTasks?.push(entry.duration);
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      // Long-task observation is not available in every browser mode.
    }

    const originalJson = Response.prototype.json;
    Response.prototype.json = async function phase4MeasuredJson() {
      const started = performance.now();
      const result = await originalJson.call(this);
      if (
        this.url.includes('/api/fetch-data')
        || this.url.includes('/api/v2/fetch-data-page')
      ) {
        const rowCount = Array.isArray(result)
          ? result.length
          : Array.isArray((result as { rows?: unknown[] })?.rows)
            ? (result as { rows: unknown[] }).rows.length
            : -1;
        phase4Window.__phase4ParsedResponses?.push({
          rows: rowCount,
          parseMs: performance.now() - started,
          url: this.url,
        });
      }
      return result;
    };

    window.addEventListener('DOMContentLoaded', () => {
      const observer = new MutationObserver(() => {
        const status = document.querySelector('[role="status"]')?.textContent?.trim();
        if (status && phase4Window.__phase4Progress?.at(-1) !== status) {
          phase4Window.__phase4Progress?.push(status);
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
  });
};

export const selectParameters = async (page: Page, parameterValues: string[]): Promise<void> => {
  const parameterSelect = page.locator('.basic-multi-select').nth(1);
  const input = parameterSelect.locator('input[role="combobox"]');
  for (const parameter of parameterValues) {
    await input.fill(parameter);
    await page.getByText(parameter, { exact: true }).click();
  }
  await input.press('Escape');
  await expect(page.getByRole('button', { name: 'Fetch Data' })).toBeEnabled();
};

export const getParsedResponses = (page: Page) =>
  page.evaluate(() => (
    window as typeof window & {
      __phase4ParsedResponses?: Array<{ rows: number; parseMs: number; url: string }>;
    }
  ).__phase4ParsedResponses ?? []);

export const getProgressHistory = (page: Page) =>
  page.evaluate(() => (
    window as typeof window & { __phase4Progress?: string[] }
  ).__phase4Progress ?? []);

export const getPlotSnapshot = (page: Page) =>
  page.evaluate(() => {
    const graph = document.querySelector('.js-plotly-plot') as HTMLElement & {
      data?: Array<{ name?: string; x?: unknown[]; y?: unknown[] }>;
    };
    const traces = graph?.data ?? [];
    let hash = 0x811c9dc5;
    const add = (value: unknown) => {
      const text = `${String(value)}\u0000`;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    };
    let pointCount = 0;
    for (const trace of traces) {
      add(trace.name ?? '');
      const x = trace.x ?? [];
      const y = trace.y ?? [];
      add(x.length);
      add(y.length);
      pointCount += x.length;
      for (let index = 0; index < x.length; index += 1) {
        add(x[index]);
        add(y[index]);
      }
    }
    return { traceCount: traces.length, pointCount, hash: hash.toString(16).padStart(8, '0') };
  });

export const getPlotTraceSamples = (page: Page) =>
  page.evaluate(() => {
    const graph = document.querySelector('.js-plotly-plot') as HTMLElement & {
      data?: Array<{
        name?: string;
        yaxis?: string;
        x?: unknown[];
        y?: unknown[];
      }>;
    };
    return (graph.data ?? []).slice(0, 3).map((trace) => ({
      name: trace.name,
      yaxis: trace.yaxis,
      length: trace.x?.length ?? 0,
      firstX: trace.x?.[0],
      firstY: trace.y?.[0],
      secondY: trace.y?.[1],
      lastX: trace.x?.at(-1),
      lastY: trace.y?.at(-1),
    }));
  });

export const getExpectedPlotSnapshot = (
  sensorCount: number,
  parameters: string[],
  dayCount: number
) => {
  let hash = 0x811c9dc5;
  const add = (value: unknown) => {
    const text = `${String(value)}\u0000`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  const startMs = Date.UTC(2026, 5, 1);
  const samples = dayCount * 480;
  let pointCount = 0;
  const visualizationParameters = parameters
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 2);
  for (const parameter of visualizationParameters) {
    for (let sensorNumber = 1; sensorNumber <= sensorCount; sensorNumber += 1) {
      const sensor = `sensor-${String(sensorNumber).padStart(3, '0')}`;
      add(parameters.length > 1 ? `${sensor} - ${getParameterDisplayLabel(parameter)}` : sensor);
      add(samples);
      add(samples);
      pointCount += samples;
      for (let sample = 0; sample < samples; sample += 1) {
        const timestampMs = startMs + sample * THREE_MINUTES_MS;
        add(new Date(timestampMs).toISOString());
        add(deterministicValue(sensor, parameter, timestampMs));
      }
    }
  }
  return {
    traceCount: sensorCount * Math.min(parameters.length, 2),
    pointCount,
    hash: hash.toString(16).padStart(8, '0'),
  };
};

export const getCompletedDatasetSnapshot = (page: Page) =>
  page.evaluate(() => {
    const rows = ((window as typeof window & { __phase4CompletedRows?: Array<{
      timestamp: unknown;
      sensor: unknown;
      parameter: unknown;
      value: unknown;
      label?: unknown;
      location?: unknown;
    }> }).__phase4CompletedRows ?? []);
    let hash = 0x811c9dc5;
    const add = (value: unknown) => {
      const text = `${String(value)}\u0000`;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    };
    for (const row of rows) {
      add(row.timestamp);
      add(row.sensor);
      add(row.parameter);
      add(row.value);
      add(row.label ?? null);
      add(row.location ?? null);
    }
    return { rowCount: rows.length, hash: hash.toString(16).padStart(8, '0') };
  });

export const getExpectedDatasetSnapshot = (
  sensorCount: number,
  parameters: string[],
  dayCount: number
) => {
  let hash = 0x811c9dc5;
  const add = (value: unknown) => {
    const text = `${String(value)}\u0000`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  const startMs = Date.UTC(2026, 5, 1);
  const sortedParameters = parameters.slice().sort((left, right) => left.localeCompare(right));
  for (let sample = 0; sample < dayCount * 480; sample += 1) {
    const timestampMs = startMs + sample * THREE_MINUTES_MS;
    const timestamp = new Date(timestampMs).toISOString();
    for (let sensorNumber = 1; sensorNumber <= sensorCount; sensorNumber += 1) {
      const sensor = `sensor-${String(sensorNumber).padStart(3, '0')}`;
      for (const parameter of sortedParameters) {
        add(timestamp);
        add(sensor);
        add(parameter);
        add(deterministicValue(sensor, parameter, timestampMs));
        add(null);
        add(null);
      }
    }
  }
  return {
    rowCount: sensorCount * sortedParameters.length * dayCount * 480,
    hash: hash.toString(16).padStart(8, '0'),
  };
};

export const getFetchBenchmarkEvents = (page: Page) =>
  page.evaluate(() => (
    window as typeof window & { __phase4FetchEvents?: unknown[] }
  ).__phase4FetchEvents ?? []);

export const getScatterBenchmarkResults = (page: Page) =>
  page.evaluate(() => (
    window as typeof window & { __phase4ScatterResults?: unknown[] }
  ).__phase4ScatterResults ?? []);

export const getLongTaskSummary = (page: Page) =>
  page.evaluate(() => {
    const durations = (
      window as typeof window & { __phase4LongTasks?: number[] }
    ).__phase4LongTasks ?? [];
    return {
      count: durations.length,
      totalMs: durations.reduce((sum, duration) => sum + duration, 0),
      maxMs: durations.length > 0 ? Math.max(...durations) : 0,
    };
  });

export const startBrowserMetrics = async (page: Page) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const read = async () => {
    const result = await session.send('Performance.getMetrics') as {
      metrics: Array<{ name: string; value: number }>;
    };
    return Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]));
  };
  const before = await read();
  return async () => {
    const after = await read();
    await session.detach();
    const names = [
      'TaskDuration',
      'ScriptDuration',
      'LayoutDuration',
      'RecalcStyleDuration',
    ];
    return {
      JSHeapUsedSize: after.JSHeapUsedSize,
      JSHeapTotalSize: after.JSHeapTotalSize,
      deltas: Object.fromEntries(
        names.map((name) => [name, (after[name] ?? 0) - (before[name] ?? 0)])
      ),
    };
  };
};

export const getBrowserMetrics = async (page: Page) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const result = await session.send('Performance.getMetrics') as {
    metrics: Array<{ name: string; value: number }>;
  };
  await session.detach();
  const wanted = new Set([
    'JSHeapUsedSize',
    'JSHeapTotalSize',
    'TaskDuration',
    'ScriptDuration',
    'LayoutDuration',
    'RecalcStyleDuration',
  ]);
  return Object.fromEntries(
    result.metrics.filter(({ name }) => wanted.has(name)).map(({ name, value }) => [name, value])
  );
};

export const probeResponsiveness = (page: Page) =>
  page.evaluate(async () => {
    const started = performance.now();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    return performance.now() - started;
  });
