/*
 * ScatterPlot.tsx
 * Renders a multi-parameter, multi-sensor time series scatter plot using Plotly.
 */

import React, { useEffect } from 'react';
import Plot from 'react-plotly.js';
import { toast } from 'react-toastify';
import LabelWarningPlaceholder from './LabelWarningPlaceholder';
import {
  getSelectedLabelMemberships,
  normalizeIncludedLabels,
  rowMatchesParameter,
  type RowWithSensorLabel,
} from '../../utils/labelGrouping';
import {
  getParameterDisplayLabel,
  getParameterUnit as getMetadataParameterUnit,
  formatAxisTitle,
} from '../../constants/parameterMetadata';
import {
  prepareSensorTracesIndexed,
  prepareSensorTracesLegacy,
  type ScatterSensorRow,
  type SensorTracePreparationStats,
} from './sensorTracePreparation';

type SensorData = ScatterSensorRow;

interface AxisConfig {
  tickSize?: number;
  textSize?: number;
  distanceFromPlot?: number;
}

export type ScatterRendererMode = 'svg' | 'webgl';
export type ScatterTracePreparationMode = 'legacy' | 'indexed';

export interface ScatterPlotBenchmarkResult {
  rendererMode: ScatterRendererMode;
  tracePreparationMs: number;
  plotlyRenderMs: number;
  totalMs: number;
  traceCount: number;
  renderedPointCount: number;
  tracePreparationMode: ScatterTracePreparationMode;
  preparationStats: SensorTracePreparationStats | null;
}

interface ScatterPlotProps {
  data: SensorData[];
  selectedParameters: string[];
  selectedSensors: string[];
  experimentName?: string;
  getSensorColor?: (sensor: string) => string;
  getSensorDisplayName?: (sensor: string) => string;
  plotWidth?: number;
  plotHeight?: number;
  axisConfig?: {
    left?: AxisConfig;
    right?: AxisConfig;
  };
  onParameterLimitExceeded?: () => void;
  getParameterUnit?: (parameter: string) => string;
  legendSize?: number;
  sensorLabelMap?: Record<string, string[]>;
  groupBy?: 'sensor' | 'label';
  includedLabels?: string[];
  errorType?: 'STD' | 'SE';
  /** Optional override for the plot's outer wrapper className (e.g. to fill a fullscreen container). Defaults to the standard embedded sizing. */
  containerClassName?: string;
  /** Benchmark-only renderer override. Normal application usage remains SVG. */
  rendererMode?: ScatterRendererMode;
  /** Benchmark-only browser timing callback, completed by Plotly's initial onAfterPlot event. */
  onBenchmarkResult?: (result: ScatterPlotBenchmarkResult) => void;
  /** Benchmark-only preparation override. Normal application usage uses the indexed path. */
  tracePreparationMode?: ScatterTracePreparationMode;
  /** Benchmark-only proof that expensive sensor preparation executed. */
  onTracePreparation?: (event: {
    executionCount: number;
    sourceRowCount: number;
    selectedSensors: string[];
    selectedParameters: string[];
    durationMs: number;
  }) => void;
}

const defaultGetSensorColor = (colorKey: string, colorDomain: string[]) => {
  // Extended color palette with 64 distinct colors
  const colors = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',  // Blues, Oranges, Greens, Reds, Purples
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',  // Browns, Pinks, Grays, Yellows, Cyans
    '#1a55FF', '#FF1A1A', '#1AFF1A', '#FF1AFF', '#1AFFFF',  // Bright variants
    '#4B0082', '#FF4500', '#32CD32', '#FF1493', '#00CED1',  // Deep variants
    '#8B4513', '#FFD700', '#4B0082', '#FF69B4', '#20B2AA',  // Earth tones and brights
    '#FF6347', '#7B68EE', '#00FA9A', '#FF00FF', '#00BFFF',  // Mix of brights
    '#FF8C00', '#9932CC', '#8FBC8F', '#FF1493', '#00FFFF',  // More brights
    '#FF4500', '#9370DB', '#3CB371', '#FF69B4', '#1E90FF',  // Mix of medium tones
    '#FF7F50', '#BA55D3', '#2E8B57', '#FF00FF', '#4169E1',  // Mix of medium-bright
    '#FF6347', '#8A2BE2', '#228B22', '#FF1493', '#00BFFF',  // Mix of deep and bright
    '#FF8C00', '#4B0082', '#32CD32', '#FF00FF', '#1E90FF',  // Mix of deep and bright
    '#FF4500', '#9370DB', '#3CB371', '#FF69B4', '#00CED1',  // Mix of medium tones
    '#FF7F50', '#BA55D3', '#2E8B57', '#FF00FF', '#4169E1',  // Mix of medium-bright
  ];
  
  // Get the index of the color key in the current color domain
  const idx = colorDomain.indexOf(colorKey);
  
  // If sensor is not found in selectedSensors, return a default color
  if (idx === -1) return '#1f77b4';
  
  // Calculate the color index, ensuring it stays within bounds
  const colorIndex = idx % colors.length;
  
  // Return the color at the calculated index
  return colors[colorIndex];
};

/**
 * ScatterPlot
 * Displays time series data for selected parameters and sensors.
 * Limited to two y-axes for better visualization.
 * @param data - array of sensor data objects
 * @param selectedParameters - parameters to plot (max 2)
 * @param selectedSensors - sensors to plot
 * @param experimentName - (optional) experiment name for plot title
 * @param getSensorColor - (optional) function to get color for a sensor
 * @param plotWidth - (optional) width of the plot
 * @param plotHeight - (optional) height of the plot
 * @param axisConfig - (optional) configuration for axis appearance
 * @param onParameterLimitExceeded - (optional) callback when more than 2 parameters are selected
 * @param getParameterUnit - (optional) function to get unit for a parameter
 * @param legendSize - (optional) size of the legend
 * @returns JSX.Element
 */
const ScatterPlot: React.FC<ScatterPlotProps> = ({
  data,
  selectedParameters,
  selectedSensors,
  experimentName = '',
  getSensorColor,
  getSensorDisplayName = (sensor: string) => sensor,
  plotWidth = 1800,
  plotHeight = 750,
  axisConfig = {},
  onParameterLimitExceeded,
  getParameterUnit = () => '',
  legendSize = 18,
  sensorLabelMap,
  groupBy,
  includedLabels,
  errorType = 'SE',
  containerClassName = 'h-[calc(70vh-280px)] w-full',
  rendererMode = 'svg',
  onBenchmarkResult,
  tracePreparationMode = 'indexed',
  onTracePreparation,
}) => {
  const tracePreparationStartedAt =
    onBenchmarkResult && typeof performance !== 'undefined' ? performance.now() : 0;
  const benchmarkReportedRef = React.useRef(false);
  const preparationExecutionCountRef = React.useRef(0);

  // Check for parameter limit and notify if exceeded
  useEffect(() => {
    if (selectedParameters.length > 2) {
      toast.warning('Only two parameters can be displayed at once. Please select a maximum of two parameters.', {
        position: "top-center",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      
      if (onParameterLimitExceeded) {
        onParameterLimitExceeded();
      }
    }
  }, [selectedParameters, onParameterLimitExceeded]);

  // Always limit to maximum of 2 parameters
  const limitedParameters = React.useMemo(
    () => selectedParameters.slice(0, 2),
    [selectedParameters]
  );
  
  const getColorKey = React.useCallback(
    (sensor: string) => {
      const displayName = String(getSensorDisplayName(sensor) ?? '').trim();
      // Fallback to LLA-based color when location/display name is missing.
      return displayName !== '' ? displayName : sensor;
    },
    [getSensorDisplayName]
  );

  const colorDomain = React.useMemo(() => {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const sensor of selectedSensors) {
      const colorKey = getColorKey(sensor);
      if (seen.has(colorKey)) continue;
      seen.add(colorKey);
      keys.push(colorKey);
    }
    return keys;
  }, [selectedSensors, getColorKey]);

  // Use location/display-name color grouping so replacement LLAs share the same color.
  const colorFn = React.useCallback(
    (sensor: string) => {
      const colorKey = getColorKey(sensor);
      return getSensorColor
        ? getSensorColor(colorKey)
        : defaultGetSensorColor(colorKey, colorDomain);
    },
    [getSensorColor, getColorKey, colorDomain]
  );

  // Default axis configuration
  const defaultAxisConfig: AxisConfig = {
    tickSize: 20,
    textSize: 24,
    distanceFromPlot: 75,
  };

  // Merge default and provided configurations
  const leftAxisConfig = { ...defaultAxisConfig, ...axisConfig.left };
  const rightAxisConfig = { ...defaultAxisConfig, ...axisConfig.right };

  // --- Grouping logic ---
  function getLabelColors(labels: string[]) {
    // Use a color palette for labels
    const palette = [
      '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
      '#1a55FF', '#FF1A1A', '#1AFF1A', '#FF1AFF', '#1AFFFF', '#4B0082', '#FF4500', '#32CD32', '#FF1493', '#00CED1',
    ];
    return (label: string) => {
      const idx = labels.indexOf(label);
      return palette[idx % palette.length];
    };
  }

  const traceType = rendererMode === 'webgl' ? 'scattergl' : 'scatter';
  let plotData: any[] = [];
  let preparationStats: SensorTracePreparationStats | null = null;
  const yAxisTitle = formatAxisTitle(limitedParameters[0] ?? selectedParameters[0]);
  const yAxisTwoTitle =
    limitedParameters.length > 1
      ? formatAxisTitle(limitedParameters[1] ?? selectedParameters[1])
      : '';
  const selectedLabelGroups = React.useMemo(
    () => normalizeIncludedLabels(includedLabels ?? []),
    [includedLabels]
  );

  const sensorPreparation = React.useMemo(() => {
    if (groupBy === 'label' && sensorLabelMap) return null;
    preparationExecutionCountRef.current += 1;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    const options = {
      data,
      limitedParameters,
      selectedParameterCount: selectedParameters.length,
      selectedSensors,
      traceType,
      getSensorDisplayName,
      getSensorColor: colorFn,
    };
    const result = tracePreparationMode === 'legacy'
      ? prepareSensorTracesLegacy(options)
      : prepareSensorTracesIndexed(options);
    onTracePreparation?.({
      executionCount: preparationExecutionCountRef.current,
      sourceRowCount: data.length,
      selectedSensors: [...selectedSensors],
      selectedParameters: [...limitedParameters],
      durationMs: typeof performance !== 'undefined' ? performance.now() - startedAt : 0,
    });
    return result;
  }, [
    colorFn,
    data,
    getSensorDisplayName,
    groupBy,
    limitedParameters,
    onTracePreparation,
    selectedParameters.length,
    selectedSensors,
    sensorLabelMap,
    tracePreparationMode,
    traceType,
  ]);

  if (groupBy === 'label' && sensorLabelMap) {
    const labelsToPlot = selectedLabelGroups;
    const labelColor = getLabelColors(labelsToPlot);

    for (let paramIdx = 0; paramIdx < limitedParameters.length; paramIdx++) {
      const param = limitedParameters[paramIdx];
      // For each label: long-format rows where effective label matches (mean across sensors per timestamp)
      labelsToPlot.forEach((label) => {
        const paramData = data.filter(
          (d) =>
            rowMatchesParameter(d as RowWithSensorLabel, param) &&
            selectedSensors.includes(String(d.sensor)) &&
            getSelectedLabelMemberships(
              d as RowWithSensorLabel,
              sensorLabelMap,
              labelsToPlot
            ).includes(label)
        );
        if (paramData.length === 0) return;
        const sensorsInGroup = Array.from(new Set(paramData.map((d) => String(d.sensor))));
        // 2. Group by timestamp
        const byTimestamp: Record<string, number[]> = {};
        paramData.forEach(d => {
          const ts = String(d.timestamp);
          const numValue = Number(d.value);

          // Grouping consumes the post-cleaning dataset from VisualizationPanel.
          if (!isNaN(numValue) && numValue !== null && numValue !== undefined) {
            if (!byTimestamp[ts]) byTimestamp[ts] = [];
            byTimestamp[ts].push(numValue);
          }
        });
        // 3. For each timestamp, compute mean and error (STD or SE)
        // Note: byTimestamp already contains only valid values (filtered in step 2)
        const timestamps = Object.keys(byTimestamp).sort();
        const means = timestamps.map(ts => {
          const vals = byTimestamp[ts];
          if (!vals || vals.length === 0) return null;
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        });
        const errors = timestamps.map(ts => {
          const vals = byTimestamp[ts];
          if (!vals || vals.length === 0) return null;
          if (vals.length === 1) return null; // Need at least 2 values for error calculation
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
          const std = Math.sqrt(variance);
          // Calculate SE if errorType is 'SE', otherwise use STD
          return errorType === 'SE' ? std / Math.sqrt(vals.length) : std;
        });
        // 4. Add mean line
        plotData.push({
          x: timestamps.map(ts => String(ts)),
          y: means,
          type: traceType,
          mode: 'lines',
          name: `${label} - ${getParameterDisplayLabel(param)}`,
          yaxis: paramIdx === 0 ? 'y' : 'y2',
          line: {
            color: labelColor(label),
            width: 2,
          },
          hovertemplate: `%{x}<br>${getParameterDisplayLabel(param)}: %{y}${getMetadataParameterUnit(param) ? ` ${getMetadataParameterUnit(param)}` : ''}<extra>${label}</extra>`,
        });
        // 5. If group has >3 sensors, add error shaded area
        // Only include timestamps where we have valid mean and error calculations
        if (sensorsInGroup.length > 3) {
          // Build arrays with only valid error band points (no nulls)
          const errorBandX: string[] = [];
          const errorBandUpper: number[] = [];
          const errorBandLower: number[] = [];
          
          timestamps.forEach((ts, i) => {
            const m = means[i];
            const err = errors[i];
            const vals = byTimestamp[ts] || [];
            
            // Only include if we have valid mean, error, and at least 2 values
            if (m !== null && err !== null && vals.length >= 2) {
              errorBandX.push(String(ts));
              errorBandUpper.push(m + err);
              errorBandLower.push(m - err);
            }
          });
          
          // Only create error band if we have at least one valid point
          if (errorBandX.length > 0) {
            plotData.push({
              x: [...errorBandX, ...errorBandX.slice().reverse()],
              y: [...errorBandUpper, ...errorBandLower.slice().reverse()],
              type: traceType,
              mode: 'lines',
              fill: 'toself',
              fillcolor: labelColor(label) + '22', // semi-transparent
              line: { color: 'rgba(0,0,0,0)' },
              name: `${label} ±${errorType}`,
              yaxis: paramIdx === 0 ? 'y' : 'y2',
              showlegend: false,
              hoverinfo: 'skip',
            });
          }
        }
      });
    }
  } else {
    // Default: group by sensor
    const preparation = sensorPreparation as NonNullable<typeof sensorPreparation>;
    plotData = preparation.preparedTraces.map(({ trace }) => trace);
    preparationStats = preparation.stats;
  }

  // Ensure plotData is always an array of objects
  plotData = Array.isArray(plotData) ? plotData.filter(trace => typeof trace === 'object' && trace !== null && 'x' in trace && 'y' in trace) : [];

  const traceCount = plotData.length;
  const renderedPointCount = onBenchmarkResult
    ? plotData.reduce(
        (total, trace) => total + (Array.isArray(trace.x) ? trace.x.length : 0),
        0
      )
    : 0;
  const tracePreparationEndedAt =
    onBenchmarkResult && typeof performance !== 'undefined' ? performance.now() : 0;
  const plotRenderRequestedAt = tracePreparationEndedAt;

  // Guard: If groupBy is 'label' and no includedLabels, show info message
  const labelWarningFontColor = '#8AC6BB';
  const labelWarningFontSize = 20;
  if (groupBy === 'label' && selectedLabelGroups.length === 0) {
    return <LabelWarningPlaceholder fontColor={labelWarningFontColor} fontSize={labelWarningFontSize} />;
  }

  return (
    <div className={containerClassName}>
      <Plot
        data={plotData}
        layout={{
          // title: {
          //   text: `${experimentName} - Sensor Data`,
          //   font: { size: leftAxisConfig.textSize },
          //   y: 0.98,
          //   yanchor: 'bottom',
          // },
          xaxis: {
            title: 'Time',
            titlefont: { size: leftAxisConfig.textSize },
            tickfont: { size: leftAxisConfig.tickSize },
            rangeslider: { visible: false },
            standoff: leftAxisConfig.distanceFromPlot,
          },
          yaxis: {
            title: {
              text: yAxisTitle,
              font: { size: leftAxisConfig.textSize },
              standoff: leftAxisConfig.distanceFromPlot,
            },
            tickfont: { size: leftAxisConfig.tickSize },
            side: 'left',
            position: 0,
            showgrid: true,
            gridcolor: '#E2E8F0',
            zeroline: true,
            zerolinecolor: '#E2E8F0',
            zerolinewidth: 1,
          },
          yaxis2: {
            title: {
              text: yAxisTwoTitle,
              font: { size: rightAxisConfig.textSize },
              standoff: rightAxisConfig.distanceFromPlot,
            },
            tickfont: { size: rightAxisConfig.tickSize },
            side: 'right',
            position: 1,
            overlaying: 'y',
            showgrid: false,
            zeroline: false,
          },
          margin: {
            t: 60,  // Top margin for title
            b: 45,  // Bottom margin
            l: 100,  // Left margin for y-axis labels
            r:110,  // Right margin for y-axis labels
          },
          showlegend: true,
          legend: {
            x: 0,
            y: -0.15,
            xanchor: 'top',
            yanchor: 'top',
            orientation: 'h',
            bgcolor: 'rgba(255, 255, 255, 0.9)',
            bordercolor: '#E2E8F0',
            borderwidth: 1,
            font: {
              size: legendSize
            }
          },
          autosize: true,
          plot_bgcolor: '#ffffff',
          paper_bgcolor: '#ffffff',
        }}
        config={{
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          displaylogo: false,
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
        onAfterPlot={() => {
          if (!onBenchmarkResult || benchmarkReportedRef.current) return;
          benchmarkReportedRef.current = true;
          const plotlyCompletedAt = performance.now();
          onBenchmarkResult({
            rendererMode,
            tracePreparationMs: tracePreparationEndedAt - tracePreparationStartedAt,
            plotlyRenderMs: plotlyCompletedAt - plotRenderRequestedAt,
            totalMs: plotlyCompletedAt - tracePreparationStartedAt,
            traceCount,
            renderedPointCount,
            tracePreparationMode,
            preparationStats,
          });
        }}
      />
    </div>
  );
};

export default React.memo(ScatterPlot);
