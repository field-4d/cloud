/*
 * DataSelector.tsx
 * Component for selecting experiment, date range, sensors, and parameters.
 * Handles data fetching, mock data generation, and visualization panel.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Range } from 'react-date-range';
import Plot from 'react-plotly.js';
import Select, {
  GroupBase,
  MultiValue,
  components,
  OptionProps,
  GroupHeadingProps,
  FormatOptionLabelMeta,
} from 'react-select';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import VisualizationPanel from './VisualizationPanel';
import type { ScatterPlotBenchmarkResult } from './graph-components/ScatterPlot';
import { API_ENDPOINTS, USE_PAGED_FETCH } from '../config';
import { logger } from '../config/logger';
import LabelFilter from './LabelFilter';
import { applyOutlierFiltering, type OutlierConfig } from '../utils/outlierFiltering';
import {
  LARGE_DATASET_WARNING_ROWS,
  MAX_TESTED_MERGED_ROWS,
  SENSOR_CHUNK_SIZE,
  buildUtcDayWindows,
  computeDaysPerChunk,
  type UtcDateWindow,
} from '../utils/dateChunking';
import {
  getSelectedLabelMemberships,
  normalizeIncludedLabels,
  type RowWithSensorLabel,
} from '../utils/labelGrouping';
import {
  PARAMETER_OPTIONS,
  getParameterDisplayLabel,
  getParameterUnit,
} from '../constants/parameterMetadata';
import { hasMeaningfulLabelOptions } from '../utils/labelAtomOptions';
import { getSensorTypeSubtitle } from '../utils/sensorMetadata';
import {
  MAX_PAGED_MERGED_ROWS,
  fetchDataPageStream,
  type FetchDataPagePayload,
} from '../utils/fetchDataPages';

// Initialize dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set the timezone to Israel
const TIMEZONE = 'Asia/Jerusalem';

const normalizeLocationKey = (value: string): string =>
  String(value).trim().toLocaleLowerCase();

interface ExperimentSummary {
  experimentName: string;
  experimentId?: number | null;
  firstTimestamp?: string | { value: string };
  lastTimestamp?: string | { value: string };
  sensors?: string[];
  parameters?: string[];
  labelOptions?: string[];
  locationOptions?: string[];
  /** LLA -> distinct labels for that sensor (from experiment-summary). */
  sensorLabelMap?: Record<string, string[]>;
  /** Sensors per label (latest label per sensor); same basis as sensorLabelMap. */
  labelCounts?: Record<string, number>;
  /** LLA -> latest Location (from experiment-summary). */
  sensorLocationMap?: Record<string, string>;
}

interface ParameterOption {
  value: string;
  label: string;
  rawLabel: string;
}

interface ParameterGroupOption {
  label: string;
  options: ParameterOption[];
}

interface DataSelectorProps {
  experimentSummaries: ExperimentSummary[];
  selectedExperimentId: number | null;
  selectedExperimentName: string;
  owner: string;
  mac_address: string;
  dateRange: [Date | null, Date | null];
  dateState: Range[];
  minDate: Date | null;
  maxDate: Date | null;
  /** Development benchmark only. Production always uses the adopted safety policy. */
  benchmarkMaxMergedRows?: number;
  /** Development benchmark only. Production uses the configured transport feature flag. */
  benchmarkUsePagedFetch?: boolean;
  /** Development benchmark only. Production paging uses the adopted concurrency-one policy. */
  benchmarkPageConcurrency?: 1 | 2;
  /** Development benchmark only. Backend production defaults remain authoritative. */
  benchmarkPageSize?: number;
  /** Development benchmark only; omitted by the production application. */
  onFetchBenchmarkEvent?: (event: FetchBenchmarkEvent) => void;
  /** Development benchmark only; omitted by the production application. */
  onScatterBenchmarkResult?: (result: ScatterPlotBenchmarkResult) => void;
}

interface SelectedData {
  experimentName: string;
  startDate: Date;
  endDate: Date;
  selectedSensors: string[];
  selectedParameters: string[];
}

interface SensorData {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number | null;
  label?: string | null;
  location?: string | null;
  [key: string]: any;
}

interface SensorOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface SensorDisplayOption {
  displayKey: string;
  displayLabel: string;
  llaIds: string[];
  isLocationBacked: boolean;
  sortPrimary: string;
  sortSecondary: string;
}

interface SensorDataRow {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number | null;
  label: string | null;
  location: string | null;
  experiment: string;
  owner: string;
  mac_address: string;
}

interface FetchProgress {
  mode: 'legacy' | 'paged';
  sensorChunk: number;
  sensorChunks: number;
  dateWindow: number;
  dateWindows: number;
  rowsLoaded: number;
  chunksCompleted: number;
  chunksTotal: number;
  streamsCompleted?: number;
}

type FetchRequestStatus = 'idle' | 'loading' | 'complete' | 'failed' | 'cancelled';

interface FetchRequestState {
  requestId: number;
  selectionSignature: string;
  status: FetchRequestStatus;
  rowsLoaded: number;
  chunksCompleted: number;
  chunksTotal: number;
  estimatedRows: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  transport: 'legacy' | 'paged';
}

interface CompletedDataset {
  requestId: number;
  selectionSignature: string;
  rowCount: number;
  selectedSensors: string[];
  selectedParameters: string[];
  experimentName: string;
  dateStart: string;
  dateEnd: string;
  completedAt: number;
}

interface FetchBenchmarkEvent {
  type: 'start' | 'chunk' | 'sort' | 'complete' | 'failed' | 'cancelled';
  requestId: number;
  at: number;
  rowsLoaded?: number;
  chunkRows?: number;
  chunksCompleted?: number;
  chunksTotal?: number;
  estimatedRows?: number;
  transformMs?: number;
  sortMs?: number;
  totalMs?: number;
  data?: SensorData[];
  error?: string;
}

const EMPTY_FETCH_REQUEST: FetchRequestState = {
  requestId: 0,
  selectionSignature: '',
  status: 'idle',
  rowsLoaded: 0,
  chunksCompleted: 0,
  chunksTotal: 0,
  estimatedRows: 0,
  startedAt: null,
  completedAt: null,
  error: null,
  transport: 'legacy',
};

interface FetchDataRequestPayload {
  owner: string;
  mac_address: string;
  experimentId: number;
  experiment: string;
  selectedSensors: string[];
  selectedParameters: string[];
  dateRange: UtcDateWindow;
}

class FetchDataHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string
  ) {
    super(message);
    this.name = 'FetchDataHttpError';
  }
}

const MAX_ERROR_BODY_LENGTH = 500;
const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const parseRetryAfterMs = (retryAfter: string | null): number | null => {
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(retryAfter);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : null;
};

const waitForRetry = (delayMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The request was cancelled', 'AbortError'));
      return;
    }

    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException('The request was cancelled', 'AbortError'));
    };

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);

    signal.addEventListener('abort', handleAbort, { once: true });
  });

const fetchDataWindow = async (
  requestData: FetchDataRequestPayload,
  signal: AbortSignal,
  sensorChunkNumber: number,
  sensorChunkCount: number,
  dateWindowNumber: number,
  dateWindowCount: number
): Promise<SensorDataRow[]> => {
  const context =
    `sensor chunk ${sensorChunkNumber}/${sensorChunkCount}, ` +
    `date window ${dateWindowNumber}/${dateWindowCount} ` +
    `(${requestData.dateRange.start} to ${requestData.dateRange.end})`;

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      const response = await fetch(API_ENDPOINTS.FETCH_DATA, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
        signal,
      });

      if (response.ok) {
        return await response.json() as SensorDataRow[];
      }

      let responseBody = '';
      try {
        responseBody = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
      } catch {
        responseBody = '';
      }

      if (attempt === 0 && RETRYABLE_HTTP_STATUSES.has(response.status)) {
        const retryAfterMs =
          response.status === 429
            ? parseRetryAfterMs(response.headers.get('Retry-After'))
            : null;
        const delayMs = retryAfterMs ?? 1000 + Math.random() * 1000;
        logger.warn('Retrying fetch-data request', {
          status: response.status,
          context,
          delayMs: Math.round(delayMs),
        });
        await waitForRetry(delayMs, signal);
        continue;
      }

      const isResponseSizeError =
        response.status === 500 &&
        /response size.*too large|too large.*response size/i.test(responseBody);
      const detail = responseBody || response.statusText || 'No error details returned';
      const message = isResponseSizeError
        ? `The server response exceeded its size limit for ${context}. ${detail}`
        : `Fetch failed with HTTP ${response.status} for ${context}. ${detail}`;

      throw new FetchDataHttpError(message, response.status, responseBody);
    } catch (error) {
      if (isAbortError(error) || error instanceof FetchDataHttpError) {
        throw error;
      }

      const isEligibleNetworkFailure = error instanceof TypeError;
      if (attempt === 0 && isEligibleNetworkFailure) {
        const delayMs = 1000 + Math.random() * 1000;
        logger.warn('Retrying fetch-data after network failure', {
          context,
          delayMs: Math.round(delayMs),
        });
        await waitForRetry(delayMs, signal);
        continue;
      }

      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Fetch failed for ${context}. ${detail}`);
    }
  }

  throw new Error(`Fetch failed for ${context}`);
};

const Y_AXIS_COLORS = ['#8ac6bb', '#b2b27a', '#e6a157'];

// Artifact thresholds per parameter (case-insensitive matching)
const ARTIFACT_THRESHOLDS: Record<string, number> = {
  temperature: -40,
  humidity: -999,
  // Add more as needed
};

/** CSV export: fixed 3-minute UTC buckets aligned to epoch. */
const CSV_BUCKET_MS = 3 * 60 * 1000;

function bucketTimestampMs(iso: string): number | null {
  const ms = Date.parse(String(iso).trim());
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / CSV_BUCKET_MS) * CSV_BUCKET_MS;
}

function bucketIsoKey(iso: string): string | null {
  const b = bucketTimestampMs(iso);
  if (b === null) return null;
  return new Date(b).toISOString();
}

function buildGridKeys(minMs: number, maxMs: number): string[] {
  const start = Math.floor(minMs / CSV_BUCKET_MS) * CSV_BUCKET_MS;
  const end = Math.floor(maxMs / CSV_BUCKET_MS) * CSV_BUCKET_MS;
  const keys: string[] = [];
  for (let t = start; t <= end; t += CSV_BUCKET_MS) {
    keys.push(new Date(t).toISOString());
  }
  return keys;
}

// Custom Option components with checkbox
const ParameterOption = (props: OptionProps<ParameterOption, true, GroupBase<ParameterOption>>) => {
  return (
    <div className="cursor-pointer">
      <components.Option {...props}>
        <div className="flex items-start space-x-2">
          <input
            type="checkbox"
            checked={props.isSelected}
            onChange={() => null}
            className="rounded text-[#8ac6bb] focus:ring-[#8ac6bb] cursor-pointer"
          />
          <div className="flex flex-col leading-tight">
            <span>{props.label}</span>
            <span className="text-xs text-gray-400">{props.data.rawLabel}</span>
          </div>
        </div>
      </components.Option>
    </div>
  );
};

const ParameterGroupHeading = (
  props: GroupHeadingProps<ParameterOption, true, GroupBase<ParameterOption>>
) => (
  <components.GroupHeading {...props}>
    <div className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
      {props.children}
    </div>
  </components.GroupHeading>
);

const SensorOption = (props: OptionProps<SensorOption, true>) => {
  return (
    <div className="cursor-pointer">
      <components.Option {...props}>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={props.isSelected}
            onChange={() => null}
            className="rounded text-[#8ac6bb] focus:ring-[#8ac6bb] cursor-pointer"
          />
          <div className="flex flex-col leading-tight">
            <span>{props.label}</span>
            {props.data.subtitle ? (
              <span className="text-xs text-gray-400">{props.data.subtitle}</span>
            ) : null}
          </div>
        </div>
      </components.Option>
    </div>
  );
};


// Add this after the imports and before the DataSelector component
const generateColorFromString = (str: string): string => {
  // Improved hash function for better color distribution
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use golden ratio to distribute colors evenly across the full spectrum
  const goldenRatio = 0.618033988749895;
  const hue = (Math.abs(hash) * goldenRatio) % 1;
  
  // Convert to HSL with better distribution - avoid red range (0-30 and 330-360)
  let h = Math.floor(hue * 360);
  // Shift red hues to other colors for better visibility
  if (h < 30) h = h + 60; // Shift early reds to yellow-orange
  if (h > 330) h = h - 60; // Shift late reds to purple
  
  const s = 70 + (Math.abs(hash) % 20); // Saturation: 70-90%
  const l = 45 + (Math.abs(hash) % 20); // Lightness: 45-65%
  
  // Convert HSL to RGB for better Plotly compatibility
  const hNorm = h / 360;
  const sNorm = s / 100;
  const lNorm = l / 100;
  
  let r, g, b;
  if (sNorm === 0) {
    r = g = b = lNorm;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;
    r = hue2rgb(p, q, hNorm + 1/3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1/3);
  }
  
  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Cache for sensor colors
const sensorColorCache: Record<string, string> = {};

const getSensorColor = (sensorName: string): string => {
  if (!sensorColorCache[sensorName]) {
    sensorColorCache[sensorName] = generateColorFromString(sensorName);
  }
  return sensorColorCache[sensorName];
};


/**
 * DataSelector
 * Allows user to select experiment, date range, sensors, and parameters.
 * Fetches and transforms data for visualization.
 * @param experimentSummaries - list of experiment summary objects
 * @param selectedExperimentId - currently selected experiment id
 * @param selectedExperimentName - currently selected experiment name (display/debug)
 * @param dateRange - [start, end] date tuple
 * @param onDateChange - callback for date range change
 * @param dateState - react-date-range state
 * @param minDate, maxDate - date bounds
 * @returns JSX.Element
 */
const DataSelector: React.FC<DataSelectorProps> = ({ 
  experimentSummaries, 
  selectedExperimentId,
  selectedExperimentName,
  owner,
  mac_address,
  dateRange,
  dateState,
  minDate,
  maxDate,
  benchmarkMaxMergedRows,
  benchmarkUsePagedFetch,
  benchmarkPageConcurrency,
  benchmarkPageSize,
  onFetchBenchmarkEvent,
  onScatterBenchmarkResult,
}) => {
  const usePagedFetch = import.meta.env.DEV && typeof benchmarkUsePagedFetch === 'boolean'
    ? benchmarkUsePagedFetch
    : USE_PAGED_FETCH;
  const requestedPageConcurrency =
    import.meta.env.DEV && (benchmarkPageConcurrency === 1 || benchmarkPageConcurrency === 2)
      ? benchmarkPageConcurrency
      : 1;
  const requestedPageSize =
    import.meta.env.DEV && Number.isInteger(benchmarkPageSize) && Number(benchmarkPageSize) > 0
      ? Number(benchmarkPageSize)
      : undefined;
  const [selectedSensors, setSelectedSensors] = useState<string[]>([]);
  const [selectedDisplayKeys, setSelectedDisplayKeys] = useState<string[]>([]);
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
  const [availableSensors, setAvailableSensors] = useState<string[]>([]);
  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [showVisualization, setShowVisualization] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<FetchProgress | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchRequest, setFetchRequest] = useState<FetchRequestState>(EMPTY_FETCH_REQUEST);
  const [completedDataset, setCompletedDataset] = useState<CompletedDataset | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const [showLabelFilter, setShowLabelFilter] = useState(false);
  const [sensorLabelMap, setSensorLabelMap] = useState<Record<string, string[]>>({});
  /** Latest Location per LLA (summary + merged from fetch rows). */
  const [sensorLocationMap, setSensorLocationMap] = useState<Record<string, string>>({});
  /** Sensors passing include/exclude label rules. */
  const [sensorsAfterLabelFilter, setSensorsAfterLabelFilter] = useState<string[]>([]);
  const [includedLabels, setIncludedLabels] = useState<string[]>([]);
  const [excludeLabels, setExcludeLabels] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'sensor' | 'label'>('sensor');
  const [errorType, setErrorType] = useState<'STD' | 'SE'>('SE');

  const currentExperiment = experimentSummaries.find(exp => exp.experimentId === selectedExperimentId);
  /** Show Label Filter section when experiment-summary includes labelOptions (including `["[]"]`). */
  const hasLabelFilterSection = Boolean(currentExperiment?.labelOptions?.length);
  /** True when labelOptions contain real atomic tokens (clay, sand, etc.), not only empty `[]`. */
  const hasMeaningfulLabels = hasMeaningfulLabelOptions(currentExperiment?.labelOptions);

  /** Strict include labels for grouping/export; no composite expansion. */
  const selectedIncludeLabels = React.useMemo(
    () => normalizeIncludedLabels(includedLabels),
    [includedLabels]
  );

  /** Pool for sensor multiselect / Select All: label-filtered list, or all available before filter applies. */
  const sensorSelectionPool = React.useMemo(
    () =>
      sensorsAfterLabelFilter.length > 0 ? sensorsAfterLabelFilter : availableSensors,
    [sensorsAfterLabelFilter, availableSensors]
  );

  // Outlier filtering state (single source of truth)
  const [outlierConfig, setOutlierConfig] = React.useState<OutlierConfig>({
    enabled: false,
    method: 'IQR',
    threshold: 1.5,
  });
  
  // Artifact filtering state (single source of truth)
  const [artifactFiltering, setArtifactFiltering] = React.useState<boolean>(false);

  const selectionSignature = [
    selectedExperimentId ?? '',
    dateRange[0]?.getTime() ?? '',
    dateRange[1]?.getTime() ?? '',
    selectedSensors.join('\u0001'),
    selectedParameters.join('\u0001'),
  ].join('|');

  useEffect(() => {
    const cancelledAt = Date.now();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestIdRef.current += 1;
    setIsLoading(false);
    setFetchProgress(null);
    setFetchError(null);
    setFetchRequest((previous) => previous.status === 'loading'
      ? {
          ...previous,
          status: 'cancelled',
          completedAt: cancelledAt,
          error: 'Selection changed before the request completed.',
        }
      : previous
    );
  }, [selectionSignature]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    },
    []
  );

  // Helper: Filter artifact measurements (e.g., -40°C for temperature)
  function filterArtifacts(data: SensorData[]): SensorData[] {
    return data.map(d => {
      const param = String(d.parameter).toLowerCase();
      const threshold = ARTIFACT_THRESHOLDS[param];
      
      if (threshold !== undefined && typeof d.value === 'number' && d.value === threshold) {
        return { ...d, value: NaN };
      }
      return d;
    });
  }

  // Use processed data for CSV export if filtering is enabled
  const processedSensorData = React.useMemo(() => {
    if (!artifactFiltering && !outlierConfig.enabled) return sensorData;

    // Outlier filtering mutates row values, so it still requires isolated row
    // objects. Artifact-only filtering is pure and copies only matching rows.
    let data = outlierConfig.enabled
      ? sensorData.map(d => ({ ...d }))
      : sensorData;
    
    // Apply artifact filtering first
    if (artifactFiltering) {
      data = filterArtifacts(data);
    }
    
    // Then apply outlier filtering
    if (outlierConfig.enabled) {
      data = applyOutlierFiltering(data, outlierConfig);
    }
    
    return data;
  }, [sensorData, artifactFiltering, outlierConfig]);

  // Reset and update available data when experiment changes
  useEffect(() => {
    if (selectedExperimentId !== null) {
      const experimentData = experimentSummaries.find(
        exp => exp.experimentId === selectedExperimentId
      );
      if (experimentData) {
        setAvailableSensors(experimentData.sensors || []);
        setAvailableParameters(experimentData.parameters || []);
        setSelectedSensors([]);
        setSelectedDisplayKeys([]);
        setSelectedParameters([]);
        setSensorData([]);
        setCompletedDataset(null);
        setFetchRequest(EMPTY_FETCH_REQUEST);
        setSensorLabelMap(
          experimentData.sensorLabelMap && typeof experimentData.sensorLabelMap === 'object'
            ? { ...experimentData.sensorLabelMap }
            : {}
        );
        setSensorLocationMap(
          experimentData.sensorLocationMap && typeof experimentData.sensorLocationMap === 'object'
            ? { ...experimentData.sensorLocationMap }
            : {}
        );
        setSensorsAfterLabelFilter(experimentData.sensors || []);
        setIncludedLabels([]);
        setExcludeLabels([]);
        setShowVisualization(false);
        setShowLabelFilter(!!experimentData.labelOptions?.length);
      }
    } else {
      setAvailableSensors([]);
      setAvailableParameters([]);
      setSelectedSensors([]);
      setSelectedDisplayKeys([]);
      setSelectedParameters([]);
      setSensorData([]);
      setCompletedDataset(null);
      setFetchRequest(EMPTY_FETCH_REQUEST);
      setSensorLabelMap({});
      setSensorLocationMap({});
      setSensorsAfterLabelFilter([]);
      setIncludedLabels([]);
      setExcludeLabels([]);
      setShowVisualization(false);
      setShowLabelFilter(false);
    }
  }, [selectedExperimentId, experimentSummaries]);

  /**
   * handleParameterChange
   * Updates selected parameters for visualization.
   * @param selectedOptions - MultiValue<ParameterOption>
   */
  const handleParameterChange = (selectedOptions: MultiValue<ParameterOption>) => {
    setSelectedParameters(selectedOptions.map(option => option.value));
  };

  /**
   * handleSensorChange
   * Updates selected sensors for visualization.
   * @param selectedOptions - MultiValue<SensorOption>
   */
  const handleSensorChange = (selectedOptions: MultiValue<SensorOption>) => {
    const nextDisplayKeys = selectedOptions.map((option) => option.value);
    setSelectedDisplayKeys(nextDisplayKeys);
    setSelectedSensors(expandDisplayKeysToSensors(nextDisplayKeys));
  };

  const getSensorDisplayName = React.useCallback((sensor: string) => {
    const location = sensorLocationMap[sensor];
    return location != null && String(location).trim() !== ''
      ? String(location).trim()
      : sensor;
  }, [sensorLocationMap]);

  const compareSensorNames = React.useCallback((left: string, right: string) => {
    const leftName = getSensorDisplayName(left);
    const rightName = getSensorDisplayName(right);
    const byName = leftName.localeCompare(rightName, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (byName !== 0) return byName;
    return left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }, [getSensorDisplayName]);

  const buildReplacementNamesForParameter = React.useCallback((
    parameterRows: SensorData[],
    sensors: string[]
  ) => {
    const presentSensors = Array.from(
      new Set(
        parameterRows
          .map((row) => String(row.sensor ?? ''))
          .filter((sensor) => sensors.includes(sensor))
      )
    );

    const rangesBySensor = new Map<string, { latest: number; earliest: number }>();
    for (const sensor of presentSensors) {
      rangesBySensor.set(sensor, {
        latest: Number.NEGATIVE_INFINITY,
        earliest: Number.POSITIVE_INFINITY,
      });
    }

    for (const row of parameterRows) {
      const sensor = String(row.sensor ?? '');
      if (!rangesBySensor.has(sensor)) continue;
      const ts = Date.parse(String(row.timestamp ?? ''));
      if (!Number.isFinite(ts)) continue;
      const range = rangesBySensor.get(sensor);
      if (!range) continue;
      range.latest = Math.max(range.latest, ts);
      range.earliest = Math.min(range.earliest, ts);
    }

    const groupedByLocation = new Map<string, string[]>();
    for (const sensor of sensors) {
      const displayName = getSensorDisplayName(sensor);
      const group = groupedByLocation.get(displayName);
      if (group) {
        group.push(sensor);
      } else {
        groupedByLocation.set(displayName, [sensor]);
      }
    }

    const namesBySensor: Record<string, string> = {};
    const replacedSensors = new Set<string>();
    for (const [displayName, sensorsInLocation] of groupedByLocation.entries()) {
      if (sensorsInLocation.length <= 1) {
        namesBySensor[sensorsInLocation[0]] = displayName;
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
          return left.localeCompare(right, undefined, {
            numeric: true,
            sensitivity: 'base',
          });
        });

      ranked.forEach((sensor, index) => {
        if (index === 0) {
          namesBySensor[sensor] = displayName;
          return;
        }
        replacedSensors.add(sensor);
        if (ranked.length === 2) {
          namesBySensor[sensor] = `${displayName} (replaced)`;
          return;
        }
        namesBySensor[sensor] = `${displayName} (replaced ${index})`;
      });
    }

    for (const sensor of sensors) {
      if (namesBySensor[sensor] == null) {
        namesBySensor[sensor] = getSensorDisplayName(sensor);
      }
    }

    return { namesBySensor, replacedSensors };
  }, [getSensorDisplayName]);

  const formatCsvTimestamp = React.useCallback((timestamp: string) => {
    const trimmed = String(timestamp).trim();
    return trimmed
      .replace(/\.\d+Z$/, '')
      .replace(/\.\d+$/, '')
      .replace(/Z$/, '');
  }, []);

  const {
    displayOptions,
    displayKeyToLlas,
    llaToDisplayKey,
    sensorOptions,
  } = React.useMemo(() => {
    const grouped = new Map<string, SensorDisplayOption>();

    for (const sensor of sensorSelectionPool) {
      const rawLocation = sensorLocationMap[sensor];
      const location = rawLocation != null ? String(rawLocation).trim() : '';
      const isLocationBacked = location !== '';
      const displayKey = isLocationBacked
        ? `location:${normalizeLocationKey(location)}`
        : `lla:${sensor}`;
      const displayLabel = isLocationBacked ? location : sensor;
      const sortPrimary = isLocationBacked
        ? normalizeLocationKey(location)
        : normalizeLocationKey(sensor);

      const existing = grouped.get(displayKey);
      if (existing) {
        existing.llaIds.push(sensor);
        continue;
      }

      grouped.set(displayKey, {
        displayKey,
        displayLabel,
        llaIds: [sensor],
        isLocationBacked,
        sortPrimary,
        sortSecondary: sensor,
      });
    }

    const dedupedOptions = Array.from(grouped.values())
      .map((option) => ({
        ...option,
        llaIds: option.llaIds.slice().sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        ),
      }))
      .sort((left, right) => {
        const byPrimary = left.sortPrimary.localeCompare(right.sortPrimary, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (byPrimary !== 0) return byPrimary;
        return left.sortSecondary.localeCompare(right.sortSecondary, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });

    const keyToLlas: Record<string, string[]> = {};
    const sensorToKey: Record<string, string> = {};
    for (const option of dedupedOptions) {
      keyToLlas[option.displayKey] = option.llaIds;
      for (const lla of option.llaIds) {
        sensorToKey[lla] = option.displayKey;
      }
    }

    return {
      displayOptions: dedupedOptions,
      displayKeyToLlas: keyToLlas,
      llaToDisplayKey: sensorToKey,
      sensorOptions: dedupedOptions.map((option) => ({
        value: option.displayKey,
        label: option.displayLabel,
        subtitle: getSensorTypeSubtitle(option.llaIds),
      })),
    };
  }, [sensorSelectionPool, sensorLocationMap]);

  const expandDisplayKeysToSensors = React.useCallback((displayKeys: string[]) => {
    const seen = new Set<string>();
    const expanded: string[] = [];
    const poolSet = new Set(sensorSelectionPool);
    for (const key of displayKeys) {
      const llas = displayKeyToLlas[key] ?? [];
      for (const lla of llas) {
        if (!poolSet.has(lla) || seen.has(lla)) continue;
        seen.add(lla);
        expanded.push(lla);
      }
    }
    return expanded.slice().sort(compareSensorNames);
  }, [displayKeyToLlas, sensorSelectionPool, compareSensorNames]);

  /**
   * Clamp selected display options when pool/mapping changes.
   * Defaults to all currently available visible options.
   */
  React.useEffect(() => {
    setSelectedDisplayKeys((prev) => {
      const valid = prev.filter((key) => displayKeyToLlas[key] != null);
      if (valid.length === prev.length && valid.length > 0) return prev;
      if (valid.length > 0) return valid;
      return displayOptions.map((option) => option.displayKey);
    });
  }, [displayOptions, displayKeyToLlas]);

  React.useEffect(() => {
    setSelectedSensors(expandDisplayKeysToSensors(selectedDisplayKeys));
  }, [selectedDisplayKeys, expandDisplayKeysToSensors]);

  const parameterOptions = React.useMemo<ParameterGroupOption[]>(() => {
    const availableSet = new Set(availableParameters);
    return PARAMETER_OPTIONS.map((group) => ({
      label: group.label,
      options: group.options
        .filter((option) => availableSet.has(option.value))
        .map((option) => ({
          value: option.value,
          label: option.label,
          rawLabel: option.value,
        })),
    })).filter((group) => group.options.length > 0);
  }, [availableParameters]);

  const flatParameterOptions = React.useMemo(
    () => parameterOptions.flatMap((group) => group.options),
    [parameterOptions]
  );

  /**
   * generateMockData
   * Generates mock sensor data for demo/preview.
   * @param startDate - Date
   * @param endDate - Date
   * @param sensors - string[]
   * @returns SensorData[]
   */
  const generateMockData = (startDate: Date, endDate: Date, sensors: string[]) => {
    const data: SensorData[] = [];
    const timeInterval = 3 * 60 * 1000; // 3 minutes in milliseconds

    // Convert to UTC dates to ensure consistent handling across timezones
    const adjustedStartDate = new Date(Date.UTC(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate(),
      0, 0, 0, 0
    ));
    
    const adjustedEndDate = new Date(Date.UTC(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
      23, 59, 59, 999
    ));
    
    const totalTime = adjustedEndDate.getTime() - adjustedStartDate.getTime();
    const numPoints = Math.floor(totalTime / timeInterval);

    // Generate data points at 3-minute intervals between start and end dates
    for (let i = 0; i < numPoints; i++) {
      const currentTimeUTC = new Date(adjustedStartDate.getTime() + (i * timeInterval));
      
      // Convert UTC time to local time for pattern generation
      const localTime = new Date(currentTimeUTC);
      const timeOfDay = localTime.getUTCHours(); // Use UTC hours for consistent patterns
      
      const row: SensorData = {
        timestamp: currentTimeUTC.toISOString(),
        sensor: '',
        parameter: '',
        value: null,
      };
      
      sensors.forEach(sensor => {
        // Base value + daily pattern + random noise
        const baseValue = 
          sensor.includes('temperature') ? 20 : // Base temperature 20°C
          sensor.includes('humidity') ? 50 : // Base humidity 50%
          sensor.includes('pressure') ? 1013 : // Base pressure 1013 hPa
          sensor.includes('light') ? 0 : // Base light 0 lux (will be modified by time of day)
          100; // Default base value

        // Daily patterns based on time of day
        const dailyPattern = 
          sensor.includes('temperature') ? Math.sin((timeOfDay - 6) * Math.PI / 12) * 5 : // Peak at 18:00, low at 6:00
          sensor.includes('humidity') ? -Math.sin((timeOfDay - 6) * Math.PI / 12) * 20 : // Inverse of temperature
          sensor.includes('pressure') ? Math.sin(timeOfDay * Math.PI / 12) * 5 : // Slight daily variation
          sensor.includes('light') ? 
            (timeOfDay >= 6 && timeOfDay <= 18 ? // Daylight hours
              Math.sin((timeOfDay - 6) * Math.PI / 12) * 1000 : // Peak at noon
              0) : // Night time
          0; // No daily pattern for other sensors

        // Random noise
        const noise = 
          sensor.includes('temperature') ? (Math.random() - 0.5) * 2 : // ±1°C
          sensor.includes('humidity') ? (Math.random() - 0.5) * 10 : // ±5%
          sensor.includes('pressure') ? (Math.random() - 0.5) * 2 : // ±1 hPa
          sensor.includes('light') ? Math.random() * 100 : // Random noise for light
          (Math.random() - 0.5) * 20; // Default noise

        row[sensor] = baseValue + dailyPattern + noise;
      });
      
      data.push(row);
    }

    return data;
  };  
  
  /**
   * getUtcRangeFromLocalDates
   * Converts picker-selected calendar dates into UTC day bounds for backend queries.
   * @param startDate - Date
   * @param endDate - Date
   * @returns { start: string, end: string }
   */
  const getUtcRangeFromLocalDates = (startDate: Date, endDate: Date) => {
    const startUtc = new Date(
      Date.UTC(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate(),
        0,
        0,
        0,
        0
      )
    ).toISOString();
    const endUtc = new Date(
      Date.UTC(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate(),
        23,
        59,
        59,
        999
      )
    ).toISOString();

    logger.info('Date conversions:', {
      inputStart: startDate,
      inputEnd: endDate,
      startDateConvertedUtc: startUtc,
      endDateConvertedUtc: endUtc,
    });

    return {
      start: startUtc,
      end: endUtc,
    };
  };
  
  /**
   * handleFetchData
   * Fetches sensor/parameter data from backend for selected experiment and date range.
   * Chunks sensors and UTC calendar days to keep each response bounded.
   * Updates sensorData and visualization state.
   * Side effect: network request, state update.
   */
  const cancelFetchData = () => {
    const cancelledRequestId = requestIdRef.current;
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setFetchProgress(null);
    setFetchError(null);
    setFetchRequest((previous) => previous.requestId === cancelledRequestId
      ? {
          ...previous,
          status: 'cancelled',
          completedAt: Date.now(),
          error: null,
        }
      : previous
    );
    onFetchBenchmarkEvent?.({
      type: 'cancelled',
      requestId: cancelledRequestId,
      at: performance.now(),
    });
  };

  const handleFetchData = async () => {
    if (
      selectedExperimentId === null ||
      !dateRange[0] ||
      !dateRange[1] ||
      selectedSensors.length === 0 ||
      selectedParameters.length === 0
    ) {
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const experimentIdForRequest = selectedExperimentId;
    const experimentNameForRequest = selectedExperimentName;
    const sensorsForRequest = [...selectedSensors];
    const parametersForRequest = [...selectedParameters];
    const utcRange = getUtcRangeFromLocalDates(dateRange[0], dateRange[1]);
    const pagedConcurrency = usePagedFetch ? requestedPageConcurrency : 1;
    const sensorChunkSize = usePagedFetch
      ? Math.ceil(sensorsForRequest.length / Math.min(pagedConcurrency, sensorsForRequest.length))
      : SENSOR_CHUNK_SIZE;
    const sensorChunks: string[][] = [];
    for (let index = 0; index < sensorsForRequest.length; index += sensorChunkSize) {
      sensorChunks.push(sensorsForRequest.slice(index, index + sensorChunkSize));
    }
    const dateWindowsBySensorChunk = usePagedFetch
      ? sensorChunks.map(() => [utcRange])
      : sensorChunks.map((sensorChunk) =>
          buildUtcDayWindows(
            utcRange.start,
            utcRange.end,
            computeDaysPerChunk(sensorChunk.length, parametersForRequest.length)
          )
        );
    let chunksTotal = usePagedFetch
      ? 0
      : dateWindowsBySensorChunk.reduce(
          (total, windows) => total + windows.length,
          0
        );
    const inclusiveDayCount = Math.floor(
      (Date.parse(utcRange.end) - Date.parse(utcRange.start)) / (24 * 60 * 60 * 1000)
    ) + 1;
    const estimatedRows =
      sensorsForRequest.length * parametersForRequest.length * inclusiveDayCount * 480;
    const benchmarkLimit =
      import.meta.env.DEV
      && Number.isInteger(benchmarkMaxMergedRows)
      && Number(benchmarkMaxMergedRows) > 0
        ? Number(benchmarkMaxMergedRows)
        : null;
    const mergedRowLimit = benchmarkLimit ?? (
      usePagedFetch ? MAX_PAGED_MERGED_ROWS : MAX_TESTED_MERGED_ROWS
    );

    setIsLoading(true);
    setFetchError(null);
    setFetchProgress({
      mode: usePagedFetch ? 'paged' : 'legacy',
      sensorChunk: 1,
      sensorChunks: sensorChunks.length,
      dateWindow: 1,
      dateWindows: 1,
      rowsLoaded: 0,
      chunksCompleted: 0,
      chunksTotal,
      streamsCompleted: 0,
    });
    setFetchRequest({
      requestId,
      selectionSignature,
      status: 'loading',
      rowsLoaded: 0,
      chunksCompleted: 0,
      chunksTotal,
      estimatedRows,
      startedAt: Date.now(),
      completedAt: null,
      error: null,
      transport: usePagedFetch ? 'paged' : 'legacy',
    });

    const startTime = performance.now();
    const transformedData: SensorData[] = [];
    let chunksCompleted = 0;
    let sortMs = 0;
    onFetchBenchmarkEvent?.({
      type: 'start',
      requestId,
      at: startTime,
      chunksTotal,
      estimatedRows,
    });

    try {
      if (usePagedFetch) {
        let nextStreamIndex = 0;
        let streamsCompleted = 0;
        const runStreamWorker = async () => {
          while (true) {
            const sensorIndex = nextStreamIndex;
            nextStreamIndex += 1;
            if (sensorIndex >= sensorChunks.length) return;
            const sensorChunk = sensorChunks[sensorIndex];
            const requestData: FetchDataPagePayload = {
              owner,
              mac_address,
              experimentId: experimentIdForRequest,
              experiment: experimentNameForRequest,
              selectedSensors: sensorChunk,
              selectedParameters: parametersForRequest,
              dateRange: utcRange,
              pageSize: requestedPageSize,
            };
            await fetchDataPageStream(
              API_ENDPOINTS.FETCH_DATA_V2_PAGE,
              requestData,
              controller.signal,
              ({ page }) => {
                if (controller.signal.aborted || requestId !== requestIdRef.current) {
                  throw new DOMException('The request was cancelled', 'AbortError');
                }
                if (transformedData.length + page.rows.length > mergedRowLimit) {
                  throw new Error(
                    `This selection exceeds the paged browser safety limit of ` +
                    `${mergedRowLimit.toLocaleString()} rows. No incomplete rows were published.`
                  );
                }
                const transformStartedAt = performance.now();
                for (const row of page.rows) {
                  transformedData.push({
                    timestamp: row.timestamp,
                    sensor: row.sensor,
                    parameter: row.parameter,
                    value: row.value,
                    label: row.label,
                    location: row.location,
                  });
                }
                const transformMs = performance.now() - transformStartedAt;
                chunksCompleted += 1;
                const lowerBoundTotal = chunksCompleted + (sensorChunks.length - streamsCompleted);
                onFetchBenchmarkEvent?.({
                  type: 'chunk',
                  requestId,
                  at: performance.now(),
                  rowsLoaded: transformedData.length,
                  chunkRows: page.rows.length,
                  chunksCompleted,
                  chunksTotal: lowerBoundTotal,
                  transformMs,
                });
                setFetchProgress({
                  mode: 'paged',
                  sensorChunk: sensorIndex + 1,
                  sensorChunks: sensorChunks.length,
                  dateWindow: page.page_sequence,
                  dateWindows: page.complete ? page.page_sequence : page.page_sequence + 1,
                  rowsLoaded: transformedData.length,
                  chunksCompleted,
                  chunksTotal: lowerBoundTotal,
                  streamsCompleted,
                });
                setFetchRequest((previous) => previous.requestId === requestId
                  ? {
                      ...previous,
                      rowsLoaded: transformedData.length,
                      chunksCompleted,
                      chunksTotal: lowerBoundTotal,
                    }
                  : previous
                );
              }
            );
            streamsCompleted += 1;
            if (requestId === requestIdRef.current) {
              setFetchProgress((previous) => previous?.mode === 'paged'
                ? { ...previous, streamsCompleted }
                : previous
              );
            }
          }
        };
        await Promise.all(
          Array.from(
            { length: Math.min(pagedConcurrency, sensorChunks.length) },
            () => runStreamWorker()
          )
        );
        chunksTotal = chunksCompleted;
      } else for (const [sensorIndex, sensorChunk] of sensorChunks.entries()) {
        const dateWindows = dateWindowsBySensorChunk[sensorIndex];

        for (const [dateIndex, dateWindow] of dateWindows.entries()) {
          if (controller.signal.aborted || requestId !== requestIdRef.current) {
            throw new DOMException('The request was cancelled', 'AbortError');
          }

          setFetchProgress({
            mode: 'legacy',
            sensorChunk: sensorIndex + 1,
            sensorChunks: sensorChunks.length,
            dateWindow: dateIndex + 1,
            dateWindows: dateWindows.length,
            rowsLoaded: transformedData.length,
            chunksCompleted,
            chunksTotal,
          });

          const requestData: FetchDataRequestPayload = {
            owner,
            mac_address,
            experimentId: experimentIdForRequest,
            experiment: experimentNameForRequest,
            selectedSensors: sensorChunk,
            selectedParameters: parametersForRequest,
            dateRange: dateWindow,
          };

          const data = await fetchDataWindow(
            requestData,
            controller.signal,
            sensorIndex + 1,
            sensorChunks.length,
            dateIndex + 1,
            dateWindows.length
          );

          if (controller.signal.aborted || requestId !== requestIdRef.current) {
            throw new DOMException('The request was cancelled', 'AbortError');
          }

          if (transformedData.length + data.length > mergedRowLimit) {
            throw new Error(
              `This selection exceeds the tested browser safety limit of ` +
              `${mergedRowLimit.toLocaleString()} rows. ` +
              `The last date window was not added; select fewer sensors, parameters, or days.`
            );
          }

          const transformStartedAt = performance.now();
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
          const transformMs = performance.now() - transformStartedAt;
          chunksCompleted += 1;
          onFetchBenchmarkEvent?.({
            type: 'chunk',
            requestId,
            at: performance.now(),
            rowsLoaded: transformedData.length,
            chunkRows: data.length,
            chunksCompleted,
            chunksTotal,
            transformMs,
          });

          logger.info('Fetched data window', {
            sensorChunk: sensorIndex + 1,
            sensorChunks: sensorChunks.length,
            dateWindow: dateIndex + 1,
            dateWindows: dateWindows.length,
            dateRange: dateWindow,
            rowCount: data.length,
            rowsLoaded: transformedData.length,
          });

          if (requestId === requestIdRef.current) {
            setFetchProgress({
              mode: 'legacy',
              sensorChunk: sensorIndex + 1,
              sensorChunks: sensorChunks.length,
              dateWindow: dateIndex + 1,
              dateWindows: dateWindows.length,
              rowsLoaded: transformedData.length,
              chunksCompleted,
              chunksTotal,
            });
            setFetchRequest((previous) => previous.requestId === requestId
              ? {
                  ...previous,
                  rowsLoaded: transformedData.length,
                  chunksCompleted,
                }
              : previous
            );
          }
        }
      }

      const sortStartedAt = performance.now();
      transformedData.sort(
        (left, right) =>
          left.timestamp.localeCompare(right.timestamp) ||
          left.sensor.localeCompare(right.sensor) ||
          left.parameter.localeCompare(right.parameter)
      );
      sortMs = performance.now() - sortStartedAt;
      onFetchBenchmarkEvent?.({
        type: 'sort',
        requestId,
        at: performance.now(),
        rowsLoaded: transformedData.length,
        sortMs,
      });

      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        throw new DOMException('The request was cancelled', 'AbortError');
      }

      setSensorLocationMap((prev) => {
        if (requestId !== requestIdRef.current) {
          return prev;
        }
        const merged: Record<string, string> = { ...prev };
        for (const row of transformedData) {
          if (row.sensor && row.location != null && String(row.location).trim() !== '') {
            merged[String(row.sensor)] = String(row.location).trim();
          }
        }
        return merged;
      });
      setSensorData(transformedData);
      setShowVisualization(true);
      const completedAt = Date.now();
      setCompletedDataset({
        requestId,
        selectionSignature,
        rowCount: transformedData.length,
        selectedSensors: sensorsForRequest,
        selectedParameters: parametersForRequest,
        experimentName: experimentNameForRequest,
        dateStart: utcRange.start,
        dateEnd: utcRange.end,
        completedAt,
      });
      setFetchRequest({
        requestId,
        selectionSignature,
        status: 'complete',
        rowsLoaded: transformedData.length,
        chunksCompleted,
        chunksTotal,
        estimatedRows,
        startedAt: completedAt - (performance.now() - startTime),
        completedAt,
        error: null,
        transport: usePagedFetch ? 'paged' : 'legacy',
      });
      onFetchBenchmarkEvent?.({
        type: 'complete',
        requestId,
        at: performance.now(),
        rowsLoaded: transformedData.length,
        chunksCompleted,
        chunksTotal,
        sortMs,
        totalMs: performance.now() - startTime,
        data: transformedData,
      });

      logger.info('Completed fetch-data request', {
        durationSeconds: ((performance.now() - startTime) / 1000).toFixed(2),
        sensorChunks: sensorChunks.length,
        rowCount: transformedData.length,
      });
    } catch (error) {
      if (requestId !== requestIdRef.current || isAbortError(error)) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setFetchError(message);
      setFetchRequest((previous) => previous.requestId === requestId
        ? {
            ...previous,
            status: 'failed',
            rowsLoaded: transformedData.length,
            chunksCompleted,
            completedAt: Date.now(),
            error: message,
          }
        : previous
      );
      onFetchBenchmarkEvent?.({
        type: 'failed',
        requestId,
        at: performance.now(),
        rowsLoaded: transformedData.length,
        chunksCompleted,
        chunksTotal,
        totalMs: performance.now() - startTime,
        error: message,
      });
      logger.error('Error fetching data', { message });
    } finally {
      if (requestId === requestIdRef.current) {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsLoading(false);
        setFetchProgress(null);
      }
    }
  };

  const displayedDatasetMatchesSelection = Boolean(
    completedDataset?.selectionSignature === selectionSignature
  );
  const displayedDatasetIsPreviousRequest = Boolean(
    completedDataset
    && completedDataset.requestId !== fetchRequest.requestId
    && (fetchRequest.status === 'failed' || fetchRequest.status === 'cancelled')
  );
  const exportParameters = completedDataset?.selectedParameters ?? [];
  const exportSensors = completedDataset?.selectedSensors ?? [];
  const exportExperimentName = completedDataset?.experimentName ?? selectedExperimentName;

  /**
   * handleDownloadCSV
   * Downloads the currently loaded sensor data as a CSV file.
   * Side effect: triggers file download in browser.
   * Uses outlier filtering if enabled.
   */
  const handleDownloadCSV = () => {
    if (processedSensorData.length === 0) return;

    const csvCell = (value: string | number) => {
      const text = String(value ?? '');
      const escaped = text.replace(/"/g, '""');
      return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
    };

    const safeHeaderLabel = (label: string) =>
      String(label)
        .trim()
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ');

    let minBucketMs = Infinity;
    let maxBucketMs = -Infinity;
    for (const d of processedSensorData) {
      const b = bucketTimestampMs(d.timestamp);
      if (b === null) continue;
      minBucketMs = Math.min(minBucketMs, b);
      maxBucketMs = Math.max(maxBucketMs, b);
    }
    if (!Number.isFinite(minBucketMs) || !Number.isFinite(maxBucketMs)) return;
    const gridTimestamps = buildGridKeys(minBucketMs, maxBucketMs);

    // Group by Label mode
    if (groupBy === 'label' && selectedIncludeLabels.length > 0) {
      const labelMap = sensorLabelMap;
      const labelsToExport = selectedIncludeLabels;
      
      // For each parameter, build a map: 3-min bucket -> label -> [values]
      const byTimestamp: Record<string, Record<string, Record<string, number[]>>> = {};
      processedSensorData.forEach(d => {
        const param = d.parameter;
        const bucketKey = bucketIsoKey(d.timestamp);
        if (!bucketKey) return;
        const matchedLabels = getSelectedLabelMemberships(
          d as RowWithSensorLabel,
          labelMap,
          labelsToExport
        );
        matchedLabels.forEach((label) => {
          if (!byTimestamp[bucketKey]) byTimestamp[bucketKey] = {};
          if (!byTimestamp[bucketKey][label]) byTimestamp[bucketKey][label] = {};
          if (!byTimestamp[bucketKey][label][param]) byTimestamp[bucketKey][label][param] = [];
          if (d.value !== null && d.value !== undefined && !isNaN(Number(d.value))) {
            byTimestamp[bucketKey][label][param].push(Number(d.value));
          }
        });
      });

      const allTimestamps = gridTimestamps;

      // Create a separate file for each parameter
      exportParameters.forEach(param => {
        // Build columns: for each label, add mean and errorType (SE or STD)
        const columns: string[] = ['Timestamp'];
        labelsToExport.forEach(label => {
          const safeLabel = safeHeaderLabel(label);
          columns.push(`${safeLabel}-Mean`);
          columns.push(`${safeLabel}-${errorType}`);
        });

        // Build rows
        const rows = allTimestamps.map(ts => {
          const row: (string | number)[] = [formatCsvTimestamp(ts)];
          labelsToExport.forEach(label => {
            const values = byTimestamp[ts]?.[label]?.[param] || [];
            if (values.length > 0) {
              // Calculate mean
              const mean = values.reduce((a, b) => a + b, 0) / values.length;
              row.push(mean);

              // Calculate errorType if we have more than 1 value
              if (values.length > 1) {
                const meanVal = mean;
                const variance = values.reduce((a, b) => a + (b - meanVal) ** 2, 0) / values.length;
                const std = Math.sqrt(variance);
                if (errorType === 'SE') {
                  row.push(std / Math.sqrt(values.length));
                } else {
                  row.push(std);
                }
              } else {
                row.push('');
              }
            } else {
              row.push('');
              row.push('');
            }
          });
          return row;
        });

        // Combine header and rows
        const csvContent = [
          columns.map(csvCell).join(','),
          ...rows.map(row => row.map(csvCell).join(',')),
        ].join('\n');

        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exportExperimentName}_${param}_labels_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      });
      return;
    }

    // Default: Group by Sensor — 3-minute buckets, mean when multiple points fall in a bucket
    const dataByParameter: Record<string, Record<string, Record<string, number[]>>> = {};

    exportParameters.forEach(param => {
      dataByParameter[param] = {};
    });

    processedSensorData.forEach(curr => {
      const param = curr.parameter;
      const bucketKey = bucketIsoKey(curr.timestamp);
      if (!bucketKey) return;
      const sensor = curr.sensor;
      const value = curr.value;
      if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
        return;
      }
      if (!dataByParameter[param][bucketKey]) {
        dataByParameter[param][bucketKey] = {};
      }
      if (!dataByParameter[param][bucketKey][sensor]) {
        dataByParameter[param][bucketKey][sensor] = [];
      }
      dataByParameter[param][bucketKey][sensor].push(Number(value));
    });

    const sensorsWithAnyRows = new Set(
      processedSensorData.map((row) => String(row.sensor ?? ''))
    );
    const allSensors = [...exportSensors].sort(compareSensorNames);
    const { namesBySensor: sensorHeaderMap, replacedSensors } =
      buildReplacementNamesForParameter(processedSensorData, allSensors);

    // Create and download a file for each parameter
    exportParameters.forEach(param => {
      const paramData = dataByParameter[param];
      const timestamps = gridTimestamps;
      const sensors = allSensors.filter(
        (sensor) => !replacedSensors.has(sensor) || sensorsWithAnyRows.has(sensor)
      );
      if (sensors.length === 0) return;

      const rows = timestamps.map(timestamp => {
        const bucket = paramData[timestamp];
        return [
          formatCsvTimestamp(timestamp),
          ...sensors.map(sensor => {
            const arr = bucket?.[sensor];
            if (!arr || arr.length === 0) return '';
            return arr.reduce((a, b) => a + b, 0) / arr.length;
          })
        ];
      });

      // Combine header and rows
      const csvContent = [
        ['Timestamp', ...sensors.map(sensor => sensorHeaderMap[sensor])].join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportExperimentName}_${param}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    });
  };

  /**
   * getSensorUnit
   * Returns the unit for a given sensor name.
   * @param sensor - string
   * @returns string (unit)
   */
  const getSensorUnit = (sensor: string): string => {
    if (sensor.includes('temperature')) return '°C';
    if (sensor.includes('humidity')) return '%';
    if (sensor.includes('pressure')) return 'hPa';
    if (sensor.includes('light')) return 'lux';
    return 'units';
  };

  const isSelectionValid = selectedSensors.length > 0 && selectedParameters.length > 0;
  const [showSelectionWarning, setShowSelectionWarning] = useState(false);
  const estimatedSelectionRows = React.useMemo(() => {
    if (!dateRange[0] || !dateRange[1] || !isSelectionValid) return 0;
    const startDay = Date.UTC(
      dateRange[0].getFullYear(),
      dateRange[0].getMonth(),
      dateRange[0].getDate()
    );
    const endDay = Date.UTC(
      dateRange[1].getFullYear(),
      dateRange[1].getMonth(),
      dateRange[1].getDate()
    );
    const days = Math.max(0, Math.floor((endDay - startDay) / (24 * 60 * 60 * 1000)) + 1);
    return selectedSensors.length * selectedParameters.length * days * 480;
  }, [dateRange, isSelectionValid, selectedSensors.length, selectedParameters.length]);

  if (selectedExperimentId === null) return null;

  return (
    <div className="space-y-6">
      <div className="p-4 bg-white rounded-lg shadow">
        {/* Sensor Selection */}
        <div className="mb-6">
          <div className="flex items-center mb-2">
            {hasLabelFilterSection && (
              <button
                onClick={() => setShowLabelFilter(!showLabelFilter)}
                className="text-sm text-[#8ac6bb] hover:text-[#7ab6ab] flex items-center"
              >
                <span className="mr-1">Label Filter</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-4 h-4 transition-transform ${showLabelFilter ? 'rotate-180' : ''}`}
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
            <label className="block text-sm font-medium text-gray-700 flex items-center ml-2">
              <span>Select Sensors</span>
              <span
                className="ml-2 font-semibold"
                style={{ color: '#8AC6B6' }}
              >
                ({selectedDisplayKeys.length}/{sensorOptions.length})
              </span>
            </label>
          </div>

          {showLabelFilter && hasLabelFilterSection && currentExperiment && (
            <div className="mb-4">
              <LabelFilter
                key={String(selectedExperimentId)}
                sensorLabelOptions={currentExperiment.labelOptions ?? []}
                sensorLabelMap={sensorLabelMap}
                allSensors={availableSensors}
                disabled={!hasMeaningfulLabels}
                onFilterChange={(filteredSensors, includeLabels, excludeLabels) => {
                  setSensorsAfterLabelFilter(filteredSensors);
                  setIncludedLabels(includeLabels);
                  setExcludeLabels(excludeLabels);
                  // Keep visible selector aligned with label-filtered LLAs.
                  const nextDisplayKeys = Array.from(
                    new Set(
                      filteredSensors
                        .map((sensor) => llaToDisplayKey[sensor])
                        .filter((value): value is string => Boolean(value))
                    )
                  );
                  setSelectedDisplayKeys(nextDisplayKeys);
                  setSelectedSensors(expandDisplayKeysToSensors(nextDisplayKeys));
                }}
              />
            </div>
          )}

          <div className="flex items-center space-x-2 mb-2">
            <button
              onClick={() => {
                if (selectedDisplayKeys.length === sensorOptions.length) {
                  setSelectedDisplayKeys([]);
                  setSelectedSensors([]);
                } else {
                  const nextDisplayKeys = displayOptions.map((option) => option.displayKey);
                  setSelectedDisplayKeys(nextDisplayKeys);
                  setSelectedSensors(expandDisplayKeysToSensors(nextDisplayKeys));
                }
              }}
              className="text-sm text-[#8ac6bb] hover:text-[#7ab6ab]"
            >
              {selectedDisplayKeys.length === sensorOptions.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <Select<SensorOption, true>
            isMulti
            options={sensorOptions}
            value={sensorOptions.filter((option) => selectedDisplayKeys.includes(option.value))}
            onChange={handleSensorChange}
            className="basic-multi-select"
            classNamePrefix="select"
            components={{ Option: SensorOption }}
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            theme={(theme) => ({
              ...theme,
              colors: {
                ...theme.colors,
                primary: '#8ac6bb',
                primary25: '#e6f0ee',
                primary50: '#d1e3e0',
                primary75: '#b2d8d1'
              },
            })}
          />
        </div>

        {/* Parameter Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Parameters
          </label>
          <Select<ParameterOption, true, GroupBase<ParameterOption>>
            isMulti
            options={parameterOptions}
            value={flatParameterOptions.filter((option) => selectedParameters.includes(option.value))}
            onChange={handleParameterChange}
            className="basic-multi-select"
            classNamePrefix="select"
            components={{ Option: ParameterOption, GroupHeading: ParameterGroupHeading }}
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            isClearable
            isSearchable
            placeholder="Select parameters to visualize..."
            noOptionsMessage={() => 'No matching parameters'}
            formatOptionLabel={(
              option: ParameterOption,
              meta: FormatOptionLabelMeta<ParameterOption>
            ) => {
              if (meta.context === 'value') {
                return <span>{option.label}</span>;
              }
              return (
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  <span className="text-xs text-gray-400">{option.rawLabel}</span>
                </div>
              );
            }}
            styles={{
              valueContainer: (base) => ({
                ...base,
                flexWrap: 'wrap',
                gap: '0.2rem',
                maxHeight: '90px',
                overflowY: 'auto',
              }),
              multiValue: (base) => ({
                ...base,
                backgroundColor: '#e6f0ee',
                borderRadius: '999px',
                maxWidth: '100%',
              }),
              multiValueLabel: (base) => ({
                ...base,
                color: '#355f58',
                fontSize: 12,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }),
              groupHeading: (base) => ({
                ...base,
                background: '#f3f4f6',
                fontWeight: 700,
                color: '#374151',
                paddingTop: '6px',
                paddingBottom: '6px',
              }),
            }}
            theme={(theme) => ({
              ...theme,
              colors: {
                ...theme.colors,
                primary: '#8ac6bb',
                primary25: '#e6f0ee',
                primary50: '#d1e3e0',
                primary75: '#b2d8d1'
              },
            })}
          />
        </div>

        {/* Action Buttons */}
        {estimatedSelectionRows > LARGE_DATASET_WARNING_ROWS && (
          <div
            className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            role="status"
            data-testid="large-request-warning"
          >
            Large request: estimated {estimatedSelectionRows.toLocaleString()} raw rows.
            {' '}Completeness is confirmed only after every request finishes.
            {estimatedSelectionRows > (
              usePagedFetch ? MAX_PAGED_MERGED_ROWS : MAX_TESTED_MERGED_ROWS
            ) && (
              <>
                {' '}This estimate exceeds the tested frontend range of{' '}
                {(usePagedFetch
                  ? MAX_PAGED_MERGED_ROWS
                  : MAX_TESTED_MERGED_ROWS).toLocaleString()} rows; loading will stop safely if the
                actual row count crosses that limit.
              </>
            )}
          </div>
        )}
        <div className="flex space-x-4 mt-6">
          <button
            onClick={() => {
              if (!isSelectionValid) {
                setShowSelectionWarning(true);
                setTimeout(() => setShowSelectionWarning(false), 2500);
                return;
              }
              handleFetchData();
            }}
            disabled={!isSelectionValid || isLoading}
            className={`flex-1 py-2 px-4 rounded-md flex items-center justify-center ${
              isSelectionValid && !isLoading
                ? 'bg-[#8ac6bb] text-white hover:bg-[#7ab6ab]'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </>
            ) : (
              'Fetch Data'
            )}
          </button>
          {isLoading && (
            <button
              type="button"
              onClick={cancelFetchData}
              className="bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          )}
          {showSelectionWarning && (
            <div className="mt-2 text-red-600 text-sm font-semibold">You need to choose at least one sensor and one parameter.</div>
          )}
          {processedSensorData.length > 0 && completedDataset && !isLoading && (
            <button
              onClick={handleDownloadCSV}
              className="bg-[#b2b27a] text-white py-2 px-4 rounded hover:bg-[#a2a26a] transition-colors"
            >
              {displayedDatasetMatchesSelection ? 'Download CSV' : 'Download previous completed CSV'}
            </button>
          )}
        </div>
        {isLoading && fetchProgress && (
          <div
            className="mt-3 text-sm text-gray-700"
            role="status"
            data-testid="fetch-progress"
          >
            {fetchProgress.mode === 'paged' ? (
              <>
                Page {fetchProgress.chunksCompleted}
                {' · '}Stream {fetchProgress.streamsCompleted ?? 0} of{' '}
                {fetchProgress.sensorChunks} complete
              </>
            ) : (
              <>
                Sensor chunk {fetchProgress.sensorChunk} of {fetchProgress.sensorChunks}
                {' · '}Date window {fetchProgress.dateWindow} of {fetchProgress.dateWindows}
                {' · '}Request {fetchProgress.chunksCompleted} of{' '}
                {fetchProgress.chunksTotal} complete
              </>
            )}
            {' · '}{fetchProgress.rowsLoaded.toLocaleString()} rows loaded
            {' · '}Estimated {fetchRequest.estimatedRows.toLocaleString()} rows
          </div>
        )}
        {fetchError && (
          <div className="mt-3 text-sm font-semibold text-red-600" role="alert">
            {fetchError}
          </div>
        )}
        {fetchRequest.status === 'cancelled' && (
          <div className="mt-3 text-sm font-semibold text-amber-700" role="status">
            New data request cancelled. No incomplete rows were published.
          </div>
        )}
        {fetchRequest.status === 'complete' && completedDataset && (
          <div className="mt-3 text-sm font-medium text-emerald-700" role="status">
            Complete dataset: {completedDataset.rowCount.toLocaleString()} raw rows from{' '}
            {fetchRequest.chunksCompleted} of {fetchRequest.chunksTotal}{' '}
            {fetchRequest.transport === 'paged' ? 'pages' : 'requests'}.
          </div>
        )}
        {completedDataset
          && (!displayedDatasetMatchesSelection || displayedDatasetIsPreviousRequest)
          && !isLoading && (
          <div
            className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            role="status"
            data-testid="dataset-provenance"
          >
            Displaying the previous completed dataset ({completedDataset.rowCount.toLocaleString()} raw rows;
            {' '}{completedDataset.selectedSensors.length.toLocaleString()} sensors;
            {' '}{completedDataset.selectedParameters.length.toLocaleString()}{' '}
            {completedDataset.selectedParameters.length === 1 ? 'parameter' : 'parameters'}).
            {' '}It is not the result of the current
            {fetchRequest.status === 'failed'
              ? ' failed request.'
              : fetchRequest.status === 'cancelled'
                ? ' cancelled request.'
                : ' selection.'}
          </div>
        )}
      </div>

      {/* Data Visualization */}
      {showVisualization && completedDataset && processedSensorData.length > 0 && !isLoading && (
        <div className="p-4 bg-white rounded-lg shadow">
          <VisualizationPanel
            data={sensorData as any}
            selectedParameters={completedDataset.selectedParameters}
            selectedSensors={completedDataset.selectedSensors}
            experimentName={completedDataset.experimentName}
            getSensorColor={getSensorColor}
            getSensorDisplayName={getSensorDisplayName}
            outlierConfig={outlierConfig}
            setOutlierConfig={setOutlierConfig}
            artifactFiltering={artifactFiltering}
            setArtifactFiltering={setArtifactFiltering}
              sensorLabelMap={sensorLabelMap}
            includedLabels={selectedIncludeLabels}
            excludeLabels={excludeLabels}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            errorType={errorType}
            setErrorType={setErrorType}
            onScatterBenchmarkResult={onScatterBenchmarkResult}
          />
        </div>
      )}
    </div>
  );
};

export default DataSelector;
