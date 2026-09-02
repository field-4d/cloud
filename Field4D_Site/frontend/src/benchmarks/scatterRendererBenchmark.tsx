import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import ScatterPlot, {
  type ScatterPlotBenchmarkResult,
  type ScatterRendererMode,
  type ScatterTracePreparationMode,
} from '../components/graph-components/ScatterPlot';
import {
  prepareSensorTracesIndexed,
  prepareSensorTracesLegacy,
  type PreparedSensorTrace,
  type ScatterSensorRow,
  type SensorTracePreparationOptions,
} from '../components/graph-components/sensorTracePreparation';
import '../index.css';
import './scatterRendererBenchmark.css';

type BenchmarkCaseId = 'A' | 'B' | 'C' | 'D';

interface BenchmarkCaseDefinition {
  id: BenchmarkCaseId;
  name: string;
  sensors: number;
  parameters: number;
  days: number;
}

interface BenchmarkRow {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number;
}

interface PreparedDataset {
  definition: BenchmarkCaseDefinition;
  rows: BenchmarkRow[];
  selectedSensors: string[];
  selectedParameters: string[];
  rawObservationHash: string;
  generation: number;
}

interface TraceSnapshot {
  type: string;
  mode: string;
  name: string;
  yaxis: string;
  pointCount: number;
  xHash: string;
  yHash: string;
  firstX: unknown;
  lastX: unknown;
  firstY: unknown;
  lastY: unknown;
}

interface RememberedTrace {
  type: string;
  mode: string;
  name: string;
  yaxis: string;
  x: unknown[];
  y: unknown[];
}

const CASES: Record<BenchmarkCaseId, BenchmarkCaseDefinition> = {
  A: { id: 'A', name: 'small baseline', sensors: 5, parameters: 1, days: 1 },
  B: { id: 'B', name: 'medium', sensors: 20, parameters: 2, days: 7 },
  C: { id: 'C', name: 'high rows, few traces', sensors: 5, parameters: 4, days: 30 },
  D: { id: 'D', name: 'many traces', sensors: 40, parameters: 1, days: 14 },
};

const PARAMETER_NAMES = ['hdc_temp', 'hdc_humidity', 'bmp_press', 'light'];
const PARAMETER_BASELINES = [24, 62, 1008, 450];
const THREE_MINUTES_MS = 3 * 60 * 1000;
const POINTS_PER_DAY = 480;
const BENCHMARK_RUN_TIMEOUT_MS = 2 * 60 * 1000;
const START_TIME_MS = Date.UTC(2026, 5, 1, 0, 0, 0, 0);

let currentDataset: PreparedDataset | null = null;
let datasetGeneration = 0;
let benchmarkRun = 0;
let rememberedTraces: { key: string; traces: RememberedTrace[] } | null = null;

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Benchmark root element was not found.');
const root = createRoot(rootElement);

function updateHash(hash: number, value: unknown): number {
  const text = `${String(value)}\u001f`;
  let next = hash >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    next ^= text.charCodeAt(i);
    next = Math.imul(next, 16777619) >>> 0;
  }
  return next;
}

function toHashString(hash: number): string {
  return hash.toString(16).padStart(8, '0');
}

function hashValues(values: unknown[]): string {
  let hash = 2166136261;
  for (const value of values) hash = updateHash(hash, value);
  return toHashString(hash);
}

function hashRawRows(rows: BenchmarkRow[]): string {
  let hash = 2166136261;
  for (const row of rows) {
    hash = updateHash(hash, row.timestamp);
    hash = updateHash(hash, row.sensor);
    hash = updateHash(hash, row.parameter);
    hash = updateHash(hash, row.value);
  }
  return toHashString(hash);
}

function buildDataset(caseId: BenchmarkCaseId): PreparedDataset {
  const definition = CASES[caseId];
  const selectedSensors = Array.from(
    { length: definition.sensors },
    (_, index) => `sensor-${String(index + 1).padStart(2, '0')}`
  );
  const selectedParameters = PARAMETER_NAMES.slice(0, definition.parameters);
  const timePointCount = definition.days * POINTS_PER_DAY;
  const rows = new Array<BenchmarkRow>(
    timePointCount * selectedSensors.length * selectedParameters.length
  );

  let rowIndex = 0;
  for (let timeIndex = 0; timeIndex < timePointCount; timeIndex += 1) {
    const timestamp = new Date(START_TIME_MS + timeIndex * THREE_MINUTES_MS).toISOString();
    const dayIndex = Math.floor(timeIndex / POINTS_PER_DAY);
    const withinDay = timeIndex % POINTS_PER_DAY;
    const dailyPhase = (withinDay / POINTS_PER_DAY) * Math.PI * 2;

    for (let sensorIndex = 0; sensorIndex < selectedSensors.length; sensorIndex += 1) {
      for (let parameterIndex = 0; parameterIndex < selectedParameters.length; parameterIndex += 1) {
        const dailySignal = Math.sin(dailyPhase + sensorIndex * 0.071) * (parameterIndex + 1);
        const secondarySignal = Math.cos(dailyPhase * 2 + parameterIndex * 0.13) * 0.15;
        const value = Number(
          (
            PARAMETER_BASELINES[parameterIndex]
            + sensorIndex * 0.125
            + dayIndex * 0.02
            + dailySignal
            + secondarySignal
          ).toFixed(6)
        );

        rows[rowIndex] = {
          timestamp,
          sensor: selectedSensors[sensorIndex],
          parameter: selectedParameters[parameterIndex],
          value,
        };
        rowIndex += 1;
      }
    }
  }

  datasetGeneration += 1;
  return {
    definition,
    rows,
    selectedSensors,
    selectedParameters,
    rawObservationHash: hashRawRows(rows),
    generation: datasetGeneration,
  };
}

function describeDataset(dataset: PreparedDataset) {
  return {
    ...dataset.definition,
    rawRowCount: dataset.rows.length,
    renderedParameters: Math.min(dataset.selectedParameters.length, 2),
    expectedTraceCount: dataset.selectedSensors.length * Math.min(dataset.selectedParameters.length, 2),
    expectedRenderedPointCount:
      dataset.definition.days
      * POINTS_PER_DAY
      * dataset.selectedSensors.length
      * Math.min(dataset.selectedParameters.length, 2),
    rawObservationHash: dataset.rawObservationHash,
    generation: dataset.generation,
    intervalMinutes: 3,
  };
}

function getGraphDiv(): any {
  const graph = document.querySelector('.js-plotly-plot');
  if (!graph) throw new Error('Plotly graph div was not found.');
  return graph;
}

function getTraceSnapshot(): TraceSnapshot[] {
  const graph = getGraphDiv();
  return (graph.data ?? []).map((trace: any) => {
    const x = Array.isArray(trace.x) ? trace.x : [];
    const y = Array.isArray(trace.y) ? trace.y : [];
    return {
      type: String(trace.type ?? ''),
      mode: String(trace.mode ?? ''),
      name: String(trace.name ?? ''),
      yaxis: String(trace.yaxis ?? 'y'),
      pointCount: x.length,
      xHash: hashValues(x),
      yHash: hashValues(y),
      firstX: x[0] ?? null,
      lastX: x[x.length - 1] ?? null,
      firstY: y[0] ?? null,
      lastY: y[y.length - 1] ?? null,
    };
  });
}

function cloneCurrentTraces(): RememberedTrace[] {
  const graph = getGraphDiv();
  return (graph.data ?? []).map((trace: any) => ({
    type: String(trace.type ?? ''),
    mode: String(trace.mode ?? ''),
    name: String(trace.name ?? ''),
    yaxis: String(trace.yaxis ?? 'y'),
    x: Array.isArray(trace.x) ? Array.from(trace.x) : [],
    y: Array.isArray(trace.y) ? Array.from(trace.y) : [],
  }));
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return Object.is(left, right)
    || (typeof left === 'number' && typeof right === 'number' && Number.isNaN(left) && Number.isNaN(right));
}

function compareCurrentTraces(key: string) {
  if (!rememberedTraces || rememberedTraces.key !== key) {
    throw new Error(`No remembered traces exist for ${key}.`);
  }

  const current = cloneCurrentTraces();
  const expected = rememberedTraces.traces;
  if (current.length !== expected.length) {
    return { equal: false, mismatch: `trace count ${current.length} != ${expected.length}` };
  }

  for (let traceIndex = 0; traceIndex < current.length; traceIndex += 1) {
    const left = expected[traceIndex];
    const right = current[traceIndex];
    for (const field of ['mode', 'name', 'yaxis'] as const) {
      if (left[field] !== right[field]) {
        return { equal: false, mismatch: `trace ${traceIndex} ${field} differs` };
      }
    }
    if (left.x.length !== right.x.length || left.y.length !== right.y.length) {
      return { equal: false, mismatch: `trace ${traceIndex} point count differs` };
    }
    for (let pointIndex = 0; pointIndex < left.x.length; pointIndex += 1) {
      if (!valuesEqual(left.x[pointIndex], right.x[pointIndex])) {
        return { equal: false, mismatch: `trace ${traceIndex} x[${pointIndex}] differs` };
      }
      if (!valuesEqual(left.y[pointIndex], right.y[pointIndex])) {
        return { equal: false, mismatch: `trace ${traceIndex} y[${pointIndex}] differs` };
      }
    }
  }

  return {
    equal: true,
    mismatch: null,
    traceCount: current.length,
    renderedPointCount: current.reduce((total, trace) => total + trace.x.length, 0),
  };
}

function nextFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

interface BenchmarkViewProps {
  dataset: PreparedDataset;
  rendererMode: ScatterRendererMode;
  tracePreparationMode: ScatterTracePreparationMode;
  onResult: (result: ScatterPlotBenchmarkResult) => void;
}

const BenchmarkView: React.FC<BenchmarkViewProps> = ({
  dataset,
  rendererMode,
  tracePreparationMode,
  onResult,
}) => {
  const [expanded, setExpanded] = useState(false);
  const plot = (
    <ScatterPlot
      data={dataset.rows}
      selectedParameters={dataset.selectedParameters}
      selectedSensors={dataset.selectedSensors}
      experimentName={`Phase 1 case ${dataset.definition.id}`}
      getSensorDisplayName={(sensor) => sensor}
      groupBy="sensor"
      rendererMode={rendererMode}
      tracePreparationMode={tracePreparationMode}
      onBenchmarkResult={onResult}
      containerClassName={expanded ? 'benchmark-expanded-plot' : 'benchmark-plot'}
    />
  );

  return (
    <main className="benchmark-page" data-case-id={dataset.definition.id} data-renderer={rendererMode}>
      <header className="benchmark-header">
        <h1>
          Case {dataset.definition.id}: {dataset.definition.name} — {rendererMode.toUpperCase()}
        </h1>
        <button type="button" data-testid="expand-plot" onClick={() => setExpanded(true)}>
          Expand Plot
        </button>
      </header>
      {expanded ? (
        <section className="benchmark-expanded-shell" data-testid="expanded-plot-shell">
          <button
            type="button"
            className="benchmark-expanded-close"
            data-testid="close-expanded-plot"
            onClick={() => setExpanded(false)}
          >
            Close
          </button>
          {plot}
        </section>
      ) : (
        <section className="benchmark-plot-shell" data-testid="plot-shell">
          {plot}
        </section>
      )}
    </main>
  );
};

async function prepare(caseId: BenchmarkCaseId) {
  if (!CASES[caseId]) throw new Error(`Unknown benchmark case: ${caseId}`);
  if (!currentDataset || currentDataset.definition.id !== caseId) {
    flushSync(() => root.render(null));
    await nextFrames();
    rememberedTraces = null;
    currentDataset = buildDataset(caseId);
  }
  return describeDataset(currentDataset);
}

async function run(
  caseId: BenchmarkCaseId,
  rendererMode: ScatterRendererMode,
  tracePreparationMode: ScatterTracePreparationMode = 'indexed'
) {
  await prepare(caseId);
  if (!currentDataset) throw new Error('Benchmark dataset was not prepared.');

  flushSync(() => root.render(null));
  await nextFrames();
  benchmarkRun += 1;
  const runId = benchmarkRun;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error(`Benchmark run ${runId} timed out.`)),
      BENCHMARK_RUN_TIMEOUT_MS
    );

    const onResult = (result: ScatterPlotBenchmarkResult) => {
      window.clearTimeout(timeout);
      resolve({
        runId,
        caseId,
        renderer: rendererMode,
        ...result,
        dataset: describeDataset(currentDataset as PreparedDataset),
      });
    };

    flushSync(() => {
      root.render(
        <BenchmarkView
          key={runId}
          dataset={currentDataset as PreparedDataset}
          rendererMode={rendererMode}
          tracePreparationMode={tracePreparationMode}
          onResult={onResult}
        />
      );
    });
  });
}

function getPreparationOptions(
  rows: ScatterSensorRow[],
  selectedSensors: string[],
  selectedParameters: string[],
  displayNames: Record<string, string> = {}
): SensorTracePreparationOptions {
  return {
    data: rows,
    limitedParameters: selectedParameters.slice(0, 2),
    selectedParameterCount: selectedParameters.length,
    selectedSensors,
    traceType: 'scatter',
    getSensorDisplayName: (sensor) => displayNames[sensor] ?? sensor,
    getSensorColor: (sensor) => {
      const hash = updateHash(2166136261, sensor);
      return `#${toHashString(hash).slice(0, 6)}`;
    },
  };
}

function comparePreparedTraces(
  legacy: PreparedSensorTrace[],
  indexed: PreparedSensorTrace[]
) {
  if (legacy.length !== indexed.length) {
    return { equal: false, mismatch: `trace count ${legacy.length} != ${indexed.length}` };
  }

  const traceHashes: Array<{ name: string; xHash: string; yHash: string; pointCount: number }> = [];
  for (let traceIndex = 0; traceIndex < legacy.length; traceIndex += 1) {
    const left = legacy[traceIndex];
    const right = indexed[traceIndex];
    for (const field of ['sensor', 'parameter'] as const) {
      if (left[field] !== right[field]) {
        return { equal: false, mismatch: `trace ${traceIndex} ${field} differs` };
      }
    }
    for (const field of ['type', 'mode', 'name', 'yaxis', 'hovertemplate'] as const) {
      if (left.trace[field] !== right.trace[field]) {
        return { equal: false, mismatch: `trace ${traceIndex} ${field} differs` };
      }
    }
    if (
      left.trace.line.color !== right.trace.line.color
      || left.trace.line.width !== right.trace.line.width
    ) {
      return { equal: false, mismatch: `trace ${traceIndex} line style differs` };
    }
    if (left.trace.x.length !== right.trace.x.length || left.trace.y.length !== right.trace.y.length) {
      return { equal: false, mismatch: `trace ${traceIndex} point count differs` };
    }
    for (let pointIndex = 0; pointIndex < left.trace.x.length; pointIndex += 1) {
      if (!valuesEqual(left.trace.x[pointIndex], right.trace.x[pointIndex])) {
        return { equal: false, mismatch: `trace ${traceIndex} x[${pointIndex}] differs` };
      }
      if (!valuesEqual(left.trace.y[pointIndex], right.trace.y[pointIndex])) {
        return { equal: false, mismatch: `trace ${traceIndex} y[${pointIndex}] differs` };
      }
    }
    traceHashes.push({
      name: left.trace.name,
      xHash: hashValues(left.trace.x),
      yHash: hashValues(left.trace.y),
      pointCount: left.trace.x.length,
    });
  }

  return {
    equal: true,
    mismatch: null,
    traceCount: legacy.length,
    renderedPointCount: legacy.reduce((total, item) => total + item.trace.x.length, 0),
    traceHashes,
  };
}

function comparePreparation(
  rows: ScatterSensorRow[],
  selectedSensors: string[],
  selectedParameters: string[],
  displayNames: Record<string, string> = {}
) {
  const options = getPreparationOptions(rows, selectedSensors, selectedParameters, displayNames);
  const rawHashBefore = hashRawRows(rows as BenchmarkRow[]);
  const legacy = prepareSensorTracesLegacy(options);
  const indexed = prepareSensorTracesIndexed(options);
  const comparison = comparePreparedTraces(legacy.preparedTraces, indexed.preparedTraces);
  const rawHashAfter = hashRawRows(rows as BenchmarkRow[]);
  const renderedPointCount = legacy.preparedTraces.reduce(
    (total, item) => total + item.trace.x.length,
    0
  );
  const encodeEvidenceValue = (value: unknown): unknown => {
    if (typeof value !== 'number') return value;
    if (Number.isNaN(value)) return { number: 'NaN' };
    if (value === Number.POSITIVE_INFINITY) return { number: 'Infinity' };
    if (value === Number.NEGATIVE_INFINITY) return { number: '-Infinity' };
    if (Object.is(value, -0)) return { number: '-0' };
    return value;
  };
  return {
    ...comparison,
    rawHashBefore,
    rawHashAfter,
    sourceUnchanged: rawHashBefore === rawHashAfter,
    legacyStats: legacy.stats,
    indexedStats: indexed.stats,
    traceSummary: indexed.preparedTraces.map(({ sensor, parameter, trace }) => ({
      sensor,
      parameter,
      type: trace.type,
      mode: trace.mode,
      name: trace.name,
      yaxis: trace.yaxis,
      line: trace.line,
      hovertemplate: trace.hovertemplate,
      pointCount: trace.x.length,
      xHash: hashValues(trace.x),
      yHash: hashValues(trace.y),
      ...(renderedPointCount <= 100
        ? {
            x: trace.x.map(encodeEvidenceValue),
            y: trace.y.map(encodeEvidenceValue),
          }
        : {}),
    })),
  };
}

function comparePreparedDataset(caseId: BenchmarkCaseId) {
  if (!currentDataset || currentDataset.definition.id !== caseId) {
    throw new Error(`Dataset ${caseId} must be prepared before comparison.`);
  }
  return comparePreparation(
    currentDataset.rows,
    currentDataset.selectedSensors,
    currentDataset.selectedParameters
  );
}

function runEdgeCaseEquivalence() {
  const t0 = '2026-06-01T00:00:00.000Z';
  const t1 = '2026-06-01T00:03:00.000Z';
  const t2 = '2026-06-01T00:11:00.000Z';
  const cases: Array<{
    id: string;
    rows: ScatterSensorRow[];
    sensors: string[];
    parameters: string[];
    displayNames: Record<string, string>;
  }> = [
    {
      id: 'one-sensor-one-parameter',
      rows: [{ timestamp: t0, sensor: '1', parameter: 'p1', value: 1 }],
      sensors: ['1'], parameters: ['p1'], displayNames: {},
    },
    {
      id: 'multiple-sensors-one-parameter-natural-ids',
      rows: [
        { timestamp: t0, sensor: '10', parameter: 'p1', value: 10 },
        { timestamp: t0, sensor: '2', parameter: 'p1', value: 2 },
        { timestamp: t0, sensor: '1', parameter: 'p1', value: 1 },
      ],
      sensors: ['10', '1', '2'], parameters: ['p1'], displayNames: {},
    },
    {
      id: 'two-parameters-selection-order-differs',
      rows: [
        { timestamp: t0, sensor: '2', parameter: 'p1', value: 21 },
        { timestamp: t0, sensor: '1', parameter: 'p2', value: 12 },
        { timestamp: t1, sensor: '1', parameter: 'p1', value: 11 },
        { timestamp: t1, sensor: '2', parameter: 'p2', value: 22 },
      ],
      sensors: ['1', '2'], parameters: ['p2', 'p1'], displayNames: {},
    },
    {
      id: 'sensor-missing-one-parameter',
      rows: [
        { timestamp: t0, sensor: '1', parameter: 'p1', value: 1 },
        { timestamp: t0, sensor: '2', parameter: 'p2', value: 2 },
      ],
      sensors: ['2', '1'], parameters: ['p1', 'p2'], displayNames: {},
    },
    {
      id: 'irregular-missing-and-duplicate-timestamps',
      rows: [
        { timestamp: t0, sensor: '1', parameter: 'p1', value: 1 },
        { timestamp: t0, sensor: '1', parameter: 'p1', value: 2 },
        { timestamp: null, sensor: '1', parameter: 'p1', value: 3 },
        { timestamp: t2, sensor: '1', parameter: 'p1', value: 4 },
      ],
      sensors: ['1'], parameters: ['p1'], displayNames: {},
    },
    {
      id: 'null-nan-and-special-values',
      rows: [
        { timestamp: t0, sensor: '1', parameter: 'p1', value: null },
        { timestamp: t1, sensor: '1', parameter: 'p1', value: Number.NaN },
        { timestamp: t2, sensor: '1', parameter: 'p1', value: Number.POSITIVE_INFINITY },
        { timestamp: '2026-06-01T00:14:00.000Z', sensor: '1', parameter: 'p1', value: -0 },
      ],
      sensors: ['1'], parameters: ['p1'], displayNames: {},
    },
    {
      id: 'sensor-selection-order-differs-from-encounter',
      rows: [
        { timestamp: t0, sensor: '1', parameter: 'p1', value: 1 },
        { timestamp: t0, sensor: '10', parameter: 'p1', value: 10 },
        { timestamp: t0, sensor: '2', parameter: 'p1', value: 2 },
      ],
      sensors: ['2', '10', '1'], parameters: ['p1'], displayNames: {},
    },
    {
      id: 'legacy-parameter-prefix-and-replacement-names',
      rows: [
        { timestamp: t0, sensor: '1', parameter: 'temp', value: 1 },
        { timestamp: t1, sensor: '2', parameter: 'SensorData_temp', value: 2 },
        { timestamp: t2, sensor: '10', parameter: 'temp', value: 10 },
      ],
      sensors: ['10', '2', '1'],
      parameters: ['SensorData_temp'],
      displayNames: { '1': 'north', '2': 'north', '10': 'north' },
    },
  ];

  return cases.map((edgeCase) => ({
    id: edgeCase.id,
    ...comparePreparation(
      edgeCase.rows,
      edgeCase.sensors,
      edgeCase.parameters,
      edgeCase.displayNames
    ),
  }));
}

function snapshot() {
  if (!currentDataset) throw new Error('Benchmark dataset was not prepared.');
  const graph = getGraphDiv();
  const traces = getTraceSnapshot();
  const rect = graph.getBoundingClientRect();
  return {
    dataset: describeDataset(currentDataset),
    rawObservationHashNow: hashRawRows(currentDataset.rows),
    traces,
    traceCount: traces.length,
    renderedPointCount: traces.reduce((total, trace) => total + trace.pointCount, 0),
    traceTypes: Array.from(new Set(traces.map((trace) => trace.type))),
    traceNames: traces.map((trace) => trace.name),
    yaxes: traces.map((trace) => trace.yaxis),
    graphRect: { width: rect.width, height: rect.height },
    modebarButtons: Array.from(document.querySelectorAll<HTMLElement>('.modebar-btn')).map(
      (button) => button.dataset.title ?? button.getAttribute('data-title') ?? ''
    ),
    webglCanvasCount: document.querySelectorAll('.gl-container canvas').length,
    svgTracePathCount: document.querySelectorAll('.scatterlayer .trace .js-line').length,
    xRange: graph._fullLayout?.xaxis?.range ? Array.from(graph._fullLayout.xaxis.range) : null,
    yRange: graph._fullLayout?.yaxis?.range ? Array.from(graph._fullLayout.yaxis.range) : null,
    y2Range: graph._fullLayout?.yaxis2?.range ? Array.from(graph._fullLayout.yaxis2.range) : null,
    devicePixelRatio: window.devicePixelRatio,
  };
}

function getWebGlInfo() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return { available: false, vendor: null, renderer: null };
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    available: true,
    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  };
}

window.field4dPhase1Benchmark = {
  cases: CASES,
  prepare,
  run,
  snapshot,
  rememberTraceObservations(key: string) {
    rememberedTraces = { key, traces: cloneCurrentTraces() };
    return { key, traceCount: rememberedTraces.traces.length };
  },
  compareRememberedTraceObservations: compareCurrentTraces,
  clearRememberedTraceObservations() {
    rememberedTraces = null;
  },
  getWebGlInfo,
};

window.field4dPhase2Benchmark = {
  cases: CASES,
  prepare,
  run,
  snapshot,
  comparePreparedDataset,
  runEdgeCaseEquivalence,
  getWebGlInfo,
};

root.render(
  <main className="benchmark-page">
    <header className="benchmark-header">
      <h1>Field4D Phase 1 renderer benchmark ready</h1>
    </header>
  </main>
);

declare global {
  interface Window {
    field4dPhase1Benchmark: {
      cases: typeof CASES;
      prepare: typeof prepare;
      run: typeof run;
      snapshot: typeof snapshot;
      rememberTraceObservations: (key: string) => { key: string; traceCount: number };
      compareRememberedTraceObservations: typeof compareCurrentTraces;
      clearRememberedTraceObservations: () => void;
      getWebGlInfo: typeof getWebGlInfo;
    };
    field4dPhase2Benchmark: {
      cases: typeof CASES;
      prepare: typeof prepare;
      run: typeof run;
      snapshot: typeof snapshot;
      comparePreparedDataset: typeof comparePreparedDataset;
      runEdgeCaseEquivalence: typeof runEdgeCaseEquivalence;
      getWebGlInfo: typeof getWebGlInfo;
    };
  }
}
