import React from 'react';
import ReactDOM from 'react-dom/client';
import { API_ENDPOINTS } from '../config';
import ScatterPlot, {
  type ScatterPlotBenchmarkResult,
} from '../components/graph-components/ScatterPlot';
import {
  DEFAULT_FETCH_PAGE_SIZE,
  fetchDataPageStream,
  type FetchDataPagePayload,
} from '../utils/fetchDataPages';
import './phase4c0StageDecomposition.css';

type WorkloadId = 'C0-A' | 'C0-B' | 'C0-C';

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
  responseHeaderMs: number;
  responseBodyAcquisitionMs: number;
  totalResourceMs: number | null;
  requestToResponseStartMs: number | null;
  responseDownloadMs: number | null;
  transferSize: number | null;
  encodedBodySize: number | null;
  decodedBodySize: number | null;
  contentLength: number | null;
}

interface BrowserResult {
  workloadId: WorkloadId;
  endpoint: string;
  rows: number;
  pages: number;
  complete: boolean;
  queryId: string;
  snapshotAt: string;
  requestPlanningMs: number;
  responseHeaderWaitMs: number;
  responseBodyAcquisitionMs: number;
  networkResourceDurationMs: number;
  requestToResponseStartMs: number;
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
  browserHeapBeforeBytes: number | null;
  browserHeapAfterBytes: number | null;
  requests: RequestTiming[];
}

declare global {
  interface Window {
    __phase4c0Result?: BrowserResult;
    __phase4c0Error?: string;
  }
}

const SENSORS = [
  'fd002124b0013246e81',
  'fd002124b0013247484',
  'fd002124b001324bf01',
  'fd002124b001324f802',
  'fd002124b001324f986',
  'fd002124b0021f89c5b',
  'fd002124b0021f9feb1',
  'fd002124b0021f9fecc',
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
const WORKLOADS: Record<WorkloadId, { start: string; end: string }> = {
  'C0-A': { start: '2026-05-01', end: '2026-05-02' },
  'C0-B': { start: '2026-05-01', end: '2026-05-06' },
  'C0-C': { start: '2026-05-01', end: '2026-05-20' },
};

const heapUsed = (): number | null => {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
};

const sum = (values: Array<number | null>): number =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

const App = () => {
  const requested = (new URLSearchParams(location.search).get('workload') ?? 'C0-A') as WorkloadId;
  const workloadId = requested in WORKLOADS ? requested : 'C0-A';
  const workload = WORKLOADS[workloadId];
  const [status, setStatus] = React.useState('ready');
  const [plotRows, setPlotRows] = React.useState<FrontendRow[] | null>(null);
  const pending = React.useRef<{
    partial: Omit<BrowserResult, 'reactPublicationMs' | 'tracePreparationMs' | 'plotlyRenderMs' | 'plottedTraces' | 'plottedPoints' | 'totalThroughPlotMs' | 'browserHeapAfterBytes'>;
    publishStarted: number;
    pullStarted: number;
  } | null>(null);

  const run = async () => {
    window.__phase4c0Result = undefined;
    window.__phase4c0Error = undefined;
    setPlotRows(null);
    setStatus('running');
    performance.clearResourceTimings();
    const planningStarted = performance.now();
    const payload: FetchDataPagePayload = {
      owner: 'f4dv2',
      mac_address: 'd83adde261b0',
      experimentId: 2,
      experiment: 'timezone',
      selectedSensors: [...SENSORS],
      selectedParameters: [...PARAMETERS],
      dateRange: {
        start: `${workload.start}T00:00:00.000Z`,
        end: `${workload.end}T23:59:59.999Z`,
      },
      pageSize: DEFAULT_FETCH_PAGE_SIZE,
    };
    const requestPlanningMs = performance.now() - planningStarted;
    const controller = new AbortController();
    const rows: FrontendRow[] = [];
    const requests: RequestTiming[] = [];
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
        API_ENDPOINTS.FETCH_DATA_V2_PAGE,
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
          const entries = performance.getEntriesByName(API_ENDPOINTS.FETCH_DATA_V2_PAGE);
          const resource = entries.at(-1) as PerformanceResourceTiming | undefined;
          const detailedTimingAvailable = Boolean(resource && resource.responseStart > 0);
          requests.push({
            requestNumber,
            responseHeaderMs,
            responseBodyAcquisitionMs,
            totalResourceMs: resource?.duration ?? null,
            requestToResponseStartMs: detailedTimingAvailable && resource
              ? resource.responseStart - resource.startTime
              : null,
            responseDownloadMs: detailedTimingAvailable && resource
              ? resource.responseEnd - resource.responseStart
              : null,
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
      pending.current = {
        partial: {
          workloadId,
          endpoint: API_ENDPOINTS.FETCH_DATA_V2_PAGE,
          rows: rows.length,
          pages: stream.pages,
          complete: rows.length === stream.rows,
          queryId: stream.queryId,
          snapshotAt: stream.snapshotAt,
          requestPlanningMs,
          responseHeaderWaitMs: sum(requests.map((item) => item.responseHeaderMs)),
          responseBodyAcquisitionMs: sum(
            requests.map((item) => item.responseBodyAcquisitionMs)
          ),
          networkResourceDurationMs: sum(requests.map((item) => item.totalResourceMs)),
          requestToResponseStartMs: sum(requests.map((item) => item.requestToResponseStartMs)),
          responseDownloadMs: sum(requests.map((item) => item.responseDownloadMs)),
          transferSize: sum(requests.map((item) => item.transferSize)),
          encodedBodySize: sum(requests.map((item) => item.encodedBodySize)),
          decodedBodySize: sum(requests.map((item) => item.decodedBodySize)),
          contentLengthBytes: sum(requests.map((item) => item.contentLength)),
          browserJsonParseMs: parseMs,
          frontendAccumulationMs: accumulationMs,
          finalSortMs,
          browserHeapBeforeBytes,
          requests,
        },
        publishStarted,
        pullStarted,
      };
      setStatus('publishing-and-plotting');
      setPlotRows(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.__phase4c0Error = message;
      setStatus(`failed:${message}`);
    }
  };

  const finishPlot = (plot: ScatterPlotBenchmarkResult) => {
    const value = pending.current;
    if (!value) return;
    const completed = performance.now();
    window.__phase4c0Result = {
      ...value.partial,
      reactPublicationMs: Math.max(0, plot.totalMs - plot.tracePreparationMs - plot.plotlyRenderMs)
        + (completed - value.publishStarted - plot.totalMs),
      tracePreparationMs: plot.tracePreparationMs,
      plotlyRenderMs: plot.plotlyRenderMs,
      plottedTraces: plot.traceCount,
      plottedPoints: plot.renderedPointCount,
      totalThroughPlotMs: completed - value.pullStarted,
      browserHeapAfterBytes: heapUsed(),
    };
    pending.current = null;
    setStatus(`complete:${value.partial.rows}`);
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>Field4D Phase 4C.0 read-only stage benchmark</h1>
      <p>Workload {workloadId}: {workload.start} through {workload.end}</p>
      <button type="button" onClick={run}>Run read-only paged pull</button>
      <p role="status" data-testid="phase4c0-status">{status}</p>
      {plotRows && (
        <section style={{ width: '100%', height: 700 }} data-testid="phase4c0-plot-shell">
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
