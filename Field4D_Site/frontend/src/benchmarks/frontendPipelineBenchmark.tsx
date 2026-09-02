import React from 'react';
import { createRoot } from 'react-dom/client';
import ScatterPlot, {
  type ScatterPlotBenchmarkResult,
} from '../components/graph-components/ScatterPlot';
import { applyOutlierFiltering, type OutlierConfig } from '../utils/outlierFiltering';
import {
  analyzeDefaultIqrOutliers,
  filterRowsBySelectedDates,
  filterRowsByUtcHourRange,
} from '../utils/frontendDataProcessing';
import { prepareSensorTracesIndexed } from '../components/graph-components/sensorTracePreparation';
import '../index.css';
import './scatterRendererBenchmark.css';

type BenchmarkCaseId = 'A' | 'B' | 'C' | 'D';
type ScenarioId = 'E' | 'F' | 'G' | 'H' | 'I';
type PipelineMode = 'baseline' | 'optimized';

interface BenchmarkRow {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number;
  [key: string]: unknown;
}

interface CaseDefinition {
  id: BenchmarkCaseId;
  name: string;
  sensors: number;
  parameters: number;
  days: number;
}

interface ScenarioState {
  id: ScenarioId;
  allDatesSelected: boolean;
  selectedDates: string[];
  artifactFiltering: boolean;
  hourRange: [number, number] | null;
  outlierConfig: OutlierConfig;
}

interface PreparedDataset {
  definition: CaseDefinition;
  rows: BenchmarkRow[];
  selectedSensors: string[];
  selectedParameters: string[];
  rawObservationHash: string;
  scenario: ScenarioState;
}

interface StageTiming {
  durationMs: number;
  inputRows: number;
  outputRows: number;
  newArray: boolean;
  rowObjectCopies: number;
  temporaryRowReferenceEntries: number;
  executed: boolean;
}

interface PipelineResult {
  data: BenchmarkRow[];
  stages: Record<string, StageTiming>;
  pipelineMs: number;
  finalRowHash: string;
  sourceHashAfter: string;
  outlierHint: {
    hasDefaultRuleOutliers: boolean;
    dataFingerprint: string;
  };
}

const CASES: Record<BenchmarkCaseId, CaseDefinition> = {
  A: { id: 'A', name: 'small baseline', sensors: 5, parameters: 1, days: 1 },
  B: { id: 'B', name: 'medium', sensors: 20, parameters: 2, days: 7 },
  C: { id: 'C', name: 'high rows, few traces', sensors: 5, parameters: 4, days: 30 },
  D: { id: 'D', name: 'many traces', sensors: 40, parameters: 1, days: 14 },
};

const PARAMETER_NAMES = ['hdc_temp', 'hdc_humidity', 'bmp_press', 'light'];
const PARAMETER_BASELINES = [24, 62, 1008, 450];
const ARTIFACT_THRESHOLDS: Record<string, number> = { temperature: -40, humidity: -999 };
const POINTS_PER_DAY = 480;
const THREE_MINUTES_MS = 3 * 60 * 1000;
const START_TIME_MS = Date.UTC(2026, 5, 1, 0, 0, 0, 0);

let currentDataset: PreparedDataset | null = null;
let runId = 0;
let memoPreparationEvents: Array<Record<string, unknown>> = [];
let memoController: {
  unrelated: () => void;
  sensor: () => void;
  parameter: () => void;
  date: () => void;
  filter: () => void;
  source: () => void;
} | null = null;

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Phase 3 benchmark root was not found.');
const root = createRoot(rootElement);

function updateHash(hash: number, value: unknown): number {
  const text = `${String(value)}\u001f`;
  let next = hash >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 16777619) >>> 0;
  }
  return next;
}

function hashRows(rows: BenchmarkRow[]): string {
  let hash = 2166136261;
  for (const row of rows) {
    hash = updateHash(hash, row.timestamp);
    hash = updateHash(hash, row.sensor);
    hash = updateHash(hash, row.parameter);
    hash = updateHash(hash, row.value);
  }
  return hash.toString(16).padStart(8, '0');
}

function uniqueDates(rows: BenchmarkRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.timestamp.split('T')[0])));
}

function buildDataset(caseId: BenchmarkCaseId, scenarioId: ScenarioId): PreparedDataset {
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
        rows[rowIndex] = {
          timestamp,
          sensor: selectedSensors[sensorIndex],
          parameter: selectedParameters[parameterIndex],
          value: Number((
            PARAMETER_BASELINES[parameterIndex]
            + sensorIndex * 0.125
            + dayIndex * 0.02
            + dailySignal
            + secondarySignal
          ).toFixed(6)),
        };
        rowIndex += 1;
      }
    }
  }

  if (scenarioId === 'G') {
    for (const row of rows) {
      if (row.parameter === selectedParameters[0]) row.parameter = 'temperature';
      if (row.parameter === selectedParameters[1]) row.parameter = 'humidity';
    }
    selectedParameters.splice(0, selectedParameters.length, 'temperature', ...(definition.parameters > 1 ? ['humidity'] : []));
    for (let index = 0; index < rows.length; index += Math.max(1, Math.floor(rows.length / 64))) {
      rows[index].value = rows[index].parameter === 'humidity' ? -999 : -40;
    }
  }

  if ((scenarioId === 'H' || scenarioId === 'I') && rows.length > 10) {
    rows[Math.floor(rows.length / 2)].value = 1_000_000;
  }

  const dates = uniqueDates(rows);
  const scenario: ScenarioState = {
    id: scenarioId,
    allDatesSelected: scenarioId !== 'F',
    selectedDates: scenarioId === 'F' ? dates.filter((_, index) => index % 2 === 0) : dates,
    artifactFiltering: scenarioId === 'G',
    hourRange: scenarioId === 'F' ? [6, 18] : null,
    outlierConfig: { enabled: scenarioId === 'I', method: 'IQR', threshold: 1.5 },
  };

  return {
    definition,
    rows,
    selectedSensors,
    selectedParameters,
    rawObservationHash: hashRows(rows),
    scenario,
  };
}

function measureStage<T extends BenchmarkRow[]>(
  stages: Record<string, StageTiming>,
  name: string,
  input: BenchmarkRow[],
  operation: () => T,
  details: Pick<StageTiming, 'rowObjectCopies' | 'temporaryRowReferenceEntries' | 'executed'>
): T {
  const startedAt = performance.now();
  const output = operation();
  stages[name] = {
    durationMs: performance.now() - startedAt,
    inputRows: input.length,
    outputRows: output.length,
    newArray: output !== input,
    ...details,
  };
  return output;
}

function filterArtifacts(rows: BenchmarkRow[]): BenchmarkRow[] {
  return rows.map((row) => {
    const threshold = ARTIFACT_THRESHOLDS[String(row.parameter).toLowerCase()];
    if (threshold !== undefined && row.value === threshold) return { ...row, value: Number.NaN };
    return row;
  });
}

function filterHours(rows: BenchmarkRow[], range: [number, number]): BenchmarkRow[] {
  return rows.filter((row) => {
    const hour = new Date(row.timestamp).getUTCHours();
    return range[0] <= range[1]
      ? hour >= range[0] && hour <= range[1]
      : hour >= range[0] || hour <= range[1];
  });
}

function runOutlierHint(rows: BenchmarkRow[]): BenchmarkRow[] {
  const prepared = rows.map((row) => ({
    ...row,
    value: Number.isFinite(row.value) ? row.value : Number.NaN,
    __rawNumericValue: Number.isFinite(row.value) ? row.value : null,
  }));
  return applyOutlierFiltering(prepared, { enabled: true, method: 'IQR', threshold: 2.5 });
}

function buildDataFingerprint(rows: BenchmarkRow[]): string {
  let finiteCount = 0;
  let finiteSum = 0;
  let finiteMin = Number.POSITIVE_INFINITY;
  let finiteMax = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    finiteCount += 1;
    finiteSum += row.value;
    if (row.value < finiteMin) finiteMin = row.value;
    if (row.value > finiteMax) finiteMax = row.value;
  }
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  return [
    rows.length,
    finiteCount,
    finiteSum.toFixed(6),
    Number.isFinite(finiteMin) ? finiteMin.toFixed(6) : 'na',
    Number.isFinite(finiteMax) ? finiteMax.toFixed(6) : 'na',
    String(firstRow?.timestamp ?? ''),
    String(lastRow?.timestamp ?? ''),
    String(firstRow?.parameter ?? ''),
    String(lastRow?.parameter ?? ''),
  ].join('|');
}

function runCorrelation(rows: BenchmarkRow[], parameters: string[]): number[][] {
  const valuesByParameter: Record<string, number[]> = {};
  for (const parameter of parameters) {
    valuesByParameter[parameter] = rows
      .filter((row) => row.parameter === parameter)
      .map((row) => Number(row.value))
      .filter((value) => !Number.isNaN(value));
  }
  return parameters.map((left) => parameters.map((right) => {
    const x = valuesByParameter[left];
    const y = valuesByParameter[right];
    if (x.length !== y.length || x.length === 0) return 0;
    const n = x.length;
    const sumX = x.reduce((sum, value) => sum + value, 0);
    const sumY = y.reduce((sum, value) => sum + value, 0);
    const sumXY = x.reduce((sum, value, index) => sum + value * y[index], 0);
    const sumX2 = x.reduce((sum, value) => sum + value * value, 0);
    const sumY2 = y.reduce((sum, value) => sum + value * value, 0);
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );
    return denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  }));
}

function runPipeline(dataset: PreparedDataset, mode: PipelineMode): PipelineResult {
  const stages: Record<string, StageTiming> = {};
  const startedAt = performance.now();
  const { rows, scenario } = dataset;

  measureStage(
    stages,
    'processedSensorData',
    rows,
    () => {
      if (mode === 'optimized' && !scenario.artifactFiltering && !scenario.outlierConfig.enabled) {
        return rows;
      }
      let exportRows = mode === 'baseline' || scenario.outlierConfig.enabled
        ? rows.map((row) => ({ ...row }))
        : rows;
      if (scenario.artifactFiltering) exportRows = filterArtifacts(exportRows);
      if (scenario.outlierConfig.enabled) {
        exportRows = applyOutlierFiltering(exportRows, scenario.outlierConfig);
      }
      return exportRows;
    },
    {
      rowObjectCopies: mode === 'baseline'
        ? rows.length
        : scenario.outlierConfig.enabled
        ? rows.length
        : 0,
      temporaryRowReferenceEntries:
        mode === 'baseline' || scenario.artifactFiltering || scenario.outlierConfig.enabled
          ? rows.length
          : 0,
      executed: mode === 'baseline' || scenario.artifactFiltering || scenario.outlierConfig.enabled,
    }
  );

  let processed = measureStage(
    stages,
    'dateFilter',
    rows,
    () => {
      if (scenario.allDatesSelected) return rows;
      if (mode === 'baseline') {
        return rows.filter((row) => scenario.selectedDates.includes(row.timestamp.split('T')[0]));
      }
      return filterRowsBySelectedDates(rows, false, scenario.selectedDates);
    },
    {
      rowObjectCopies: 0,
      temporaryRowReferenceEntries: scenario.allDatesSelected ? 0 : rows.length,
      executed: !scenario.allDatesSelected,
    }
  );

  const baseProcessed = processed;
  processed = measureStage(
    stages,
    'artifactFilter',
    processed,
    () => {
      if (!scenario.artifactFiltering) return processed;
      return mode === 'baseline' ? filterArtifacts([...processed]) : filterArtifacts(processed);
    },
    {
      rowObjectCopies: scenario.artifactFiltering
        ? processed.filter((row) => ARTIFACT_THRESHOLDS[row.parameter.toLowerCase()] === row.value).length
        : 0,
      temporaryRowReferenceEntries: scenario.artifactFiltering
        ? processed.length * (mode === 'baseline' ? 2 : 1)
        : 0,
      executed: scenario.artifactFiltering,
    }
  );

  processed = measureStage(
    stages,
    'hourFilter',
    processed,
    () => scenario.hourRange
      ? mode === 'baseline'
        ? filterHours(processed, scenario.hourRange)
        : filterRowsByUtcHourRange(processed, scenario.hourRange)
      : processed,
    {
      rowObjectCopies: 0,
      temporaryRowReferenceEntries: scenario.hourRange ? processed.length : 0,
      executed: scenario.hourRange !== null,
    }
  );

  processed = measureStage(
    stages,
    'outlierFilter',
    processed,
    () => {
      if (!scenario.outlierConfig.enabled) return processed;
      const copy = processed.map((row) => ({ ...row }));
      return applyOutlierFiltering(copy, scenario.outlierConfig);
    },
    {
      rowObjectCopies: scenario.outlierConfig.enabled ? processed.length : 0,
      temporaryRowReferenceEntries: scenario.outlierConfig.enabled ? processed.length : 0,
      executed: scenario.outlierConfig.enabled,
    }
  );

  let outlierHint: PipelineResult['outlierHint'];
  if (mode === 'baseline') {
    const hintedRows = measureStage(
      stages,
      'outlierHint',
      baseProcessed,
      () => runOutlierHint(baseProcessed),
      {
        rowObjectCopies: baseProcessed.length,
        temporaryRowReferenceEntries: baseProcessed.length,
        executed: true,
      }
    );
    const legacyHasOutliers = hintedRows.some((row) =>
      typeof row.__rawNumericValue === 'number'
      && Number.isFinite(row.__rawNumericValue)
      && Number.isNaN(row.value)
    );
    outlierHint = {
      hasDefaultRuleOutliers: legacyHasOutliers,
      dataFingerprint: buildDataFingerprint(baseProcessed),
    };
  } else {
    const hintStartedAt = performance.now();
    const hintAnalysis = analyzeDefaultIqrOutliers(baseProcessed, 2.5);
    stages.outlierHint = {
      durationMs: performance.now() - hintStartedAt,
      inputRows: baseProcessed.length,
      outputRows: baseProcessed.length,
      newArray: false,
      rowObjectCopies: 0,
      temporaryRowReferenceEntries: hintAnalysis.groupedValueEntries,
      executed: true,
    };
    outlierHint = {
      hasDefaultRuleOutliers: hintAnalysis.hasDefaultRuleOutliers,
      dataFingerprint: hintAnalysis.dataFingerprint,
    };
  }

  const allParameters = Array.from(new Set(rows.map((row) => row.parameter)));
  const correlationStartedAt = performance.now();
  const correlationExecuted = mode === 'baseline' && allParameters.length >= 2;
  if (correlationExecuted) runCorrelation(processed, allParameters);
  stages.correlation = {
    durationMs: performance.now() - correlationStartedAt,
    inputRows: processed.length,
    outputRows: 0,
    newArray: correlationExecuted,
    rowObjectCopies: 0,
    temporaryRowReferenceEntries: correlationExecuted ? processed.length : 0,
    executed: correlationExecuted,
  };

  return {
    data: processed,
    stages,
    pipelineMs: performance.now() - startedAt,
    finalRowHash: hashRows(processed),
    sourceHashAfter: hashRows(rows),
    outlierHint,
  };
}

function BenchmarkView({
  dataset,
  mode,
  complete,
}: {
  dataset: PreparedDataset;
  mode: PipelineMode;
  complete: (result: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const pipeline = runPipeline(dataset, mode);
  const plot = (
    <ScatterPlot
        data={pipeline.data}
        selectedParameters={dataset.selectedParameters}
        selectedSensors={dataset.selectedSensors}
        rendererMode="svg"
        tracePreparationMode="indexed"
        onBenchmarkResult={(scatter: ScatterPlotBenchmarkResult) => complete({
          caseId: dataset.definition.id,
          scenarioId: dataset.scenario.id,
          mode,
          sourceRowCount: dataset.rows.length,
          finalRowCount: pipeline.data.length,
          rawObservationHash: dataset.rawObservationHash,
          sourceHashAfter: pipeline.sourceHashAfter,
          finalRowHash: pipeline.finalRowHash,
          outlierHint: pipeline.outlierHint,
          stages: pipeline.stages,
          pipelineMs: pipeline.pipelineMs,
          tracePreparationMs: scatter.tracePreparationMs,
          preRenderMs: pipeline.pipelineMs + scatter.tracePreparationMs,
          plotlyRenderMs: scatter.plotlyRenderMs,
          totalMs: pipeline.pipelineMs + scatter.totalMs,
          traceCount: scatter.traceCount,
          renderedPointCount: scatter.renderedPointCount,
          preparationStats: scatter.preparationStats,
        })}
        containerClassName={expanded ? 'benchmark-expanded-plot' : 'benchmark-plot'}
      />
  );
  return (
    <main className="benchmark-page" data-case-id={dataset.definition.id} data-scenario-id={dataset.scenario.id}>
      <header className="benchmark-header">
        <h1>Case {dataset.definition.id} / Scenario {dataset.scenario.id} / {mode}</h1>
        <button type="button" data-testid="expand-plot" onClick={() => setExpanded(true)}>Expand Plot</button>
      </header>
      {expanded ? (
        <section className="benchmark-expanded-shell" data-testid="expanded-plot-shell">
          <button type="button" className="benchmark-expanded-close" data-testid="close-expanded-plot" onClick={() => setExpanded(false)}>Close</button>
          {plot}
        </section>
      ) : (
        <section className="benchmark-plot-shell" data-testid="plot-shell">{plot}</section>
      )}
    </main>
  );
}

function prepare(caseId: BenchmarkCaseId, scenarioId: ScenarioId = 'E') {
  currentDataset = buildDataset(caseId, scenarioId);
  return {
    caseId,
    scenarioId,
    rawRowCount: currentDataset.rows.length,
    rawObservationHash: currentDataset.rawObservationHash,
    selectedSensors: currentDataset.selectedSensors.length,
    selectedParameters: currentDataset.selectedParameters,
    selectedDates: currentDataset.scenario.selectedDates,
  };
}

function run(mode: PipelineMode = 'baseline'): Promise<Record<string, unknown>> {
  if (!currentDataset) throw new Error('Prepare a Phase 3 dataset before running it.');
  runId += 1;
  const currentRun = runId;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error(`Phase 3 benchmark run ${currentRun} timed out.`)),
      2 * 60 * 1000
    );
    root.render(
      <BenchmarkView
        key={currentRun}
        dataset={currentDataset as PreparedDataset}
        mode={mode}
        complete={(result) => {
          window.clearTimeout(timeout);
          resolve({ runId: currentRun, ...result });
        }}
      />
    );
  });
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return Object.is(left, right)
    || (typeof left === 'number' && typeof right === 'number' && Number.isNaN(left) && Number.isNaN(right));
}

function compareModes(caseId: BenchmarkCaseId, scenarioId: ScenarioId = 'E') {
  const dataset = buildDataset(caseId, scenarioId);
  const baseline = runPipeline(dataset, 'baseline');
  const optimized = runPipeline(dataset, 'optimized');
  let rowDifference: string | null = null;
  if (baseline.data.length !== optimized.data.length) {
    rowDifference = `row count ${baseline.data.length} !== ${optimized.data.length}`;
  } else {
    for (let index = 0; index < baseline.data.length; index += 1) {
      const left = baseline.data[index];
      const right = optimized.data[index];
      if (
        left.timestamp !== right.timestamp
        || left.sensor !== right.sensor
        || left.parameter !== right.parameter
        || !valuesEqual(left.value, right.value)
      ) {
        rowDifference = `row ${index}`;
        break;
      }
    }
  }

  const prepare = (rows: BenchmarkRow[]) => prepareSensorTracesIndexed({
    data: rows,
    limitedParameters: dataset.selectedParameters.slice(0, 2),
    selectedParameterCount: dataset.selectedParameters.length,
    selectedSensors: dataset.selectedSensors,
    traceType: 'scatter',
    getSensorDisplayName: (sensor) => sensor,
    getSensorColor: () => '#123456',
  }).preparedTraces;
  const baselineTraces = prepare(baseline.data);
  const optimizedTraces = prepare(optimized.data);
  let traceDifference: string | null = null;
  if (baselineTraces.length !== optimizedTraces.length) {
    traceDifference = `trace count ${baselineTraces.length} !== ${optimizedTraces.length}`;
  } else {
    for (let traceIndex = 0; traceIndex < baselineTraces.length && !traceDifference; traceIndex += 1) {
      const left = baselineTraces[traceIndex].trace;
      const right = optimizedTraces[traceIndex].trace;
      const leftX = left.x as unknown[];
      const rightX = right.x as unknown[];
      const leftY = left.y as unknown[];
      const rightY = right.y as unknown[];
      if (
        left.name !== right.name
        || left.type !== right.type
        || left.mode !== right.mode
        || left.yaxis !== right.yaxis
        || leftX.length !== rightX.length
        || leftY.length !== rightY.length
      ) {
        traceDifference = `trace metadata ${traceIndex}`;
        break;
      }
      for (let pointIndex = 0; pointIndex < leftX.length; pointIndex += 1) {
        if (!valuesEqual(leftX[pointIndex], rightX[pointIndex]) || !valuesEqual(leftY[pointIndex], rightY[pointIndex])) {
          traceDifference = `trace ${traceIndex} point ${pointIndex}`;
          break;
        }
      }
    }
  }

  return {
    caseId,
    scenarioId,
    equal: rowDifference === null
      && traceDifference === null
      && baseline.outlierHint.hasDefaultRuleOutliers === optimized.outlierHint.hasDefaultRuleOutliers
      && baseline.outlierHint.dataFingerprint === optimized.outlierHint.dataFingerprint,
    rowDifference,
    traceDifference,
    outlierHintEqual:
      baseline.outlierHint.hasDefaultRuleOutliers === optimized.outlierHint.hasDefaultRuleOutliers
      && baseline.outlierHint.dataFingerprint === optimized.outlierHint.dataFingerprint,
    baselineOutlierHint: baseline.outlierHint,
    optimizedOutlierHint: optimized.outlierHint,
    rawObservationHash: dataset.rawObservationHash,
    sourceHashAfter: hashRows(dataset.rows),
    finalRowCount: baseline.data.length,
    finalRowHash: baseline.finalRowHash,
    traceCount: baselineTraces.length,
    renderedPointCount: baselineTraces.reduce((total, item) => total + item.trace.x.length, 0),
    traceHashes: baselineTraces.map(({ trace }) => ({
      name: trace.name,
      yaxis: trace.yaxis,
      xHash: hashRows((trace.x as unknown[]).map((value, index) => ({
        timestamp: String(value),
        sensor: String(trace.name),
        parameter: String(trace.yaxis),
        value: Number((trace.y as unknown[])[index]),
      }))),
    })),
  };
}

const stableSensorDisplayName = (sensor: string) => sensor;
const stableSensorColor = () => '#123456';

function MemoInvalidationHarness({
  dataset,
  mode,
}: {
  dataset: PreparedDataset;
  mode: PipelineMode;
}) {
  const availableDates = React.useMemo(() => uniqueDates(dataset.rows), [dataset.rows]);
  const [sourceRows, setSourceRows] = React.useState(dataset.rows);
  const [selectedSensors, setSelectedSensors] = React.useState(dataset.selectedSensors.slice(0, 5));
  const [selectedParameters, setSelectedParameters] = React.useState(dataset.selectedParameters.slice(0, 2));
  const [selectedDates, setSelectedDates] = React.useState(availableDates);
  const [outlierEnabled, setOutlierEnabled] = React.useState(false);
  const [, setUnrelated] = React.useState(0);
  const dateFiltered = React.useMemo(
    () => filterRowsBySelectedDates(sourceRows, selectedDates.length === availableDates.length, selectedDates),
    [availableDates.length, selectedDates, sourceRows]
  );
  const processed = React.useMemo(() => {
    if (!outlierEnabled) return dateFiltered;
    return applyOutlierFiltering(
      dateFiltered.map((row) => ({ ...row })),
      { enabled: true, method: 'IQR', threshold: 1.5 }
    );
  }, [dateFiltered, outlierEnabled]);
  const scatterData = mode === 'baseline' ? [...processed] : processed;
  const recordPreparation = React.useCallback((event: Record<string, unknown>) => {
    memoPreparationEvents.push({ sequence: memoPreparationEvents.length + 1, ...event });
  }, []);

  React.useEffect(() => {
    memoController = {
      unrelated: () => setUnrelated((value) => value + 1),
      sensor: () => setSelectedSensors((sensors) => sensors.slice(0, Math.max(1, sensors.length - 1))),
      parameter: () => setSelectedParameters((parameters) => parameters.length > 1 ? [parameters[1]] : [dataset.selectedParameters[0]]),
      date: () => setSelectedDates((dates) => dates.length > 1 ? [dates[0]] : availableDates),
      filter: () => setOutlierEnabled((enabled) => !enabled),
      source: () => setSourceRows((rows) => rows.map((row, index) => index < 2 ? { ...row, value: row.value + 0.125 } : row)),
    };
    return () => { memoController = null; };
  }, [availableDates, dataset.selectedParameters]);

  return (
    <main className="benchmark-page" data-memo-harness="true">
      <ScatterPlot
        data={scatterData}
        selectedParameters={selectedParameters}
        selectedSensors={selectedSensors}
        getSensorColor={stableSensorColor}
        getSensorDisplayName={stableSensorDisplayName}
        rendererMode="svg"
        tracePreparationMode="indexed"
        onTracePreparation={recordPreparation}
      />
    </main>
  );
}

function graphSnapshot() {
  const graph = document.querySelector('.js-plotly-plot') as any;
  const traces = (graph?.data ?? []).map((trace: any) => ({
    name: String(trace.name ?? ''),
    yaxis: String(trace.yaxis ?? 'y'),
    pointCount: Array.isArray(trace.x) ? trace.x.length : 0,
    xHash: (trace.x ?? []).reduce((hash: number, value: unknown) => updateHash(hash, value), 2166136261).toString(16),
    yHash: (trace.y ?? []).reduce((hash: number, value: unknown) => updateHash(hash, value), 2166136261).toString(16),
  }));
  return {
    preparationCount: memoPreparationEvents.length,
    preparationEvents: memoPreparationEvents,
    traceCount: traces.length,
    renderedPointCount: traces.reduce((total: number, trace: any) => total + trace.pointCount, 0),
    traces,
  };
}

function plotSnapshot() {
  const graph = document.querySelector('.js-plotly-plot') as any;
  if (!graph) throw new Error('Plotly graph was not found.');
  const rect = graph.getBoundingClientRect();
  return {
    traceTypes: Array.from(new Set((graph.data ?? []).map((trace: any) => String(trace.type ?? '')))),
    traceCount: (graph.data ?? []).length,
    renderedPointCount: (graph.data ?? []).reduce(
      (total: number, trace: any) => total + (Array.isArray(trace.x) ? trace.x.length : 0),
      0
    ),
    yaxes: Array.from(new Set((graph.data ?? []).map((trace: any) => String(trace.yaxis ?? 'y')))),
    xRange: graph.layout?.xaxis?.range ?? null,
    graphRect: { width: rect.width, height: rect.height },
    modebarButtons: Array.from(document.querySelectorAll('.modebar-btn')).map(
      (button) => button.getAttribute('data-title') ?? ''
    ),
  };
}

async function settleMemoHarness() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await new Promise((resolve) => window.setTimeout(resolve, 250));
}

async function mountMemoHarness(mode: PipelineMode = 'optimized') {
  const source = buildDataset('B', 'E');
  const dates = uniqueDates(source.rows).slice(0, 2);
  const sensorSet = new Set(source.selectedSensors.slice(0, 5));
  source.rows = source.rows.filter((row) => dates.includes(row.timestamp.split('T')[0]) && sensorSet.has(row.sensor));
  source.selectedSensors = source.selectedSensors.slice(0, 5);
  source.rawObservationHash = hashRows(source.rows);
  memoPreparationEvents = [];
  runId += 1;
  root.render(<MemoInvalidationHarness key={`memo-${runId}`} dataset={source} mode={mode} />);
  await settleMemoHarness();
  return graphSnapshot();
}

async function updateMemoHarness(action: keyof NonNullable<typeof memoController>) {
  if (!memoController) throw new Error('Memo invalidation harness is not mounted.');
  memoController[action]();
  await settleMemoHarness();
  return graphSnapshot();
}

window.field4dPhase3Benchmark = {
  cases: CASES,
  prepare,
  run,
  compareModes,
  snapshot: plotSnapshot,
  mountMemoHarness,
  updateMemoHarness,
  memoSnapshot: graphSnapshot,
};

root.render(
  <main className="benchmark-page">
    <header className="benchmark-header"><h1>Field4D Phase 3 benchmark ready</h1></header>
  </main>
);

declare global {
  interface Window {
    field4dPhase3Benchmark: {
      cases: typeof CASES;
      prepare: typeof prepare;
      run: typeof run;
      compareModes: typeof compareModes;
      snapshot: typeof plotSnapshot;
      mountMemoHarness: typeof mountMemoHarness;
      updateMemoHarness: typeof updateMemoHarness;
      memoSnapshot: typeof graphSnapshot;
    };
  }
}
