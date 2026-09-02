import React, { useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { API_ENDPOINTS } from '../config';
import {
  MAX_TESTED_MERGED_ROWS,
  SENSOR_CHUNK_SIZE,
  buildUtcDayWindows,
  computeDaysPerChunk,
} from '../utils/dateChunking';

interface ExperimentSummary {
  experimentId: number;
  experimentName: string;
  sensors: string[];
  parameters: string[];
}

interface ApiRow {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number | null;
  label: string | null;
  location: string | null;
}

interface FrontendRow extends ApiRow {}

interface RequestMetric {
  requestNumber: number;
  dateRange: { start: string; end: string };
  sensorCount: number;
  parameterCount: number;
  rows: number;
  responseHeaderMs: number;
  responseJsonParseMs: number;
  transformMergeMs: number;
  requestTotalMs: number;
  responseBytes: number | null;
  contentEncoding: string | null;
  resourceTiming: {
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
    duration: number;
  } | null;
}

interface BrowserAuditResult {
  workloadId: string;
  startDate: string;
  endDate: string;
  selectedSensorCount: number;
  selectedParameterCount: number;
  sensorChunkSize: number;
  dateChunkDays: number[];
  requestPlanningMs: number;
  httpRequests: number;
  requestScheduling: 'strictly sequential';
  retries: number;
  rows: number;
  responseBytes: number | null;
  responseJsonParseMs: number;
  transformMergeMs: number;
  finalSortMs: number;
  reactPublishMs: number;
  totalPullMs: number;
  browserHeapBeforeBytes: number | null;
  browserHeapAfterBytes: number | null;
  requests: RequestMetric[];
}

declare global {
  interface Window {
    __phase4b0BrowserResult?: BrowserAuditResult;
    __phase4b0BrowserError?: string;
  }
}

const OWNER = 'f4dv2';
const MAC_ADDRESS = 'd83adde261b0';
const EXPERIMENT_ID = 2;
const EXPERIMENT_NAME = 'timezone';
const WORKLOADS = {
  R1: { start: '2026-05-01', end: '2026-05-02' },
  R2: { start: '2026-05-01', end: '2026-05-06' },
  R3: { start: '2026-05-01', end: '2026-05-20' },
} as const;

const getHeapUsed = (): number | null => {
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  }).memory;
  return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
};

const makeUtcBounds = (startDate: string, endDate: string) => ({
  start: `${startDate}T00:00:00.000Z`,
  end: `${endDate}T23:59:59.999Z`,
});

const latestResourceTiming = (): RequestMetric['resourceTiming'] => {
  const entries = performance.getEntriesByName(API_ENDPOINTS.FETCH_DATA);
  const entry = entries.at(-1) as PerformanceResourceTiming | undefined;
  return entry
    ? {
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        duration: entry.duration,
      }
    : null;
};

const App = () => {
  const query = new URLSearchParams(window.location.search);
  const requestedWorkload = (query.get('workload') ?? 'R1').toUpperCase();
  const workloadId = requestedWorkload in WORKLOADS
    ? requestedWorkload as keyof typeof WORKLOADS
    : 'R1';
  const workload = WORKLOADS[workloadId];
  const [status, setStatus] = useState('ready');
  const [rows, setRows] = useState<FrontendRow[]>([]);
  const pendingPublish = useRef<{
    result: Omit<BrowserAuditResult, 'reactPublishMs' | 'totalPullMs' | 'browserHeapAfterBytes'>;
    publishStarted: number;
    pullStarted: number;
  } | null>(null);

  useLayoutEffect(() => {
    const pending = pendingPublish.current;
    if (!pending || rows.length !== pending.result.rows) return;
    const completed = performance.now();
    const result: BrowserAuditResult = {
      ...pending.result,
      reactPublishMs: completed - pending.publishStarted,
      totalPullMs: completed - pending.pullStarted,
      browserHeapAfterBytes: getHeapUsed(),
    };
    window.__phase4b0BrowserResult = result;
    pendingPublish.current = null;
    setStatus(`complete:${result.rows}`);
  }, [rows]);

  const run = async () => {
    setStatus('loading-metadata');
    window.__phase4b0BrowserResult = undefined;
    window.__phase4b0BrowserError = undefined;
    performance.clearResourceTimings();
    try {
      const summaryResponse = await fetch(API_ENDPOINTS.EXPERIMENT_SUMMARY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: OWNER,
          mac_address: MAC_ADDRESS,
          experiments: ['*'],
        }),
      });
      if (!summaryResponse.ok) {
        throw new Error(`experiment-summary returned HTTP ${summaryResponse.status}`);
      }
      const summaries = await summaryResponse.json() as ExperimentSummary[];
      const summary = summaries.find((candidate) => (
        candidate.experimentId === EXPERIMENT_ID
        && candidate.experimentName === EXPERIMENT_NAME
      ));
      if (!summary) throw new Error('Selected experiment metadata was not returned');

      const sensors = summary.sensors.slice();
      const parameters = summary.parameters.slice();
      const planningStarted = performance.now();
      const sensorChunks: string[][] = [];
      for (let index = 0; index < sensors.length; index += SENSOR_CHUNK_SIZE) {
        sensorChunks.push(sensors.slice(index, index + SENSOR_CHUNK_SIZE));
      }
      const overall = makeUtcBounds(workload.start, workload.end);
      const dateWindowsBySensorChunk = sensorChunks.map((sensorChunk) => (
        buildUtcDayWindows(
          overall.start,
          overall.end,
          computeDaysPerChunk(sensorChunk.length, parameters.length)
        )
      ));
      const requestPlanningMs = performance.now() - planningStarted;
      const chunksTotal = dateWindowsBySensorChunk.reduce(
        (total, windows) => total + windows.length,
        0
      );

      const pullStarted = performance.now();
      const browserHeapBeforeBytes = getHeapUsed();
      const transformedData: FrontendRow[] = [];
      const requests: RequestMetric[] = [];
      let requestNumber = 0;
      let parseTotal = 0;
      let transformTotal = 0;
      let responseBytesTotal = 0;
      let responseBytesKnown = true;
      setStatus(`loading:0/${chunksTotal}`);

      for (const [sensorIndex, sensorChunk] of sensorChunks.entries()) {
        for (const dateRange of dateWindowsBySensorChunk[sensorIndex]) {
          requestNumber += 1;
          const requestStarted = performance.now();
          const response = await fetch(API_ENDPOINTS.FETCH_DATA, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              owner: OWNER,
              mac_address: MAC_ADDRESS,
              experimentId: EXPERIMENT_ID,
              experiment: EXPERIMENT_NAME,
              selectedSensors: sensorChunk,
              selectedParameters: parameters,
              dateRange,
            }),
          });
          const responseHeaderMs = performance.now() - requestStarted;
          if (!response.ok) {
            throw new Error(`fetch-data returned HTTP ${response.status}`);
          }
          const parseStarted = performance.now();
          const data = await response.json() as ApiRow[];
          const responseJsonParseMs = performance.now() - parseStarted;
          parseTotal += responseJsonParseMs;

          if (transformedData.length + data.length > MAX_TESTED_MERGED_ROWS) {
            throw new Error(`Current browser safety limit exceeded at ${transformedData.length + data.length} rows`);
          }
          const transformStarted = performance.now();
          for (const row of data) {
            transformedData.push({
              timestamp: row.timestamp,
              sensor: row.sensor,
              parameter: row.parameter,
              value: row.value,
              label: row.label,
              location: row.location,
            });
          }
          const transformMergeMs = performance.now() - transformStarted;
          transformTotal += transformMergeMs;
          const responseBytesHeader = response.headers.get('content-length');
          const responseBytes = responseBytesHeader === null
            ? null
            : Number(responseBytesHeader);
          if (responseBytes === null || !Number.isFinite(responseBytes)) {
            responseBytesKnown = false;
          } else {
            responseBytesTotal += responseBytes;
          }
          requests.push({
            requestNumber,
            dateRange,
            sensorCount: sensorChunk.length,
            parameterCount: parameters.length,
            rows: data.length,
            responseHeaderMs,
            responseJsonParseMs,
            transformMergeMs,
            requestTotalMs: performance.now() - requestStarted,
            responseBytes,
            contentEncoding: response.headers.get('content-encoding'),
            resourceTiming: latestResourceTiming(),
          });
          setStatus(`loading:${requestNumber}/${chunksTotal}`);
        }
      }

      const sortStarted = performance.now();
      transformedData.sort(
        (left, right) => (
          left.timestamp.localeCompare(right.timestamp)
          || left.sensor.localeCompare(right.sensor)
          || left.parameter.localeCompare(right.parameter)
        )
      );
      const finalSortMs = performance.now() - sortStarted;
      const publishStarted = performance.now();
      pendingPublish.current = {
        result: {
          workloadId,
          startDate: workload.start,
          endDate: workload.end,
          selectedSensorCount: sensors.length,
          selectedParameterCount: parameters.length,
          sensorChunkSize: SENSOR_CHUNK_SIZE,
          dateChunkDays: Array.from(new Set(
            dateWindowsBySensorChunk.flatMap((windows) => windows.map((window) => (
              Math.round((Date.parse(window.end) - Date.parse(window.start) + 1) / 86_400_000)
            )))
          )).sort(),
          requestPlanningMs,
          httpRequests: requests.length,
          requestScheduling: 'strictly sequential',
          retries: 0,
          rows: transformedData.length,
          responseBytes: responseBytesKnown ? responseBytesTotal : null,
          responseJsonParseMs: parseTotal,
          transformMergeMs: transformTotal,
          finalSortMs,
          browserHeapBeforeBytes,
          requests,
        },
        publishStarted,
        pullStarted,
      };
      setStatus('publishing');
      setRows(transformedData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.__phase4b0BrowserError = message;
      setStatus(`failed:${message}`);
    }
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Field4D Phase 4B0 browser pull audit</h1>
      <p>Workload: {workloadId} ({workload.start} through {workload.end})</p>
      <button type="button" onClick={run}>Run read-only pull</button>
      <p role="status" data-testid="phase4b0-status">{status}</p>
      <p data-testid="phase4b0-row-count">Published rows: {rows.length}</p>
    </main>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
