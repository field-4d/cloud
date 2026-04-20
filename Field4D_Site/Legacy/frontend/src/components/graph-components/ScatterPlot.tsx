/*
 * ScatterPlot.tsx
 * Renders a multi-parameter, multi-sensor time series scatter plot using Plotly.
 */

import React, { useEffect } from 'react';
import Plot from 'react-plotly.js';
import { toast } from 'react-toastify';
import LabelWarningPlaceholder from './LabelWarningPlaceholder';

interface SensorData {
  timestamp: string;
  [key: string]: string | number;
}

interface AxisConfig {
  tickSize?: number;
  textSize?: number;
  distanceFromPlot?: number;
}

interface ScatterPlotProps {
  data: SensorData[];
  selectedParameters: string[];
  selectedSensors: string[];
  experimentName?: string;
  getSensorColor?: (sensor: string) => string;
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
}

// Artifact thresholds per parameter (case-insensitive matching) - same as in VisualizationPanel
const ARTIFACT_THRESHOLDS: Record<string, number> = {
  temperature: -40,
  humidity: -999,
  // Add more as needed
};

const defaultGetSensorColor = (sensor: string, selectedSensors: string[]) => {
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
  
  // Get the index of the sensor in the selectedSensors array
  const idx = selectedSensors.indexOf(sensor);
  
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
}) => {
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
  const limitedParameters = selectedParameters.slice(0, 2);
  
  // Use the provided getSensorColor or the default one
  const colorFn = getSensorColor
    ? (sensor: string) => getSensorColor(sensor)
    : (sensor: string) => defaultGetSensorColor(sensor, selectedSensors);

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

  let plotData: any[] = [];

  if (groupBy === 'label' && sensorLabelMap) {
    // Use only includedLabels if provided, else all unique labels
    const allLabels = Array.from(new Set(Object.values(sensorLabelMap).flat()));
    const labelsToPlot = includedLabels && includedLabels.length > 0 ? allLabels.filter(l => includedLabels.includes(l)) : allLabels;
    const labelColor = getLabelColors(labelsToPlot);

    for (let paramIdx = 0; paramIdx < limitedParameters.length; paramIdx++) {
      const param = limitedParameters[paramIdx];
      // For each label group
      labelsToPlot.forEach(label => {
        // Find all sensors with this label
        const sensorsInGroup = Object.entries(sensorLabelMap)
          .filter(([sensor, labels]) => labels.includes(label) && selectedSensors.includes(sensor))
          .map(([sensor]) => sensor);
        if (sensorsInGroup.length === 0) return;
        // For each timestamp, average the values of all sensors in the group
        // 1. Gather all data points for this parameter and these sensors
        const paramData = data.filter(d => d.parameter === param.replace('SensorData_', '') && sensorsInGroup.includes(String(d.sensor)));
        // 2. Group by timestamp
        const byTimestamp: Record<string, number[]> = {};
        paramData.forEach(d => {
          const ts = String(d.timestamp);
          if (!byTimestamp[ts]) byTimestamp[ts] = [];
          const numValue = Number(d.value);
          
          // Check if this is an artifact value (before filtering)
          const paramLower = String(d.parameter).toLowerCase();
          const artifactThreshold = ARTIFACT_THRESHOLDS[paramLower];
          const isArtifact = artifactThreshold !== undefined && numValue === artifactThreshold;
          
          // Only include valid numeric values (exclude NaN, null, undefined, and artifact values)
          if (!isNaN(numValue) && numValue !== null && numValue !== undefined && !isArtifact) {
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
          type: 'scatter',
          mode: 'lines',
          name: `${label}-${param.replace('SensorData_', '')}`,
          yaxis: paramIdx === 0 ? 'y' : 'y2',
          line: {
            color: labelColor(label),
            width: 2,
          },
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
              type: 'scatter',
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
    plotData = limitedParameters.flatMap((param, paramIdx) => {
          // Filter data for this parameter
          const paramData = data.filter(d => d.parameter === param.replace('SensorData_', ''));
      // Grosensorup by  and sort alphabetically
      return selectedSensors
            .map(sensor => {
          const sensorData = paramData.filter(d => String(d.sensor) === sensor);
              const color = colorFn(sensor);
              return {
            x: sensorData.map(d => String(d.timestamp)),
            y: sensorData.map(d => d.value == null ? null : Number(d.value)),
                type: 'scatter',
                mode: 'lines',
            name: selectedParameters.length > 1 ? `${sensor}-${param.replace('SensorData_', '')}` : sensor,
                yaxis: paramIdx === 0 ? 'y' : 'y2',
                line: {
                  color: color,
                  width: 2,
                },
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }).flat();
  }

  // Ensure plotData is always an array of objects
  plotData = Array.isArray(plotData) ? plotData.filter(trace => typeof trace === 'object' && trace !== null && 'x' in trace && 'y' in trace) : [];

  // Guard: If groupBy is 'label' and no includedLabels, show info message
  const labelWarningFontColor = '#8AC6BB';
  const labelWarningFontSize = 20;
  if (groupBy === 'label' && (!includedLabels || includedLabels.length === 0)) {
    return <LabelWarningPlaceholder fontColor={labelWarningFontColor} fontSize={labelWarningFontSize} />;
  }

  return (
    <div className="h-[calc(70vh-280px)] w-full">
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
              text: `${limitedParameters[0]?.replace('SensorData_', '') || ''} (${getParameterUnit(limitedParameters[0]?.replace('SensorData_', '') || '')})`,
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
              text: `${limitedParameters[1]?.replace('SensorData_', '') || ''} (${getParameterUnit(limitedParameters[1]?.replace('SensorData_', '') || '')})`,
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
      />
    </div>
  );
};

export default ScatterPlot; 