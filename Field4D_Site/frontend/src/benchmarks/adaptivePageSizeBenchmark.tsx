import React from 'react';
import ReactDOM from 'react-dom/client';
import ScatterPlot, {
  type ScatterPlotBenchmarkResult,
} from '../components/graph-components/ScatterPlot';
import {
  fetchDataPageStream,
  type FetchDataPagePayload,
} from '../utils/fetchDataPages';
import './phase4c0StageDecomposition.css';

interface FrontendRow {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number | null;
  label: string | null;
  location: string | null;
}

interface RequestTiming {
  requestNumber: number;
  rows: number;
  responseHeaderMs: number;
  responseBodyAcquisitionMs: number;
  requestToResponseStartMs: number | null;
  responseDownloadMs: number | null;
  transferSize: number | null;
  encodedBodySize: number | null;
  decodedBodySize: number | null;
  contentLength: number | null;
}

interface LongTaskSummary {
  count: number;
  totalMs: number;
  maxMs: number;
}

interface BrowserResult {
  pageSize: number;
  endpoint: string;
  rows: number;
  pages: number;
  complete: boolean;
  queryId: string;
  snapshotAt: string;
  responseHeaderWaitMs: number;
  responseBodyAcquisitionMs: number;
  responseDownloadMs: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  contentLengthBytes: number;
  browserJsonParseMs: number;
  frontendAccumulationMs: number;
  finalSortMs: number;
  reactPublicationMs: number;
  tracePreparationMs: number;
  plotlyRenderMs: number;
  plottedTraces: number;
  plottedPoints: number;
  totalThroughPlotMs: number;
  firstProgressMs: number;
  progressEventCount: number;
  progressIntervalsMs: number[];
  browserHeapBeforeBytes: number | null;
  browserHeapAfterBytes: number | null;
  browserPeakHeapBytes: number | null;
  longTasks: LongTaskSummary;
  requests: RequestTiming[];
}

declare global {
  interface Window {
    __adaptivePageSizeResult?: BrowserResult;
    __adaptivePageSizeError?: string;
    gc?: () => void;
  }
}

const ENDPOINT = '/api/v2/fetch-data-page';
const SENSORS = [
  'fd002124b0013246e81', 'fd002124b0013247484', 'fd002124b001324bf01',
  'fd002124b001324f802', 'fd002124b001324f986', 'fd002124b0021f89c5b',
  'fd002124b0021f9feb1', 'fd002124b0021f9fecc',
];
const PARAMETERS = [
  'advanced_package_number', 'air_velocity', 'batmon_battery_voltage', 'battery',
  'battery_t', 'bmp_390_u18_pressure', 'bmp_390_u18_temperature',
  'bmp_390_u19_pressure', 'bmp_390_u19_temperature', 'bmp_press', 'bmp_temp',
  'co2_ppm', 'hdc_2010_u13_humidity', 'hdc_2010_u13_temperature',
  'hdc_2010_u16_humidity', 'hdc_2010_u16_temperature', 'hdc_2010_u17_humidity',
  'hdc_2010_u17_temperature', 'hdc_humidity', 'hdc_temp', 'light',
  'opt_3001_u1_light_intensity', 'opt_3001_u2_light_intensity',
  'opt_3001_u3_light_intensity', 'opt_3001_u4_light_intensity',
  'opt_3001_u5_light_intensity', 'package_number',
  'ztp_315_ambient_temperature', 'ztp_315_object_temperature',
];

const heapUsed = (): number | null => {
  const value = (performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  }).memory?.usedJSHeapSize;
  return typeof value === 'number' ? value : null;
};

const sum = (values: Array<number | null>): number =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

const App = () => {
  const parsedPageSize = Number(new URLSearchParams(location.search).get('pageSize'));
  const pageSize = Number.isSafeInteger(parsedPageSize) && parsedPageSize > 0
    ? parsedPageSize
    : 20_000;
  const [status, setStatus] = React.useState('ready');
  const [plotRows, setPlotRows] = React.useState<FrontendRow[] | null>(null);
  const pending = React.useRef<{
    partial: Omit<BrowserResult,
      'reactPublicationMs' | 'tracePreparationMs' | 'plotlyRenderMs' |
      'plottedTraces' | 'plottedPoints' | 'totalThroughPlotMs' |
      'browserHeapAfterBytes' | 'browserPeakHeapBytes' | 'longTasks'>;
    publishStarted: number;
    pullStarted: number;
    peakHeap: number | null;
    heapTimer: number;
    longTaskObserver: PerformanceObserver | null;
    longTaskDurations: number[];
  } | null>(null);

  const run = async () => {
    window.__adaptivePageSizeResult = undefined;
    window.__adaptivePageSizeError = undefined;
    setPlotRows(null);
    setStatus('running');
    window.gc?.();
    performance.clearResourceTimings();
    const payload: FetchDataPagePayload = {
      owner: 'f4dv2',
      mac_address: 'd83adde261b0',
      experimentId: 2,
      experiment: 'timezone',
      selectedSensors: [...SENSORS],
      selectedParameters: [...PARAMETERS],
      dateRange: {
        start: '2026-05-01T00:00:00.000Z',
        end: '2026-05-20T23:59:59.999Z',
      },
      pageSize,
    };
    const controller = new AbortController();
    const rows: FrontendRow[] = [];
    const requests: RequestTiming[] = [];
    const progressAt: number[] = [];
    const longTaskDurations: number[] = [];
    let longTaskObserver: PerformanceObserver | null = null;
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTaskDurations.push(entry.duration);
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch {
      longTaskObserver = null;
    }
    let peakHeap = heapUsed();
    const heapTimer = window.setInterval(() => {
      const current = heapUsed();
      if (current !== null) peakHeap = Math.max(peakHeap ?? current, current);
    }, 25);
    let parseMs = 0;
    let accumulationMs = 0;
    let requestNumber = 0;
    let requestStarted = 0;
    let responseHeaderMs = 0;
    let responseBodyAcquisitionMs = 0;
    let contentLength: number | null = null;
    const pullStarted = performance.now();
    const browserHeapBeforeBytes = heapUsed();
    try {
      const timedFetch: typeof fetch = async (input, init) => {
        requestNumber += 1;
        requestStarted = performance.now();
        const response = await fetch(input, init);
        responseHeaderMs = performance.now() - requestStarted;
        const parsedContentLength = Number(response.headers.get('content-length'));
        contentLength = Number.isFinite(parsedContentLength) ? parsedContentLength : null;
        const bodyStarted = performance.now();
        const bodyText = await response.text();
        responseBodyAcquisitionMs = performance.now() - bodyStarted;
        return new Response(bodyText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      };
      const stream = await fetchDataPageStream(
        ENDPOINT,
        payload,
        controller.signal,
        ({ page, parseMs: pageParseMs }) => {
          parseMs += pageParseMs;
          const accumulationStarted = performance.now();
          for (const row of page.rows) {
            rows.push({
              timestamp: row.timestamp,
              sensor: row.sensor,
              parameter: row.parameter,
              value: row.value,
              label: row.label,
              location: row.location,
            });
          }
          accumulationMs += performance.now() - accumulationStarted;
          progressAt.push(performance.now() - pullStarted);
          const entries = performance.getEntriesByName(ENDPOINT);
          const resource = entries.at(-1) as PerformanceResourceTiming | undefined;
          const detailed = Boolean(resource && resource.responseStart > 0);
          requests.push({
            requestNumber,
            rows: page.rows.length,
            responseHeaderMs,
            responseBodyAcquisitionMs,
            requestToResponseStartMs: detailed && resource
              ? resource.responseStart - resource.startTime : null,
            responseDownloadMs: detailed && resource
              ? resource.responseEnd - resource.responseStart : null,
            transferSize: resource?.transferSize ?? null,
            encodedBodySize: resource?.encodedBodySize ?? null,
            decodedBodySize: resource?.decodedBodySize ?? null,
            contentLength,
          });
          setStatus(`running:${page.cumulative_rows}/${page.total_rows}`);
        },
        timedFetch
      );
      const sortStarted = performance.now();
      rows.sort((left, right) => (
        left.timestamp.localeCompare(right.timestamp)
        || left.sensor.localeCompare(right.sensor)
        || left.parameter.localeCompare(right.parameter)
      ));
      const finalSortMs = performance.now() - sortStarted;
      const publishStarted = performance.now();
      const progressIntervals = progressAt.map((value, index) => (
        index === 0 ? value : value - progressAt[index - 1]
      ));
      pending.current = {
        partial: {
          pageSize,
          endpoint: ENDPOINT,
          rows: rows.length,
          pages: stream.pages,
          complete: rows.length === stream.rows,
          queryId: stream.queryId,
          snapshotAt: stream.snapshotAt,
          responseHeaderWaitMs: sum(requests.map((item) => item.responseHeaderMs)),
          responseBodyAcquisitionMs: sum(
            requests.map((item) => item.responseBodyAcquisitionMs)
          ),
          responseDownloadMs: sum(requests.map((item) => item.responseDownloadMs)),
          transferSize: sum(requests.map((item) => item.transferSize)),
          encodedBodySize: sum(requests.map((item) => item.encodedBodySize)),
          decodedBodySize: sum(requests.map((item) => item.decodedBodySize)),
          contentLengthBytes: sum(requests.map((item) => item.contentLength)),
          browserJsonParseMs: parseMs,
          frontendAccumulationMs: accumulationMs,
          finalSortMs,
          firstProgressMs: progressAt[0] ?? 0,
          progressEventCount: progressAt.length,
          progressIntervalsMs: progressIntervals,
          browserHeapBeforeBytes,
          requests,
        },
        publishStarted,
        pullStarted,
        peakHeap,
        heapTimer,
        longTaskObserver,
        longTaskDurations,
      };
      setStatus('publishing-and-plotting');
      setPlotRows(rows);
    } catch (error) {
      window.clearInterval(heapTimer);
      longTaskObserver?.disconnect();
      const message = error instanceof Error ? error.message : String(error);
      window.__adaptivePageSizeError = message;
      setStatus(`failed:${message}`);
    }
  };

  const finishPlot = (plot: ScatterPlotBenchmarkResult) => {
    const value = pending.current;
    if (!value) return;
    window.clearInterval(value.heapTimer);
    value.longTaskObserver?.disconnect();
    const browserHeapAfterBytes = heapUsed();
    const peak = [value.peakHeap, browserHeapAfterBytes]
      .filter((item): item is number => item !== null);
    const completed = performance.now();
    window.__adaptivePageSizeResult = {
      ...value.partial,
      reactPublicationMs: Math.max(0, plot.totalMs - plot.tracePreparationMs - plot.plotlyRenderMs)
        + (completed - value.publishStarted - plot.totalMs),
      tracePreparationMs: plot.tracePreparationMs,
      plotlyRenderMs: plot.plotlyRenderMs,
      plottedTraces: plot.traceCount,
      plottedPoints: plot.renderedPointCount,
      totalThroughPlotMs: completed - value.pullStarted,
      browserHeapAfterBytes,
      browserPeakHeapBytes: peak.length ? Math.max(...peak) : null,
      longTasks: {
        count: value.longTaskDurations.length,
        totalMs: sum(value.longTaskDurations),
        maxMs: value.longTaskDurations.length ? Math.max(...value.longTaskDurations) : 0,
      },
    };
    pending.current = null;
    setStatus(`complete:${value.partial.rows}`);
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>Field4D adaptive page-size read-only benchmark</h1>
      <p>711,269-row workload; logical page size {pageSize.toLocaleString()}</p>
      <button type="button" onClick={run}>Run adaptive page-size pull</button>
      <p role="status" data-testid="adaptive-status">{status}</p>
      {plotRows && (
        <section style={{ width: '100%', height: 700 }} data-testid="adaptive-plot-shell">
          <ScatterPlot
            data={plotRows}
            selectedParameters={PARAMETERS}
            selectedSensors={SENSORS}
            rendererMode="svg"
            tracePreparationMode="indexed"
            onBenchmarkResult={finishPlot}
            containerClassName="phase4c0-plot"
          />
        </section>
      )}
    </main>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
