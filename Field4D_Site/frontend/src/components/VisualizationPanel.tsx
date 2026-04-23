/*
 * VisualizationPanel.tsx
 * Panel for selecting and displaying different types of data visualizations.
 * Supports scatter, box, and histogram plots.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import ScatterPlot from './graph-components/ScatterPlot';
import BoxPlot from './graph-components/BoxPlot';
import Select from 'react-select';
import Histogram from './graph-components/Histogram';
import OutlierToggle from './Advanced-function/OutlierToggle';
import ArtifactFilterToggle from './Advanced-function/ArtifactFilterToggle';
import CorrelationMatrix from './graph-components/CorrelationMatrix';
import CorrelationScatter from './graph-components/CorrelationScatter';
import LoadingSpinner from './graph-components/LoadingSpinner';
import ANOVAResultsScatterPlot from './graph-components/ANOVAResultsScatterPlot';
import HealthCheckButton from './analytics/HealthCheckButton';
import { getParameterUnit } from './DataSelector';
import {
  applyOutlierFiltering,
  getCompatibleOutlierMethod,
  getSupportedOutlierMethods,
  type OutlierConfig,
  type OutlierMethod,
} from '../utils/outlierFiltering';

interface SensorData {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number;
  [key: string]: any;
}

interface CorrelationData {
  matrix: number[][];
  parameters: string[];
  topCorrelations: Array<{
    param1: string;
    param2: string;
    correlation: number;
  }>;
  bottomCorrelations: Array<{
    param1: string;
    param2: string;
    correlation: number;
  }>;
}

interface VisualizationPanelProps {
  data: SensorData[];
  selectedParameters: string[];
  selectedSensors: string[];
  experimentName?: string;
  getSensorColor?: (sensor: string) => string;
  getSensorDisplayName?: (sensor: string) => string;
  outlierConfig: OutlierConfig;
  setOutlierConfig: React.Dispatch<React.SetStateAction<OutlierConfig>>;
  /**
   * Whether artifact filtering is enabled (controlled by parent)
   */
  artifactFiltering: boolean;
  /**
   * Callback to set artifact filtering state (controlled by parent)
   */
  setArtifactFiltering: React.Dispatch<React.SetStateAction<boolean>>;
  sensorLabelMap: Record<string, string[]>;
  includedLabels: string[];
  excludeLabels: string[];
  groupBy: 'sensor' | 'label';
  setGroupBy?: React.Dispatch<React.SetStateAction<'sensor' | 'label'>>;
  errorType?: 'STD' | 'SE';
  setErrorType?: React.Dispatch<React.SetStateAction<'STD' | 'SE'>>;
}

const VISUALIZATIONS = [
  { label: 'Scatter Plot', value: 'scatter' },
  { label: 'Box Plot', value: 'box' },
  { label: 'Histogram', value: 'histogram' },
  // { label: 'Correlation Matrix', value: 'correlation' } 
];

const STATISTICAL_TESTS = [
  { label: 'ANOVA (Tukey\'s HSD)', value: 'anova_tukey' },
  // Future tests can be added here:
  // { label: 'T-Test', value: 't_test' },
  // { label: 'Dunnett\'s Test', value: 'dunnett' },
];

// Memoized BoxPlot component to prevent re-renders when slider moves
const MemoizedBoxPlot = React.memo(BoxPlot, (prevProps, nextProps) => {
  // Only re-render if relevant props change
  return (
    prevProps.data === nextProps.data &&
    JSON.stringify(prevProps.selectedParameters) === JSON.stringify(nextProps.selectedParameters) &&
    JSON.stringify(prevProps.selectedSensors) === JSON.stringify(nextProps.selectedSensors) &&
    prevProps.groupBy === nextProps.groupBy &&
    prevProps.mainGroupBy === nextProps.mainGroupBy &&
    prevProps.subGroupBy === nextProps.subGroupBy &&
    JSON.stringify(prevProps.hourRange) === JSON.stringify(nextProps.hourRange) &&
    JSON.stringify(prevProps.sensorLabelMap) === JSON.stringify(nextProps.sensorLabelMap) &&
    JSON.stringify(prevProps.includedLabels) === JSON.stringify(nextProps.includedLabels)
  );
});

// Artifact thresholds per parameter (case-insensitive matching)
const ARTIFACT_THRESHOLDS: Record<string, number> = {
  temperature: -40,
  humidity: -999,
  // Add more as needed
};

// Pulse animation configuration (easily adjustable)
const PULSE_CONFIG = {
  color: '#8AC6BB',                 // Glow and border color (can be changed to any color)
  blinkCount: 3,                    // Number of blinks (2 short pulses = 3 total blinks)
  blinkDuration: 1000,              // Duration of each blink in milliseconds
  spread: 12,                       // Glow spread size in pixels (larger = more visible)
  pulsing: 1.0,                     // Pulse intensity/opacity (0.0 to 1.0, higher = more intense)
  scale: 1.1,                       // Scale multiplier during pulse (1.0 = no scale, 1.1 = 10% larger)
  borderWidth: 2,                   // Border width in pixels during pulse
  // Total animation duration = blinkCount * blinkDuration
};

const toOutlierVizType = (viz: string): 'scatter' | 'box' | 'histogram' =>
  viz === 'box' ? 'box' : viz === 'histogram' ? 'histogram' : 'scatter';

const DEFAULT_OUTLIER_HINT_IQR_THRESHOLD = 2.5;

const formatDateChipLabel = (value: string): string => {
  if (!value) return value;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const areStringArraysEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
};

/**
 * VisualizationPanel
 * Allows user to select visualization type, dates, and parameters.
 * Renders the appropriate plot component based on selection.
 * @param data - array of sensor data objects
 * @param selectedParameters - parameters to visualize
 * @param selectedSensors - sensors to visualize
 * @param experimentName - (optional) experiment name for plot titles
 * @param getSensorColor - (optional) function to get color for a sensor
 * @param outlierConfig - outlier filtering configuration
 * @returns JSX.Element
 */
const VisualizationPanel: React.FC<VisualizationPanelProps> = (props) => {
  // Tab state
  const [activeTab, setActiveTab] = useState<'visualization' | 'analytics'>('visualization');
  
  // Analytics tab state
  const [selectedAnalyticsParameter, setSelectedAnalyticsParameter] = useState<string>('');
  const [selectedTestType, setSelectedTestType] = useState<string>('anova_tukey');
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  
  // Analytics tab independent state (separate from visualization tab)
  const [analyticsZoomLevel, setAnalyticsZoomLevel] = useState<number>(1);
  
  // Existing visualization state
  const [selectedViz, setSelectedViz] = useState('scatter');
  const [selectedCorrelationPair, setSelectedCorrelationPair] = useState<{param1: string; param2: string} | null>(null);
  const [numCorrelationPairs, setNumCorrelationPairs] = useState(2);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  const [showCorrelationInfo, setShowCorrelationInfo] = useState(false);
  const [correlationApproved, setCorrelationApproved] = useState(false);
  const [plotWidth, setPlotWidth] = useState(1800);   // default width
  const [plotHeight, setPlotHeight] = useState(1000); // default height
  const [showDates, setShowDates] = useState(false); // Add state for dates toggle
  const [isLoading, setIsLoading] = useState(true); // Add loading state
  // Hour range filter state (only for BoxPlot) - always enabled by default (0-23 = all hours)
  const [hourRangeEnabled, setHourRangeEnabled] = useState(true);
  const [hourRange, setHourRange] = useState<[number, number]>([0, 23]); // Current slider value (for display only)
  const [appliedHourRange, setAppliedHourRange] = useState<[number, number] | null>(null); // Applied filter value (null = not applied yet)
  const [hasAppliedHourFilter, setHasAppliedHourFilter] = useState(false); // Track if Apply has been clicked at least once
  const [isApplyingHourFilter, setIsApplyingHourFilter] = useState(false); // Loading state for applying filter
  const hourRangeRef = useRef<[number, number]>([0, 23]); // Ref to avoid re-renders during slider movement
  /** Draft strings for hour number inputs; null = show committed `hourRange` (avoids coercing on each keystroke). */
  const [hourDraftStart, setHourDraftStart] = useState<string | null>(null);
  const [hourDraftEnd, setHourDraftEnd] = useState<string | null>(null);

  const clearHourDrafts = () => {
    setHourDraftStart(null);
    setHourDraftEnd(null);
  };

  const commitHourStartFromDraft = () => {
    if (hourDraftStart === null) return;
    const trimmed = hourDraftStart.trim();
    if (trimmed === '') {
      setHourDraftStart(null);
      return;
    }
    let n = parseInt(trimmed, 10);
    if (Number.isNaN(n)) {
      setHourDraftStart(null);
      return;
    }
    n = Math.max(0, Math.min(23, n));
    n = Math.min(n, hourRangeRef.current[1]);
    hourRangeRef.current = [n, hourRangeRef.current[1]];
    setHourRange([...hourRangeRef.current]);
    setHourDraftStart(null);
  };

  const commitHourEndFromDraft = () => {
    if (hourDraftEnd === null) return;
    const trimmed = hourDraftEnd.trim();
    if (trimmed === '') {
      setHourDraftEnd(null);
      return;
    }
    let n = parseInt(trimmed, 10);
    if (Number.isNaN(n)) {
      setHourDraftEnd(null);
      return;
    }
    n = Math.max(0, Math.min(23, n));
    n = Math.max(n, hourRangeRef.current[0]);
    hourRangeRef.current = [hourRangeRef.current[0], n];
    setHourRange([...hourRangeRef.current]);
    setHourDraftEnd(null);
  };

  /** Apply / slider: merge both drafts then single commit (order-independent, fixes crossing). */
  const flushHourDraftsToRef = () => {
    let s = hourRangeRef.current[0];
    let e = hourRangeRef.current[1];
    if (hourDraftStart !== null && hourDraftStart.trim() !== '') {
      const p = parseInt(hourDraftStart.trim(), 10);
      if (!Number.isNaN(p)) s = p;
    }
    if (hourDraftEnd !== null && hourDraftEnd.trim() !== '') {
      const p = parseInt(hourDraftEnd.trim(), 10);
      if (!Number.isNaN(p)) e = p;
    }
    s = Math.max(0, Math.min(23, s));
    e = Math.max(0, Math.min(23, e));
    if (s > e) [s, e] = [e, s];
    hourRangeRef.current = [s, e];
    setHourRange([s, e]);
    clearHourDrafts();
  };

  // Hierarchical grouping state (only for BoxPlot)
  const [boxPlotGroupingMode, setBoxPlotGroupingMode] = useState<'date-label' | 'label' | 'sensor'>('date-label');

  // Extract unique dates from data
  const allDates = useMemo(
    () =>
      Array.from(
        new Set(props.data.map((d) => (typeof d.timestamp === 'string' ? d.timestamp.split('T')[0] : '')))
      ).filter(Boolean),
    [props.data]
  );
  const [selectedDates, setSelectedDates] = useState<string[]>(allDates);
  const [allDatesSelected, setAllDatesSelected] = useState(true);

  // Extract unique parameters from data
  const allParameters = Array.from(new Set(props.data.map(d => d.parameter).filter(Boolean))).map(String);
  const [selectedParameters, setSelectedParameters] = useState<string[]>(allParameters);
  const currentOutlierVizType = toOutlierVizType(selectedViz);

  // Check if artifact filtering is relevant for selected parameters
  const isArtifactFilteringRelevant = useMemo(() => {
    return selectedParameters.some(param => {
      const paramLower = param.toLowerCase();
      return ARTIFACT_THRESHOLDS.hasOwnProperty(paramLower);
    });
  }, [selectedParameters]);

  // State for artifact detection and blinking
  const [showBlinkAnimation, setShowBlinkAnimation] = useState<boolean>(false);
  const [outlierHintPulseToken, setOutlierHintPulseToken] = useState(0);
  const hintedOutlierSignaturesRef = useRef<Set<string>>(new Set());

  // Helper: Check if artifacts exist in the actual data
  function hasArtifactsInData(data: SensorData[]): boolean {
    return data.some(d => {
      const param = d.parameter.toLowerCase();
      const threshold = ARTIFACT_THRESHOLDS[param];
      return threshold !== undefined && 
             typeof d.value === 'number' && 
             d.value === threshold;
    });
  }

  useEffect(() => {
    if (selectedViz === 'correlation') {
      setShowCorrelationInfo(true);
      setCorrelationApproved(false);
    } else {
      setCorrelationApproved(false);
    }
  }, [selectedViz]);

  useEffect(() => {
    const compatibleMethod = getCompatibleOutlierMethod(currentOutlierVizType, props.outlierConfig.method);
    if (compatibleMethod !== props.outlierConfig.method) {
      props.setOutlierConfig((prev) => ({ ...prev, method: compatibleMethod }));
    }
  }, [currentOutlierVizType, props.outlierConfig.method, props.setOutlierConfig]);

  // Reset hour filter when leaving box/histogram or disabling the toggle (shared state for both)
  useEffect(() => {
    if (!['box', 'histogram'].includes(selectedViz) || !hourRangeEnabled) {
      setHasAppliedHourFilter(false);
      setAppliedHourRange(null);
      setIsApplyingHourFilter(false);
    }
  }, [selectedViz, hourRangeEnabled]);

  // Add effect to handle loading state
  useEffect(() => {
    setIsLoading(true);
    // Simulate loading time for data processing
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [props.data, selectedParameters, selectedViz, props.groupBy]);

  // Handle date selection
  const handleDateChange = (selected: any) => {
    if (!selected || selected.length === 0) {
      setSelectedDates([]);
      setAllDatesSelected(false);
    } else {
      setSelectedDates(selected.map((opt: any) => opt.value));
      setAllDatesSelected(selected.length === allDates.length);
    }
    // Clear selected correlation pair when dates change
    setSelectedCorrelationPair(null);
  };

  // Keep selected dates valid when fresh data updates available dates.
  useEffect(() => {
    if (allDates.length === 0) {
      setSelectedDates((prev) => (prev.length === 0 ? prev : []));
      setAllDatesSelected(false);
      return;
    }

    setSelectedDates((prev) => {
      if (allDatesSelected) {
        return areStringArraysEqual(prev, allDates) ? prev : allDates;
      }

      const next = prev.filter((date) => allDates.includes(date));
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [allDates, allDatesSelected]);

  // Filter data by selected dates unless allDatesSelected
  const filteredData = allDatesSelected
    ? props.data
    : props.data.filter(d => selectedDates.includes((d.timestamp as string).split('T')[0]));

  // Effect to detect artifacts after data is fetched
  useEffect(() => {
    // Only check after data is loaded and if relevant
    if (isLoading || !isArtifactFilteringRelevant) {
      setShowBlinkAnimation(false);
      return;
    }
    
    // Only alert if filter is disabled
    if (props.artifactFiltering) {
      setShowBlinkAnimation(false);
      return;
    }
    
    // Check for artifacts in the actual fetched data
    const artifactsFound = hasArtifactsInData(filteredData);
    
    if (artifactsFound) {
      setShowBlinkAnimation(true);
      // Auto-stop blinking after animation completes (blinkCount * blinkDuration)
      const totalDuration = PULSE_CONFIG.blinkCount * PULSE_CONFIG.blinkDuration;
      const timeout = setTimeout(() => {
        setShowBlinkAnimation(false);
      }, totalDuration);
      return () => clearTimeout(timeout);
    } else {
      setShowBlinkAnimation(false);
    }
  }, [filteredData, isLoading, isArtifactFilteringRelevant, props.artifactFiltering, selectedParameters]);

  // Type guard to check if data is suitable for BoxPlot
  const isBoxPlotData = Array.isArray(props.data) && props.data.length > 0 &&
    typeof props.data[0].sensor === 'string' &&
    typeof props.data[0].parameter === 'string' &&
    typeof props.data[0].value !== 'undefined';

  // Helper: Filter artifact measurements (e.g., -40°C for temperature)
  function filterArtifacts(data: SensorData[]): SensorData[] {
    return data.map(d => {
      const param = d.parameter.toLowerCase();
      const threshold = ARTIFACT_THRESHOLDS[param];
      
      if (threshold !== undefined && typeof d.value === 'number' && d.value === threshold) {
        return { ...d, value: NaN };
      }
      return d;
    });
  }

  // Helper: Filter data by hour range
  // Each hour includes the full hour: e.g., hour 23 includes 23:00:00 to 23:59:59.999
  // Range 0-23 includes all hours (00:00:00 to 23:59:59.999)
  function filterByHourRange(data: SensorData[], hourRange: [number, number]): SensorData[] {
    return data.filter(d => {
      const timestamp = typeof d.timestamp === 'string' ? d.timestamp : '';
      if (!timestamp) return false;
      
      try {
        const date = new Date(timestamp);
        const hour = date.getUTCHours(); // Use UTC hours for consistency
        
        // Handle range that crosses midnight (e.g., 22-2 means 22:00 to 02:59 next day)
        if (hourRange[0] <= hourRange[1]) {
          // Normal range (e.g., 11-13 includes 11:00:00 to 13:59:59.999)
          return hour >= hourRange[0] && hour <= hourRange[1];
        } else {
          // Wraps around midnight (e.g., 22-2 includes 22:00:00 to 23:59:59.999 and 00:00:00 to 02:59:59.999)
          return hour >= hourRange[0] || hour <= hourRange[1];
        }
      } catch (e) {
        return false;
      }
    });
  }

  // Preprocess data before outlier filtering (artifact -> hour)
  const baseProcessedData = React.useMemo(() => {
    let data = filteredData;
    
    // Apply artifact filtering first (if enabled and relevant)
    if (props.artifactFiltering && isArtifactFilteringRelevant) {
      data = filterArtifacts([...data]); // Create copy to avoid mutation
    }
    
    // Apply hour range filtering for BoxPlot and Histogram (same rules; only after Apply sets appliedHourRange)
    if (
      (selectedViz === 'box' || selectedViz === 'histogram') &&
      hourRangeEnabled &&
      appliedHourRange !== null
    ) {
      if (appliedHourRange[0] !== 0 || appliedHourRange[1] !== 23) {
        data = filterByHourRange(data, appliedHourRange);
      }
    }
    
    return data;
  }, [
    filteredData,
    props.artifactFiltering,
    isArtifactFilteringRelevant,
    selectedViz,
    hourRangeEnabled,
    appliedHourRange,
  ]);

  // Preprocess data for visualization (artifact -> hour -> outlier)
  const processedData = React.useMemo(() => {
    if (!props.outlierConfig.enabled) return baseProcessedData;

    const compatibleMethod = getCompatibleOutlierMethod(
      currentOutlierVizType,
      props.outlierConfig.method
    );

    const dataCopy = baseProcessedData.map((d) => ({
      ...d,
      value: typeof d.value === 'number' ? d.value : Number.NaN,
    }));

    return applyOutlierFiltering(dataCopy, {
      enabled: true,
      method: compatibleMethod,
      threshold: props.outlierConfig.threshold,
    });
  }, [
    baseProcessedData,
    props.outlierConfig,
    currentOutlierVizType,
  ]);

  const outlierHintDetection = useMemo(() => {
    if (baseProcessedData.length === 0) {
      return { hasDefaultRuleOutliers: false, datasetSignature: 'empty' };
    }

    const preparedForHint = baseProcessedData.map((row) => {
      const numericValue = typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : null;
      return {
        ...row,
        value: numericValue ?? Number.NaN,
        __rawNumericValue: numericValue,
      };
    });

    const filteredForHint = applyOutlierFiltering(preparedForHint, {
      enabled: true,
      method: 'IQR',
      threshold: DEFAULT_OUTLIER_HINT_IQR_THRESHOLD,
    });

    const hasDefaultRuleOutliers = filteredForHint.some((row) => {
      const raw = row.__rawNumericValue;
      return typeof raw === 'number' && Number.isFinite(raw) && Number.isNaN(row.value);
    });

    let finiteCount = 0;
    let finiteSum = 0;
    let finiteMin = Number.POSITIVE_INFINITY;
    let finiteMax = Number.NEGATIVE_INFINITY;
    for (const row of baseProcessedData) {
      if (typeof row.value !== 'number' || !Number.isFinite(row.value)) continue;
      finiteCount += 1;
      finiteSum += row.value;
      if (row.value < finiteMin) finiteMin = row.value;
      if (row.value > finiteMax) finiteMax = row.value;
    }

    const firstRow = baseProcessedData[0];
    const lastRow = baseProcessedData[baseProcessedData.length - 1];
    const dataFingerprint = [
      baseProcessedData.length,
      finiteCount,
      finiteSum.toFixed(6),
      Number.isFinite(finiteMin) ? finiteMin.toFixed(6) : 'na',
      Number.isFinite(finiteMax) ? finiteMax.toFixed(6) : 'na',
      String(firstRow?.timestamp ?? ''),
      String(lastRow?.timestamp ?? ''),
      String(firstRow?.parameter ?? ''),
      String(lastRow?.parameter ?? ''),
    ].join('|');

    const datasetSignature = [
      selectedViz,
      props.groupBy,
      boxPlotGroupingMode,
      hourRangeEnabled ? `${appliedHourRange?.[0] ?? 'na'}-${appliedHourRange?.[1] ?? 'na'}` : 'hour-off',
      props.artifactFiltering ? 'artifact-on' : 'artifact-off',
      allDatesSelected ? `all:${allDates.length}` : selectedDates.join(','),
      selectedParameters.join(','),
      dataFingerprint,
    ].join('::');

    return { hasDefaultRuleOutliers, datasetSignature };
  }, [
    baseProcessedData,
    selectedViz,
    props.groupBy,
    boxPlotGroupingMode,
    hourRangeEnabled,
    appliedHourRange,
    props.artifactFiltering,
    allDatesSelected,
    allDates,
    selectedDates,
    selectedParameters,
  ]);

  useEffect(() => {
    if (props.outlierConfig.enabled) return;
    if (!outlierHintDetection.hasDefaultRuleOutliers) return;

    const signature = outlierHintDetection.datasetSignature;
    if (hintedOutlierSignaturesRef.current.has(signature)) return;

    hintedOutlierSignaturesRef.current.add(signature);
    setOutlierHintPulseToken((prev) => prev + 1);
  }, [props.outlierConfig.enabled, outlierHintDetection]);

  // Hide loading state when processedData is ready (after filtering completes)
  useEffect(() => {
    if (isApplyingHourFilter && hasAppliedHourFilter && appliedHourRange !== null) {
      // Data processing is complete, hide loading after a brief delay to ensure rendering
      const timer = setTimeout(() => {
        setIsApplyingHourFilter(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [processedData, isApplyingHourFilter, hasAppliedHourFilter, appliedHourRange]);

  // Compute correlation matrix
  const correlationData = useMemo(() => {
    if (allParameters.length < 2) {
      return null;
    }

    // Prepare data for correlation computation
    const paramData: { [key: string]: number[] } = {};
    allParameters.forEach(param => {
      paramData[param] = processedData
        .filter(d => d.parameter === param)
        .map(d => Number(d.value))
        .filter(v => !isNaN(v));
    });

    // Compute correlation matrix
    const matrix: number[][] = [];
    const correlations: Array<{param1: string; param2: string; correlation: number}> = [];

    allParameters.forEach((param1, i) => {
      const row: number[] = [];
      allParameters.forEach((param2, j) => {
        const correlation = computePearsonCorrelation(paramData[param1], paramData[param2]);
        row.push(correlation);
        if (i < j) { // Only store upper triangle to avoid duplicates
          correlations.push({ param1, param2, correlation });
        }
      });
      matrix.push(row);
    });

    // Sort correlations by absolute value
    correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    return {
      matrix,
      parameters: allParameters,
      topCorrelations: correlations.slice(0, numCorrelationPairs),
      bottomCorrelations: correlations.slice(-numCorrelationPairs)
    };
  }, [processedData, allParameters, numCorrelationPairs]);

  function computePearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);
    const sumY2 = y.reduce((a, b) => a + b * b, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  // Generate mock ANOVA results
  const generateMockAnalysisResults = (parameter: string) => {
    // Determine data interval and time range from actual data
    const timestamps = props.data.map(d => d.timestamp).sort();
    const firstDate = new Date(timestamps[0]);
    const lastDate = new Date(timestamps[timestamps.length - 1]);
    const timeDiff = lastDate.getTime() - firstDate.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    // Determine if it's daily or 3-minute data
    const isDailyData = daysDiff <= 7 || timestamps.length < 1000;
    const interval = isDailyData ? 'daily' : '3-minute';
    
    // Generate appropriate number of timestamps
    const numTimestamps = isDailyData ? Math.min(daysDiff, 30) : Math.min(daysDiff * 480, 100); // 480 = 3-min intervals per day
    
    const results: any[] = [];
    const groups = ['Control', 'TreatmentA', 'TreatmentB'];
    
    for (let i = 0; i < numTimestamps; i++) {
      const timestamp = isDailyData 
        ? new Date(firstDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : new Date(firstDate.getTime() + i * 3 * 60 * 1000).toISOString();
      
      // Generate realistic group statistics
      const groupStats = {
        'Control': {
          mean: 20 + Math.random() * 5,
          standard_error: 0.5 + Math.random() * 1,
          n: 8 + Math.floor(Math.random() * 4)
        },
        'TreatmentA': {
          mean: 22 + Math.random() * 6,
          standard_error: 0.6 + Math.random() * 1.2,
          n: 8 + Math.floor(Math.random() * 4)
        },
        'TreatmentB': {
          mean: 24 + Math.random() * 4,
          standard_error: 0.4 + Math.random() * 0.8,
          n: 8 + Math.floor(Math.random() * 4)
        }
      };
      
      // Generate significant differences
      const significantDifferences = [
        {
          comparison: 'Control vs TreatmentA',
          p_value: 0.001 + Math.random() * 0.05,
          reject_null: true
        },
        {
          comparison: 'Control vs TreatmentB',
          p_value: 0.0001 + Math.random() * 0.01,
          reject_null: true
        },
        {
          comparison: 'TreatmentA vs TreatmentB',
          p_value: 0.01 + Math.random() * 0.1,
          reject_null: Math.random() > 0.3
        }
      ];
      
      // Generate letters report
      const lettersReport = {
        'Control': 'A',
        'TreatmentA': 'B',
        'TreatmentB': 'C'
      };
      
      results.push({
        timestamp,
        groups_tested: groups,
        group_stats: groupStats,
        significant_differences: significantDifferences,
        letters_report: lettersReport
      });
    }
    
    return {
      parameter,
      test_type: 'tukey',
      batch_size: results.length,
      user: 'user@example.com',
      results,
      metadata: {
        interval,
        total_days: daysDiff,
        total_timestamps: numTimestamps,
        groups_count: groups.length
      }
    };
  };

  return (
    <div className="w-full space-y-4">
      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('visualization')}
          className={`flex items-center space-x-2 px-6 py-3 text-base font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#8ac6bb] focus:ring-offset-2 ${
            activeTab === 'visualization' 
              ? 'bg-white text-[#8ac6bb] shadow-md transform scale-105' 
              : 'text-gray-600 hover:text-[#8ac6bb] hover:bg-gray-50'
          }`}
        >
          <span className="text-lg">📊</span>
          <span>Data Visualization</span>
        </button>
        {/* <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center space-x-2 px-6 py-3 text-base font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#8ac6bb] focus:ring-offset-2 ${
            activeTab === 'analytics' 
              ? 'bg-white text-[#8ac6bb] shadow-md transform scale-105' 
              : 'text-gray-600 hover:text-[#8ac6bb] hover:bg-gray-50'
          }`}
        >
          <span className="text-lg">🔬</span>
          <span>Advanced Analytics</span>
        </button> */}
      </div>

      {/* Visualization Type Selection */}
      {activeTab === 'visualization' && (
        <div className="mb-3 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                1) Chart
              </label>
              <select
                className="w-full rounded-md border border-[#b2b27a] bg-white px-3 py-2 text-sm font-medium text-[#3f8378] focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
                value={selectedViz}
                onChange={e => setSelectedViz(e.target.value)}
              >
                {VISUALIZATIONS.map(viz => (
                  <option key={viz.value} value={viz.value}>{viz.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                2) Parameters
              </label>
              <Select
                isMulti
                options={[...allParameters.map((param) => ({ value: param, label: param }))]}
                value={selectedParameters.map((param) => ({ value: param, label: param }))}
                onChange={(selected) => {
                  if (!selected) {
                    setSelectedParameters([]);
                    return;
                  }
                  setSelectedParameters(selected.map((opt: any) => opt.value));
                }}
                classNamePrefix="select"
                placeholder="Select parameters..."
                closeMenuOnSelect={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Date Selection */}
      {activeTab === 'visualization' && (
        <div className="mb-3 rounded-xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowDates(!showDates)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 text-left hover:bg-[#f7faf9] transition-colors rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-inset"
            title="Toggle date selection panel"
          >
            <div className="flex items-center gap-2 text-sm sm:text-[15px] font-semibold text-gray-700">
              <span>3) Date Selection</span>
              <svg
                className={`w-4 h-4 transform transition-transform duration-200 ${showDates ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <span className="text-xs sm:text-sm font-semibold text-[#5ea99c] whitespace-nowrap">
              {allDatesSelected ? 'All selected' : `${selectedDates.length} selected`}
            </span>
          </button>

          <div
            className={`grid transition-all duration-200 ease-out ${
              showDates ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
            aria-hidden={!showDates}
          >
            <div className="overflow-hidden">
              <div
                className={`px-4 sm:px-5 pb-4 pt-3 border-t border-gray-100 space-y-3 ${
                  showDates ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="min-h-[36px] px-3.5 py-1.5 text-sm font-semibold rounded-md border border-[#8ac6bb] text-[#4d978a] hover:bg-[#e6f0ee] active:bg-[#dcebe7] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    setSelectedDates(allDates);
                    setAllDatesSelected(true);
                  }}
                  disabled={allDatesSelected || allDates.length === 0}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="min-h-[36px] px-3.5 py-1.5 text-sm font-semibold rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b27a] focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    setSelectedDates([]);
                    setAllDatesSelected(false);
                  }}
                  disabled={selectedDates.length === 0}
                >
                  Clear
                </button>
              </div>

              <Select
                isMulti
                options={[
                  ...allDates.map(date => ({ value: date, label: formatDateChipLabel(date) }))
                ]}
                value={
                  selectedDates.map(date => ({ value: date, label: formatDateChipLabel(date) }))
                }
                onChange={handleDateChange}
                classNamePrefix="select"
                placeholder="Select dates..."
                closeMenuOnSelect={false}
                styles={{
                  valueContainer: (base) => ({
                    ...base,
                    flexWrap: 'wrap',
                    gap: '0.25rem',
                    paddingTop: '6px',
                    paddingBottom: '6px',
                    maxHeight: '104px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                  }),
                  multiValue: (base) => ({
                    ...base,
                    backgroundColor: '#e6f0ee',
                    borderRadius: '999px',
                    paddingLeft: '4px',
                    maxWidth: '100%',
                  }),
                  multiValueLabel: (base) => ({
                    ...base,
                    color: '#40655f',
                    fontWeight: 600,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }),
                  multiValueRemove: (base) => ({
                    ...base,
                    borderRadius: '999px',
                    ':hover': {
                      backgroundColor: '#d1e3e0',
                      color: '#2f4d48',
                    },
                  }),
                  control: (base, state) => ({
                    ...base,
                    borderRadius: '0.5rem',
                    borderColor: state.isFocused ? '#8ac6bb' : '#d1d5db',
                    boxShadow: state.isFocused ? '0 0 0 1px #8ac6bb' : 'none',
                    '&:hover': {
                      borderColor: '#8ac6bb',
                    },
                    minHeight: '44px',
                  }),
                  placeholder: (base) => ({
                    ...base,
                    color: '#6b7280',
                  }),
                  menu: (base) => ({
                    ...base,
                    zIndex: 30,
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                  }),
                }}
              />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'visualization' && (
        <div className="mb-3 rounded-xl border border-gray-200 bg-white shadow-sm p-3.5">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">4) Data Cleaning (Optional)</div>
          <div className="rounded-lg bg-gray-50/80 p-3 ring-1 ring-gray-200">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
              <div className="min-w-0 flex-1">
                <OutlierToggle
                  enabled={props.outlierConfig.enabled}
                  onChange={(enabled) =>
                    props.setOutlierConfig((prev) => ({
                      ...prev,
                      enabled,
                    }))
                  }
                  method={props.outlierConfig.method}
                  threshold={props.outlierConfig.threshold}
                  onMethodChange={(method) =>
                    props.setOutlierConfig((prev) => ({
                      ...prev,
                      method: method as OutlierMethod,
                    }))
                  }
                  onThresholdChange={(threshold) =>
                    props.setOutlierConfig((prev) => ({
                      ...prev,
                      threshold,
                    }))
                  }
                  visualizationType={currentOutlierVizType === 'box' ? 'boxplot' : currentOutlierVizType}
                  showPulseHint={!props.outlierConfig.enabled && outlierHintDetection.hasDefaultRuleOutliers}
                  pulseHintToken={outlierHintPulseToken}
                />
              </div>

              {isArtifactFilteringRelevant && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
                  <span className="text-sm font-medium text-gray-700">Artifact filter</span>
                  <ArtifactFilterToggle
                    enabled={props.artifactFiltering}
                    onChange={props.setArtifactFiltering}
                    visualizationType={currentOutlierVizType === 'box' ? 'boxplot' : currentOutlierVizType}
                    shouldBlink={showBlinkAnimation}
                    pulseConfig={PULSE_CONFIG}
                    onStopBlink={() => setShowBlinkAnimation(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hour Range Filter - BoxPlot and Histogram (shared state, same Apply flow) */}
      {activeTab === 'visualization' && ['box', 'histogram'].includes(selectedViz) && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={hourRangeEnabled}
                onChange={(e) => setHourRangeEnabled(e.target.checked)}
                className="w-4 h-4 text-[#8ac6bb] border-gray-300 rounded focus:ring-[#8ac6bb]"
              />
              <span className="text-sm font-medium text-gray-700">Filter by Hour Range</span>
            </label>
          </div>
          {hourRangeEnabled && (
            <div className="space-y-3">
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700 min-w-[100px]">
                  Hour Range: {hourRange[0]}:00 - {hourRange[1]}:00
                </label>
                <div className="flex-1 relative" style={{ height: '60px', paddingTop: '20px' }}>
                  {/* Track background */}
                  <div 
                    className="absolute top-1/2 left-0 right-0 h-3 bg-gray-200 rounded-lg -translate-y-1/2"
                    style={{ zIndex: 0 }}
                  />
                  {/* Active range track */}
                  <div 
                    className="absolute top-1/2 h-3 bg-[#8ac6bb] rounded-lg -translate-y-1/2"
                    style={{
                      left: `${(hourRange[0] / 23) * 100}%`,
                      width: `${((hourRange[1] - hourRange[0]) / 23) * 100}%`,
                      zIndex: 1
                    }}
                  />
                  {/* Dual Range Slider - Start */}
                  <input
                    type="range"
                    min="0"
                    max="23"
                    value={hourRange[0]}
                    onChange={(e) => {
                      const newStart = parseInt(e.target.value);
                      // Prevent crossing: start cannot exceed end
                      const clampedStart = Math.min(newStart, hourRangeRef.current[1]);
                      hourRangeRef.current = [clampedStart, hourRangeRef.current[1]];
                      // Only update state for display, use requestAnimationFrame to batch updates
                      requestAnimationFrame(() => {
                        setHourRange([...hourRangeRef.current]);
                        clearHourDrafts();
                      });
                    }}
                    className="absolute w-full range-start"
                    style={{
                      height: '30px',
                      margin: 0,
                      padding: 0,
                      background: 'transparent',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      cursor: 'pointer',
                      zIndex: 2,
                    }}
                  />
                  {/* Dual Range Slider - End */}
                  <input
                    type="range"
                    min="0"
                    max="23"
                    value={hourRange[1]}
                    onChange={(e) => {
                      const newEnd = parseInt(e.target.value);
                      // Prevent crossing: end cannot go below start
                      const clampedEnd = Math.max(newEnd, hourRangeRef.current[0]);
                      hourRangeRef.current = [hourRangeRef.current[0], clampedEnd];
                      // Only update state for display, use requestAnimationFrame to batch updates
                      requestAnimationFrame(() => {
                        setHourRange([...hourRangeRef.current]);
                        clearHourDrafts();
                      });
                    }}
                    className="absolute w-full range-end"
                    style={{
                      height: '30px',
                      margin: 0,
                      padding: 0,
                      background: 'transparent',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      cursor: 'pointer',
                      zIndex: 3,
                    }}
                  />
                  <style>{`
                    /* Start handle - Larger size with smooth transitions */
                    .range-start::-webkit-slider-thumb {
                      -webkit-appearance: none;
                      appearance: none;
                      width: 36px;
                      height: 36px;
                      border-radius: 50%;
                      background: linear-gradient(135deg, #8ac6bb 0%, #7ab6ab 100%);
                      cursor: grab;
                      border: 3px solid white;
                      box-shadow: 0 3px 8px rgba(0,0,0,0.3), inset 0 0 0 2px #8ac6bb;
                      position: relative;
                      transition: all 0.2s ease-in-out;
                    }
                    .range-start::-webkit-slider-thumb:active {
                      cursor: grabbing;
                      transform: scale(1.1);
                    }
                    .range-start::-webkit-slider-thumb:hover {
                      transform: scale(1.3);
                      box-shadow: 0 6px 20px rgba(138, 198, 187, 0.8), 0 0 15px rgba(138, 198, 187, 0.6);
                      border-color: #8ac6bb;
                    }
                    .range-start::-moz-range-thumb {
                      width: 36px;
                      height: 36px;
                      border-radius: 50%;
                      background: linear-gradient(135deg, #8ac6bb 0%, #7ab6ab 100%);
                      cursor: grab;
                      border: 3px solid white;
                      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
                      transition: all 0.2s ease-in-out;
                    }
                    .range-start::-moz-range-thumb:active {
                      cursor: grabbing;
                      transform: scale(1.1);
                    }
                    .range-start::-moz-range-thumb:hover {
                      transform: scale(1.3);
                      box-shadow: 0 6px 20px rgba(138, 198, 187, 0.8), 0 0 15px rgba(138, 198, 187, 0.6);
                      border-color: #8ac6bb;
                    }
                    
                    /* End handle - Larger size with smooth transitions */
                    .range-end::-webkit-slider-thumb {
                      -webkit-appearance: none;
                      appearance: none;
                      width: 36px;
                      height: 36px;
                      border-radius: 50%;
                      background: linear-gradient(135deg, #b2b27a 0%, #a2a26a 100%);
                      cursor: grab;
                      border: 3px solid white;
                      box-shadow: 0 3px 8px rgba(0,0,0,0.3), inset 0 0 0 2px #b2b27a;
                      position: relative;
                      transition: all 0.2s ease-in-out;
                    }
                    .range-end::-webkit-slider-thumb:active {
                      cursor: grabbing;
                      transform: scale(1.1);
                    }
                    .range-end::-webkit-slider-thumb:hover {
                      transform: scale(1.3);
                      box-shadow: 0 6px 20px rgba(178, 178, 122, 0.8), 0 0 15px rgba(178, 178, 122, 0.6);
                      border-color: #b2b27a;
                    }
                    .range-end::-moz-range-thumb {
                      width: 36px;
                      height: 36px;
                      border-radius: 50%;
                      background: linear-gradient(135deg, #b2b27a 0%, #a2a26a 100%);
                      cursor: grab;
                      border: 3px solid white;
                      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
                      transition: all 0.2s ease-in-out;
                    }
                    .range-end::-moz-range-thumb:active {
                      cursor: grabbing;
                      transform: scale(1.1);
                    }
                    .range-end::-moz-range-thumb:hover {
                      transform: scale(1.3);
                      box-shadow: 0 6px 20px rgba(178, 178, 122, 0.8), 0 0 15px rgba(178, 178, 122, 0.6);
                      border-color: #b2b27a;
                    }
                    
                    /* Track styling */
                    input[type="range"]::-webkit-slider-runnable-track {
                      height: 3px;
                      background: transparent;
                    }
                    input[type="range"]::-moz-range-track {
                      height: 3px;
                      background: transparent;
                      border: none;
                    }
                  `}</style>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Hour range start"
                    value={hourDraftStart !== null ? hourDraftStart : String(hourRange[0])}
                    onChange={(e) => setHourDraftStart(e.target.value)}
                    onBlur={commitHourStartFromDraft}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitHourStartFromDraft();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-base focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
                    style={{ fontSize: '16px' }}
                  />
                  <span className="text-sm text-gray-500">to</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Hour range end"
                    value={hourDraftEnd !== null ? hourDraftEnd : String(hourRange[1])}
                    onChange={(e) => setHourDraftEnd(e.target.value)}
                    onBlur={commitHourEndFromDraft}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitHourEndFromDraft();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-base focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
                    style={{ fontSize: '16px' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      flushHourDraftsToRef();
                      setIsApplyingHourFilter(true);
                      setAppliedHourRange([...hourRangeRef.current]);
                      setHourRange([...hourRangeRef.current]);
                      setHasAppliedHourFilter(true);
                    }}
                    className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${
                      appliedHourRange !== null && hourRange[0] === appliedHourRange[0] && hourRange[1] === appliedHourRange[1]
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-[#8ac6bb] text-white hover:bg-[#7ab6ab] focus:ring-2 focus:ring-[#8ac6bb] focus:ring-offset-2'
                    }`}
                    disabled={appliedHourRange !== null && hourRange[0] === appliedHourRange[0] && hourRange[1] === appliedHourRange[1]}
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                {appliedHourRange === null ? (
                  <span className="text-[#8ac6bb] font-medium">Click "Apply" to filter and visualize data</span>
                ) : (
                  <>
                    {appliedHourRange[0] === 0 && appliedHourRange[1] === 23 ? (
                      <span>Showing all hours (0:00 - 23:00)</span>
                    ) : (
                      <span>Showing data from {appliedHourRange[0]}:00 to {appliedHourRange[1]}:00</span>
                    )}
                    {hourRange[0] !== appliedHourRange[0] || hourRange[1] !== appliedHourRange[1] ? (
                      <span className="ml-2 text-[#8ac6bb] font-medium">(Pending: {hourRange[0]}:00 - {hourRange[1]}:00)</span>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Group by and Error Type Controls */}
      {activeTab === 'visualization' && (
        <div className="mb-4">
          {(selectedViz === 'scatter' || selectedViz === 'histogram') && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">5) Grouping</span>
              <div className="inline-flex rounded-lg bg-gray-100 p-1 ring-1 ring-gray-200" role="group">
                <button
                  type="button"
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors duration-150 focus:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-offset-1 ${props.groupBy === 'sensor' ? 'bg-[#8ac6bb] text-white shadow-sm' : 'bg-transparent text-gray-700 hover:bg-white'}`}
                  onClick={() => props.setGroupBy && props.setGroupBy('sensor')}
                >
                  Group by Sensor
                </button>
                <button
                  type="button"
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors duration-150 focus:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-offset-1 ${props.groupBy === 'label' ? 'bg-[#8ac6bb] text-white shadow-sm' : 'bg-transparent text-gray-700 hover:bg-white'}`}
                  onClick={() => props.setGroupBy && props.setGroupBy('label')}
                >
                  Group by Label
                </button>
              </div>
              
              {/* Error Type Selection - Only show for scatter plot */}
              {selectedViz === 'scatter' && props.groupBy === 'label' && (
                <div className="flex items-center space-x-2">
                  <div className="relative group">
                    <select
                      value={props.errorType}
                      onChange={(e) => props.setErrorType && props.setErrorType(e.target.value as 'STD' | 'SE')}
                      className="h-9 border border-gray-300 rounded px-3 text-sm focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
                    >
                      <option value="SE">Standard Error (SE)</option>
                      <option value="STD">Standard Deviation (STD)</option>
                    </select>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block">
                      <div className="bg-gray-800 text-white text-xs rounded py-1 px-2 w-64">
                        <p className="font-bold mb-1">STD vs. SE</p>
                        <p>Use STD to show variability within each group.</p>
                        <p>Use SE to show how precisely the group mean represents the data.</p>
                      </div>
                      <div className="w-2 h-2 bg-gray-800 transform rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {selectedViz === 'box' && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">5) Grouping</span>
              <div className="inline-flex rounded-lg bg-gray-100 p-1 ring-1 ring-gray-200" role="group">
                <button
                  type="button"
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors duration-150 focus:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-offset-1 ${
                    boxPlotGroupingMode === 'date-label' 
                      ? 'bg-[#8ac6bb] text-white shadow-sm focus:text-white' 
                      : 'bg-transparent text-gray-700 hover:bg-white focus:text-[#8ac6bb]'
                  }`}
                  onClick={() => setBoxPlotGroupingMode('date-label')}
                >
                  Date → Label
                </button>
                <button
                  type="button"
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors duration-150 focus:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-offset-1 ${
                    boxPlotGroupingMode === 'label' 
                      ? 'bg-[#8ac6bb] text-white shadow-sm focus:text-white' 
                      : 'bg-transparent text-gray-700 hover:bg-white focus:text-[#8ac6bb]'
                  }`}
                  onClick={() => setBoxPlotGroupingMode('label')}
                >
                  Group by Label
                </button>
                <button
                  type="button"
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors duration-150 focus:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-offset-1 ${
                    boxPlotGroupingMode === 'sensor' 
                      ? 'bg-[#8ac6bb] text-white shadow-sm focus:text-white' 
                      : 'bg-transparent text-gray-700 hover:bg-white focus:text-[#8ac6bb]'
                  }`}
                  onClick={() => setBoxPlotGroupingMode('sensor')}
                >
                  Group by Sensor
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Visualization Content */}
      {isLoading ? (
        <div className="h-[calc(70vh-280px)] w-full flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#8ac6bb] border-t-transparent"></div>
            <p className="mt-4 text-gray-600">Loading visualization...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Grouping uses post-cleaning dataset (`processedData`) across chart types. */}
          {activeTab === 'visualization' && selectedViz === 'scatter' && (
            <div className="flex justify-center">
              <ScatterPlot
                data={processedData}
                selectedParameters={selectedParameters}
                selectedSensors={props.selectedSensors}
                experimentName={props.experimentName}
                getSensorColor={props.getSensorColor}
                getSensorDisplayName={props.getSensorDisplayName}
                getParameterUnit={getParameterUnit}
                sensorLabelMap={props.sensorLabelMap}
                groupBy={props.groupBy}
                includedLabels={props.includedLabels}
                errorType={props.errorType}
              />
            </div>
          )}
          {activeTab === 'visualization' && selectedViz === 'box' && isBoxPlotData && (
            <div className="flex justify-center">
              {isApplyingHourFilter ? (
                <div className="h-[calc(70vh-280px)] w-full flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#8ac6bb] border-t-transparent mb-4"></div>
                    <p className="text-lg font-medium text-gray-700 mb-2">Applying Filter</p>
                    <p className="text-sm text-gray-500">Processing data and rendering visualization...</p>
                  </div>
                </div>
              ) : hasAppliedHourFilter && appliedHourRange !== null ? (
                <MemoizedBoxPlot
                  data={processedData}
                  selectedParameters={selectedParameters}
                  selectedSensors={props.selectedSensors}
                  experimentName={props.experimentName}
                  getSensorColor={props.getSensorColor}
                  getSensorDisplayName={props.getSensorDisplayName}
                  getParameterUnit={getParameterUnit}
                  onParameterLimitExceeded={() => {
                    setSelectedParameters(selectedParameters.slice(0, 2));
                  }}
                  combine={false}
                  groupBy={boxPlotGroupingMode === 'date-label' ? 'label' : boxPlotGroupingMode}
                  mainGroupBy={boxPlotGroupingMode === 'date-label' ? 'date' : undefined}
                  subGroupBy={boxPlotGroupingMode === 'date-label' ? 'label' : undefined}
                  hourRange={hourRangeEnabled ? { start: appliedHourRange[0], end: appliedHourRange[1] } : undefined}
                  sensorLabelMap={props.sensorLabelMap}
                  includedLabels={props.includedLabels}
                />
              ) : (
                <div className="h-[calc(70vh-280px)] w-full flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="text-center">
                    <div className="text-4xl mb-4">📊</div>
                    <p className="text-lg font-medium text-gray-700 mb-2">Hour Range Filter Required</p>
                    <p className="text-sm text-gray-500 mb-4">Set your hour range and click "Apply" to visualize the data</p>
                    <div className="text-xs text-gray-400">
                      <p>Default range: 0:00 - 23:00 (all hours)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'visualization' && selectedViz === 'histogram' && (
            <div className="flex justify-center">
              {isApplyingHourFilter ? (
                <div className="h-[calc(70vh-280px)] w-full flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#8ac6bb] border-t-transparent mb-4"></div>
                    <p className="text-lg font-medium text-gray-700 mb-2">Applying Filter</p>
                    <p className="text-sm text-gray-500">Processing data and rendering visualization...</p>
                  </div>
                </div>
              ) : (
                <Histogram
                  data={processedData}
                  selectedParameters={selectedParameters}
                  selectedSensors={props.selectedSensors}
                  experimentName={props.experimentName}
                  getSensorColor={props.getSensorColor}
                  getParameterUnit={getParameterUnit}
                  sensorLabelMap={props.sensorLabelMap}
                  includedLabels={props.includedLabels}
                  groupBy={props.groupBy}
                />
              )}
            </div>
          )}
        </>
      )}

                {/* Advanced Analytics Tab Content */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* Analytics Header */}
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">🔬 Advanced Statistical Analysis</h3>
                <p className="text-gray-600">Perform statistical tests on your data to identify significant differences between groups</p>
              </div>

              {/* Parameter Selection */}
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📈 Select Parameter
                    </label>
                    <div className="min-w-[300px]">
                      <Select
                        options={allParameters.map(param => ({ value: param, label: param }))}
                        value={selectedAnalyticsParameter ? { value: selectedAnalyticsParameter, label: selectedAnalyticsParameter } : null}
                        onChange={(selected) => setSelectedAnalyticsParameter(selected ? selected.value : '')}
                        classNamePrefix="select"
                        placeholder="Choose a parameter to analyze..."
                        isClearable
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
                  </div>

                  {/* Statistical Test Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      🧪 Statistical Test
                    </label>
                    <div className="min-w-[300px]">
                      <Select
                        options={STATISTICAL_TESTS}
                        value={STATISTICAL_TESTS.find(test => test.value === selectedTestType)}
                        onChange={(selected) => setSelectedTestType(selected ? selected.value : 'anova_tukey')}
                        classNamePrefix="select"
                        placeholder="Select a statistical test..."
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
                  </div>



                  {/* Run Analysis Button */}
                  <div className="pt-4">
                    <button
                      onClick={() => {
                        setIsAnalysisLoading(true);
                        console.log('Run Analysis clicked!');
                        console.log('Selected Parameter:', selectedAnalyticsParameter);
                        console.log('Selected Test Type:', selectedTestType);
                        console.log('Selected Labels:', props.includedLabels);
                        
                        // Simulate API call delay
                        setTimeout(() => {
                          const mockResults = generateMockAnalysisResults(selectedAnalyticsParameter);
                          setAnalysisResults(mockResults);
                          setIsAnalysisLoading(false);
                          console.log('Mock Analysis Results:', mockResults);
                        }, 1500);
                      }}
                      disabled={!selectedAnalyticsParameter || props.includedLabels.length === 0 || isAnalysisLoading}
                      className={`w-full py-3 px-6 rounded-lg font-semibold text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#8ac6bb] focus:ring-offset-2 ${
                        selectedAnalyticsParameter && props.includedLabels.length > 0 && !isAnalysisLoading
                          ? 'bg-[#8ac6bb] text-white hover:bg-[#7ab6ab] transform hover:scale-105 shadow-md'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isAnalysisLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Running Analysis...
                        </>
                      ) : (
                        '🚀 Run Analysis'
                      )}
                    </button>
                  </div>

                  {/* Analytics Endpoint Health Check */}
                  <div className="pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">🔍 Analytics Endpoint Status</h4>
                    <HealthCheckButton />
                  </div>
                </div>
              </div>

              {/* ANOVA Results Scatter Plot */}
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <h4 className="text-lg font-medium text-gray-700 mb-4">📈 ANOVA Results Visualization</h4>
                <ANOVAResultsScatterPlot
                  data={props.data}
                  analysisResults={analysisResults}
                  selectedLabels={props.includedLabels}
                  parameter={selectedAnalyticsParameter}
                  experimentName={props.experimentName}
                  getSensorColor={props.getSensorColor}
                  sensorLabelMap={props.sensorLabelMap}
                  includedLabels={props.includedLabels}
                  zoomLevel={analyticsZoomLevel}
                />
              </div>

              {/* Results Display */}
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                {!analysisResults ? (
                  <div className="text-center">
                    <h4 className="text-lg font-medium text-gray-700 mb-2">📊 Analysis Results</h4>
                    <p className="text-gray-500">Results will appear here after running the analysis</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Results Header */}
                    <div className="border-b border-gray-200 pb-4">
                      <h4 className="text-xl font-semibold text-gray-800 mb-2">📊 Analysis Results</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-600">Parameter:</span>
                          <span className="ml-2 text-gray-800">{analysisResults.parameter}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Test Type:</span>
                          <span className="ml-2 text-gray-800">{analysisResults.test_type}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Data Interval:</span>
                          <span className="ml-2 text-gray-800">{analysisResults.metadata.interval}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Timestamps:</span>
                          <span className="ml-2 text-gray-800">{analysisResults.batch_size}</span>
                        </div>
                      </div>
                    </div>

                    {/* Results Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Timestamp
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Group Statistics
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Significant Differences
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Letters Report
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {analysisResults.results.slice(0, 10).map((result: any, index: number) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {result.timestamp}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-500">
                                <div className="space-y-1">
                                  {Object.entries(result.group_stats).map(([group, stats]: [string, any]) => (
                                    <div key={group} className="flex justify-between">
                                      <span className="font-medium">{group}:</span>
                                      <span>
                                        {stats.mean.toFixed(2)} ± {stats.standard_error.toFixed(2)} (n={stats.n})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-500">
                                <div className="space-y-1">
                                  {result.significant_differences.map((diff: any, diffIndex: number) => (
                                    <div key={diffIndex} className={`flex justify-between ${diff.reject_null ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                                      <span>{diff.comparison}:</span>
                                      <span>{diff.reject_null ? `p < ${diff.p_value.toFixed(4)}` : `p = ${diff.p_value.toFixed(4)}`}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-500">
                                <div className="flex space-x-2">
                                  {Object.entries(result.letters_report).map(([group, letter]: [string, any]) => (
                                    <div key={group} className="text-center">
                                      <div className="font-bold text-[#8ac6bb]">{String(letter)}</div>
                                      <div className="text-xs text-gray-400">{group}</div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Info */}
                    {analysisResults.results.length > 10 && (
                      <div className="text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
                        Showing first 10 of {analysisResults.results.length} timestamps
                      </div>
                    )}

                    {/* Export Button */}
                    <div className="flex justify-end pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          console.log('Export results:', analysisResults);
                        }}
                        className="bg-[#b2b27a] text-white px-4 py-2 rounded-md hover:bg-[#a2a26a] transition-colors text-sm font-medium"
                      >
                        📥 Export Results
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
    </div>
  );
};

export default VisualizationPanel; 