/*
 * BoxPlot.tsx
 * Renders a multi-parameter, multi-sensor box plot using Plotly.
 */

import React, { useEffect } from 'react';
import Plot from 'react-plotly.js';
import { toast } from 'react-toastify';
import { BoxPlotData } from 'plotly.js-dist-min';
import LabelWarningPlaceholder from './LabelWarningPlaceholder';

// Axis configuration interface
interface AxisConfig {
  tickSize: number;
  textSize: number;
  distanceFromPlot: number;
}

// Default axis configuration
const defaultAxisConfig: AxisConfig = {
  tickSize: 20,
  textSize: 24,
  distanceFromPlot: 23,
};

export interface SensorData {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number;
  [key: string]: any;
}

interface BoxPlotProps {
  data: SensorData[];
  selectedParameters: string[];
  selectedSensors: string[];
  groupBy?: 'sensor' | 'label';
  experimentName?: string;
  getSensorColor?: (sensor: string) => string;
  combine?: boolean;
  getParameterUnit?: (parameter: string) => string;
  onParameterLimitExceeded?: () => void;
  axisConfig?: AxisConfig; // Optional axis configuration
  legendSize?: number; // New prop for controlling legend size
  sensorLabelMap?: Record<string, string[]>; // Add this
  includedLabels?: string[]; // Add this
}

// Helper to map parameter names to units
const getParameterUnit = (param: string): string => {
  if (param.toLowerCase().includes('temp')) return '°C';
  if (param.toLowerCase().includes('humidity')) return '%';
  if (param.toLowerCase().includes('pressure')) return 'hPa';
  if (param.toLowerCase().includes('light')) return 'lux';
  if (param.toLowerCase().includes('co2')) return 'ppm';
  if (param.toLowerCase().includes('battery')) return 'V';
  if (param.toLowerCase().includes('rssi')) return 'dBm';
  return '';
};

/**
 * BoxPlot
 * Displays box plots for selected parameters and sensors, grouped by date or label.
 * Limited to two y-axes for better visualization.
 * @param data - array of sensor data objects
 * @param selectedParameters - parameters to plot (max 2)
 * @param selectedSensors - sensors to plot
 * @param groupBy - (optional) 'date' or 'label' grouping
 * @param experimentName - (optional) experiment name for plot title
 * @param getSensorColor - (optional) function to get color for a sensor
 * @param combine - (optional) whether to combine all data into one group
 * @param getParameterUnit - (optional) function to get parameter unit
 * @param onParameterLimitExceeded - (optional) callback when more than 2 parameters are selected
 * @param axisConfig - (optional) axis configuration
 * @param legendSize - (optional) legend size
 * @returns JSX.Element
 */
const BoxPlot: React.FC<BoxPlotProps> = ({
  data,
  selectedParameters,
  selectedSensors,
  groupBy = 'label',
  experimentName = '',
  getSensorColor = () => '#8ac6bb',
  combine = false,
  getParameterUnit = () => '',
  onParameterLimitExceeded,
  axisConfig = defaultAxisConfig, // Use default config if not provided
  legendSize = 18, // Default legend size
  sensorLabelMap = {},
  includedLabels = [],
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

  // Expand data for label grouping
  let expandedData: SensorData[] = data;
  if (groupBy === 'label' && sensorLabelMap && includedLabels.length > 0) {
    expandedData = [];
    data.forEach(d => {
      const labels = (sensorLabelMap[d.sensor] || []).filter(l => includedLabels.includes(l));
      if (labels.length === 0) return;
      labels.forEach(label => {
        expandedData.push({ ...d, label });
      });
    });
  } else if (groupBy === 'label') {
    // fallback: assign Unknown label if none
    expandedData = data.map(d => ({ ...d, label: d.label || 'Unknown' }));
  }

  // Group data by sensor or label, or combine all if combine is true
  let groupKey: (d: SensorData) => string;
  if (combine) {
    groupKey = () => 'Combined';
  } else if (groupBy === 'sensor') {
    groupKey = (d: SensorData) => d.sensor;
  } else {
    groupKey = (d: SensorData) => d.label || 'Unknown';
  }

  // For each parameter and group, create a box trace
  const traces: Partial<BoxPlotData>[] = limitedParameters.flatMap((param, paramIdx) => {
    // Get all unique groups
    const groups = Array.from(new Set(expandedData.filter(d => d.parameter === param && selectedSensors.includes(d.sensor)).map(groupKey)));
    return groups.map(group => {
      const filtered = expandedData.filter(d => d.parameter === param && selectedSensors.includes(d.sensor) && groupKey(d) === group);
      return {
        y: filtered.map(d => d.value),
        x: Array(filtered.length).fill(group),
        name: groupBy === 'sensor'
          ? `${group}${limitedParameters.length > 1 ? ` - ${param}` : ''}`
          : `${group}${limitedParameters.length > 1 ? ` - ${param}` : ''}`,
        type: "box",
        boxpoints: 'outliers',
        marker: { color: groupBy === 'sensor' ? getSensorColor(group) : undefined },
        yaxis: paramIdx === 0 ? 'y' : 'y2',
      };
    });
  }).flat()
    .sort((a, b) => a.name.localeCompare(b.name)); // Sort traces alphabetically by name

  // Layout with two y-axes
  const layout: Partial<import('plotly.js-dist-min').Layout> = {
    title: {
      text: `${experimentName} - Box Plot`,
      font: { size: axisConfig.textSize },
      y: 0.98,
      yanchor: 'bottom',
    },
    xaxis: {
      title: groupBy === 'sensor' ? 'Sensor' : 'Label',
      titlefont: { size: axisConfig.textSize },
      tickfont: { size: axisConfig.tickSize },
      standoff: axisConfig.distanceFromPlot,
    },
    yaxis: {
      title: {
        text: `${limitedParameters[0]?.replace('SensorData_', '') || ''} (${getParameterUnit(limitedParameters[0]?.replace('SensorData_', '') || '')})`,
        font: { size: axisConfig.textSize },
        standoff: axisConfig.distanceFromPlot,
      },
      tickfont: { size: axisConfig.tickSize },
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
        font: { size: axisConfig.textSize },
        standoff: axisConfig.distanceFromPlot,
      },
      tickfont: { size: axisConfig.tickSize },
      side: 'right',
      position: 1,
      overlaying: 'y',
      showgrid: false,
      zeroline: false,
    },
    autosize: true,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    boxmode: 'group',
    showlegend: true,
    legend: {
      x: 0,
      y: -0.15,
      xanchor: 'left',
      yanchor: 'top',
      orientation: 'h',
      bgcolor: 'rgba(255, 255, 255, 0.9)',
      bordercolor: '#E2E8F0',
      borderwidth: 1,
      font: {
        size: legendSize
      }
    },
    margin: {
      t: 60,  // Top margin for title
      b: 45,  // Bottom margin
      l: 100,  // Left margin for y-axis labels
      r: 110,  // Right margin for y-axis labels
    },
  };

  // Guard: If groupBy is 'label' and no includedLabels, show info message
  const labelWarningFontColor = '#8AC6BB';
  const labelWarningFontSize = 20;
  if (groupBy === 'label' && (!includedLabels || includedLabels.length === 0)) {
    return <LabelWarningPlaceholder fontColor={labelWarningFontColor} fontSize={labelWarningFontSize} />;
  }

  return (
    <div className="h-[calc(70vh-280px)] w-full">
      <Plot
        data={traces}
        layout={layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default BoxPlot; 