import { getParameterDisplayLabel, getParameterUnit } from '../../constants/parameterMetadata';
import { rowMatchesParameter, type RowWithSensorLabel } from '../../utils/labelGrouping';

export interface ScatterSensorRow {
  timestamp?: string | null;
  sensor?: string | number | null;
  parameter?: string;
  value?: string | number | null;
  [key: string]: unknown;
}

export interface SensorTrace {
  x: string[];
  y: Array<number | null>;
  type: string;
  mode: 'lines';
  name: string;
  yaxis: 'y' | 'y2';
  line: {
    color: string;
    width: number;
  };
  hovertemplate: string;
}

export interface PreparedSensorTrace {
  sensor: string;
  parameter: string;
  trace: SensorTrace;
}

export interface SensorTracePreparationStats {
  sourceRowCount: number;
  sourceRowsVisited: number;
  bucketCount: number;
  xEntryCount: number;
  yEntryCount: number;
  temporaryRowReferenceEntries: number;
  rowObjectCopies: number;
}

export interface SensorTracePreparationResult {
  preparedTraces: PreparedSensorTrace[];
  stats: SensorTracePreparationStats;
}

export interface SensorTracePreparationOptions {
  data: ScatterSensorRow[];
  limitedParameters: string[];
  selectedParameterCount: number;
  selectedSensors: string[];
  traceType: string;
  getSensorDisplayName: (sensor: string) => string;
  getSensorColor: (sensor: string) => string;
}

interface SensorRange {
  latest: number;
  earliest: number;
}

interface IndexedSeries {
  x: string[];
  y: Array<number | null>;
}

interface ParameterIndex {
  presentSensors: string[];
  presentSensorSet: Set<string>;
  rangesBySensor: Map<string, SensorRange>;
  seriesBySensor: Map<string, IndexedSeries>;
}

function createRange(): SensorRange {
  return {
    latest: Number.NEGATIVE_INFINITY,
    earliest: Number.POSITIVE_INFINITY,
  };
}

function updateRange(range: SensorRange, timestamp: unknown): void {
  const parsed = Date.parse(String(timestamp ?? ''));
  if (!Number.isFinite(parsed)) return;
  range.latest = Math.max(range.latest, parsed);
  range.earliest = Math.min(range.earliest, parsed);
}

function buildLegendNames(
  presentSensors: string[],
  rangesBySensor: Map<string, SensorRange>,
  getSensorDisplayName: (sensor: string) => string
): Record<string, string> {
  const groupedByLocation = new Map<string, string[]>();
  for (const sensor of presentSensors) {
    const displayName = getSensorDisplayName(sensor);
    const group = groupedByLocation.get(displayName);
    if (group) {
      group.push(sensor);
    } else {
      groupedByLocation.set(displayName, [sensor]);
    }
  }

  const legendNames: Record<string, string> = {};
  for (const [displayName, sensorsInLocation] of groupedByLocation.entries()) {
    if (sensorsInLocation.length <= 1) {
      legendNames[sensorsInLocation[0]] = displayName;
      continue;
    }

    const ranked = sensorsInLocation
      .slice()
      .sort((left, right) => {
        const leftRange = rangesBySensor.get(left);
        const rightRange = rangesBySensor.get(right);
        const leftLatest = leftRange?.latest ?? Number.NEGATIVE_INFINITY;
        const rightLatest = rightRange?.latest ?? Number.NEGATIVE_INFINITY;
        if (leftLatest !== rightLatest) return rightLatest - leftLatest;
        const leftEarliest = leftRange?.earliest ?? Number.POSITIVE_INFINITY;
        const rightEarliest = rightRange?.earliest ?? Number.POSITIVE_INFINITY;
        if (leftEarliest !== rightEarliest) return rightEarliest - leftEarliest;
        return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
      });

    ranked.forEach((sensor, index) => {
      if (index === 0) {
        legendNames[sensor] = displayName;
      } else if (ranked.length === 2) {
        legendNames[sensor] = `${displayName} (replaced)`;
      } else {
        legendNames[sensor] = `${displayName} (replaced ${index})`;
      }
    });
  }

  return legendNames;
}

function buildPreparedTrace(
  parameter: string,
  parameterIndex: number,
  sensor: string,
  series: IndexedSeries,
  legendName: string,
  options: SensorTracePreparationOptions
): PreparedSensorTrace {
  return {
    sensor,
    parameter,
    trace: {
      x: series.x,
      y: series.y,
      type: options.traceType,
      mode: 'lines',
      name: options.selectedParameterCount > 1
        ? `${legendName} - ${getParameterDisplayLabel(parameter)}`
        : legendName,
      yaxis: parameterIndex === 0 ? 'y' : 'y2',
      line: {
        color: options.getSensorColor(sensor),
        width: 2,
      },
      hovertemplate: `%{x}<br>${getParameterDisplayLabel(parameter)}: %{y}${getParameterUnit(parameter) ? ` ${getParameterUnit(parameter)}` : ''}<extra>${legendName}</extra>`,
    },
  };
}

function sortPreparedTraces(traces: PreparedSensorTrace[]): PreparedSensorTrace[] {
  return traces.sort((left, right) =>
    left.trace.name.localeCompare(right.trace.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

/** Exact extraction of the pre-Phase-2 sensor-mode algorithm for benchmark use. */
export function prepareSensorTracesLegacy(
  options: SensorTracePreparationOptions
): SensorTracePreparationResult {
  let sourceRowsVisited = 0;
  let temporaryRowReferenceEntries = 0;
  let xEntryCount = 0;
  const preparedTraces = options.limitedParameters.flatMap((parameter, parameterIndex) => {
    const parameterRows = options.data.filter((row) => {
      sourceRowsVisited += 1;
      return rowMatchesParameter(row as RowWithSensorLabel, parameter);
    });
    temporaryRowReferenceEntries += parameterRows.length;

    const presentSensors = Array.from(
      new Set(
        parameterRows
          .map((row) => String(row.sensor ?? ''))
          .filter((sensor) => options.selectedSensors.includes(sensor))
      )
    );

    const rangesBySensor = new Map<string, SensorRange>();
    for (const sensor of presentSensors) rangesBySensor.set(sensor, createRange());
    for (const row of parameterRows) {
      const range = rangesBySensor.get(String(row.sensor ?? ''));
      if (range) updateRange(range, row.timestamp);
    }

    const legendNames = buildLegendNames(
      presentSensors,
      rangesBySensor,
      options.getSensorDisplayName
    );

    return sortPreparedTraces(
      options.selectedSensors
        .filter((sensor) => presentSensors.includes(sensor))
        .map((sensor) => {
          const sensorRows = parameterRows.filter((row) => {
            sourceRowsVisited += 1;
            return String(row.sensor) === sensor;
          });
          temporaryRowReferenceEntries += sensorRows.length;
          const series = {
            x: sensorRows.map((row) => String(row.timestamp)),
            y: sensorRows.map((row) => row.value == null ? null : Number(row.value)),
          };
          xEntryCount += series.x.length;
          return buildPreparedTrace(
            parameter,
            parameterIndex,
            sensor,
            series,
            legendNames[sensor] ?? options.getSensorDisplayName(sensor),
            options
          );
        })
    );
  });

  return {
    preparedTraces,
    stats: {
      sourceRowCount: options.data.length,
      sourceRowsVisited,
      bucketCount: preparedTraces.length,
      xEntryCount,
      yEntryCount: xEntryCount,
      temporaryRowReferenceEntries,
      rowObjectCopies: 0,
    },
  };
}

/** One bounded source pass into parameter/sensor primitive arrays, then trace assembly. */
export function prepareSensorTracesIndexed(
  options: SensorTracePreparationOptions
): SensorTracePreparationResult {
  const selectedSensorSet = new Set(options.selectedSensors);
  const parameterMatches = new Map<string, number[]>();
  const parameterIndexes: ParameterIndex[] = options.limitedParameters.map(() => ({
    presentSensors: [],
    presentSensorSet: new Set<string>(),
    rangesBySensor: new Map<string, SensorRange>(),
    seriesBySensor: new Map<string, IndexedSeries>(),
  }));

  options.limitedParameters.forEach((parameter, parameterIndex) => {
    const aliases = new Set([parameter, parameter.replace('SensorData_', '')]);
    for (const alias of aliases) {
      const matches = parameterMatches.get(alias);
      if (matches) matches.push(parameterIndex);
      else parameterMatches.set(alias, [parameterIndex]);
    }
  });

  let sourceRowsVisited = 0;
  let xEntryCount = 0;
  for (const row of options.data) {
    sourceRowsVisited += 1;
    const matchingParameterIndexes = parameterMatches.get(String(row.parameter));
    if (!matchingParameterIndexes) continue;

    const encounterSensor = String(row.sensor ?? '');
    if (!selectedSensorSet.has(encounterSensor)) continue;

    for (const parameterIndex of matchingParameterIndexes) {
      const index = parameterIndexes[parameterIndex];
      if (!index.presentSensorSet.has(encounterSensor)) {
        index.presentSensorSet.add(encounterSensor);
        index.presentSensors.push(encounterSensor);
        index.rangesBySensor.set(encounterSensor, createRange());
        index.seriesBySensor.set(encounterSensor, { x: [], y: [] });
      }

      updateRange(index.rangesBySensor.get(encounterSensor) as SensorRange, row.timestamp);

      // The legacy presence scan uses `sensor ?? ''`, while its series filter uses
      // String(sensor). Preserve that distinction for null/undefined sensor values.
      if (String(row.sensor) !== encounterSensor) continue;
      const series = index.seriesBySensor.get(encounterSensor) as IndexedSeries;
      series.x.push(String(row.timestamp));
      series.y.push(row.value == null ? null : Number(row.value));
      xEntryCount += 1;
    }
  }

  const preparedTraces = options.limitedParameters.flatMap((parameter, parameterIndex) => {
    const index = parameterIndexes[parameterIndex];
    const legendNames = buildLegendNames(
      index.presentSensors,
      index.rangesBySensor,
      options.getSensorDisplayName
    );
    return sortPreparedTraces(
      options.selectedSensors
        .filter((sensor) => index.presentSensorSet.has(sensor))
        .map((sensor) => buildPreparedTrace(
          parameter,
          parameterIndex,
          sensor,
          index.seriesBySensor.get(sensor) as IndexedSeries,
          legendNames[sensor] ?? options.getSensorDisplayName(sensor),
          options
        ))
    );
  });

  return {
    preparedTraces,
    stats: {
      sourceRowCount: options.data.length,
      sourceRowsVisited,
      bucketCount: parameterIndexes.reduce(
        (total, index) => total + index.seriesBySensor.size,
        0
      ),
      xEntryCount,
      yEntryCount: xEntryCount,
      temporaryRowReferenceEntries: 0,
      rowObjectCopies: 0,
    },
  };
}
