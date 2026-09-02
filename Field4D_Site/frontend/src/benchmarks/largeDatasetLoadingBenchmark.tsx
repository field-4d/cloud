import React from 'react';
import ReactDOM from 'react-dom/client';
import type { Range } from 'react-date-range';
import DataSelector from '../components/DataSelector';
import '../index.css';

const query = new URLSearchParams(window.location.search);
const sensorCount = Number(query.get('sensors') ?? 20);
const parameterCount = Number(query.get('parameters') ?? 1);
const dayCount = Number(query.get('days') ?? 1);
const benchmarkMaxMergedRows = Number(query.get('maxRows') ?? 0);
const benchmarkUsePagedFetch = query.get('transport') === 'paged'
  ? true
  : query.get('transport') === 'legacy'
    ? false
    : undefined;
const benchmarkPageConcurrency = Number(query.get('concurrency') ?? 1);
const benchmarkPageSize = Number(query.get('pageSize') ?? 0);

if (![sensorCount, parameterCount, dayCount].every(Number.isInteger)) {
  throw new Error('Phase 4 benchmark dimensions must be integers.');
}

const benchmarkParameters = [
  'ztp_315_object_temperature',
  'ztp_315_ambient_temperature',
  'package_number',
  'opt_3001_u5_light_intensity',
  'opt_3001_u4_light_intensity',
];
const parameters = benchmarkParameters.slice(0, parameterCount);
if (parameters.length !== parameterCount) {
  throw new Error(`Only ${benchmarkParameters.length} benchmark parameters are available.`);
}

const sensors = Array.from(
  { length: sensorCount },
  (_, index) => `sensor-${String(index + 1).padStart(3, '0')}`
);
const startDate = new Date(2026, 5, 1);
const endDate = new Date(2026, 5, dayCount);
const dateState: Range[] = [
  {
    startDate,
    endDate,
    key: 'selection',
  },
];

const experimentSummaries = [
  {
    experimentName: 'Phase 4 deterministic fixture',
    experimentId: 4,
    firstTimestamp: startDate.toISOString(),
    lastTimestamp: endDate.toISOString(),
    sensors,
    parameters,
    labelOptions: [],
    sensorLabelMap: {},
    sensorLocationMap: {},
  },
];

const phase4Window = window as typeof window & {
  __phase4FetchEvents?: unknown[];
  __phase4CompletedRows?: unknown[];
  __phase4ScatterResults?: unknown[];
};
phase4Window.__phase4FetchEvents = [];
phase4Window.__phase4CompletedRows = [];
phase4Window.__phase4ScatterResults = [];

const onFetchBenchmarkEvent = (event: { type: string; data?: unknown[] }) => {
  phase4Window.__phase4FetchEvents?.push({ ...event, data: undefined });
  if (event.type === 'complete' && event.data) {
    phase4Window.__phase4CompletedRows = event.data;
  }
};

const onScatterBenchmarkResult = (result: unknown) => {
  phase4Window.__phase4ScatterResults?.push(result);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <div className="mx-auto max-w-[1500px] p-4">
    <DataSelector
      experimentSummaries={experimentSummaries}
      selectedExperimentId={4}
      selectedExperimentName="Phase 4 deterministic fixture"
      owner="phase4-local-owner"
      mac_address="phase4-local-device"
      dateRange={[startDate, endDate]}
      dateState={dateState}
      minDate={startDate}
      maxDate={endDate}
      benchmarkMaxMergedRows={benchmarkMaxMergedRows || undefined}
      benchmarkUsePagedFetch={benchmarkUsePagedFetch}
      benchmarkPageConcurrency={
        benchmarkPageConcurrency === 1 || benchmarkPageConcurrency === 2
          ? benchmarkPageConcurrency
          : undefined
      }
      benchmarkPageSize={benchmarkPageSize || undefined}
      onFetchBenchmarkEvent={onFetchBenchmarkEvent}
      onScatterBenchmarkResult={onScatterBenchmarkResult}
    />
  </div>
);
