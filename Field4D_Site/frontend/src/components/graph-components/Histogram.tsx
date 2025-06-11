/*
 * Histogram.tsx
 * Renders histograms for each selected parameter using Plotly subplots.
 */

import React from 'react';
import Plot from 'react-plotly.js';
import { Layout } from 'plotly.js-dist-min';
import OutlierToggle from '../Advanced-function/OutlierToggle';
import Select from 'react-select';
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
  distanceFromPlot:2,
};

// Color palette for unique colors
// Tailwind inspired colors
const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#22D3EE', '#14B8A6'
];
// logo inspired colors
// const COLORS = [
//   '#8ac6bb', '#b2b27a', '#e6a157', '#a3c293', '#f3c57c', '#b4c6e7', '#c6a0d9', '#d9b5a3', '#99b898'
// ];

// Add these constants at the top, after imports
const labelWarningFontColor = '#8AC6BB';
const labelWarningFontSize = 20;

interface HistogramProps {
  data: any[];
  selectedParameters: string[];
  selectedSensors: string[];
  experimentName?: string;
  getSensorColor?: (sensor: string) => string;
  getParameterUnit?: (parameter: string) => string;
  subplotHeight?: number;  // Height of each subplot
  subplotWidth?: number;   // Width of each subplot
  subplotSpacing?: number; // Vertical spacing between subplots
  axisConfig?: AxisConfig; // Optional axis configuration
  sensorLabelMap?: Record<string, string[]>;
  includedLabels?: string[];
  legendSize?: number; // New prop for controlling legend size

}

// Add this function after the COLORS constant
const sampleData = (data: any[], maxPoints: number = 100_000): { sampledData: any[]; samplingInfo: SamplingInfo } => {
  if (data.length <= maxPoints) return { sampledData: data, samplingInfo: { originalCount: data.length, sampledCount: data.length, parameters: {} } };
  
  // Group data by parameter
  const groupedByParam: { [key: string]: any[] } = {};
  data.forEach(d => {
    if (!groupedByParam[d.parameter]) {
      groupedByParam[d.parameter] = [];
    }
    groupedByParam[d.parameter].push(d);
  });

  // Calculate points per parameter based on their relative proportions
  const totalPoints = data.length;
  const sampledData: any[] = [];
  const samplingInfo: SamplingInfo = {
    originalCount: totalPoints,
    sampledCount: 0,
    parameters: {}
  };
  
  Object.entries(groupedByParam).forEach(([param, paramData]) => {
    // Calculate how many points this parameter should contribute
    // For example, if Parameter A has 60% of the data and Parameter B has 40%, 
    // and we want 100,000 total points, Parameter A will get 60,000 points 
    // and Parameter B will get 40,000 points
    const paramProportion = paramData.length / totalPoints;
    // Each parameter's maximum points is proportional to maxPoints (default 100,000)
    // paramMaxPoints = maxPoints * (number of points for this parameter / total points)
    const paramMaxPoints = Math.max(1000, Math.floor(maxPoints * paramProportion));
    
    // Randomly sample points for this parameter
    const sampledParamData = paramData.length > paramMaxPoints
      ? paramData
          .map((d, i) => ({ d, i, r: Math.random() })) // Add random number for sorting
          .sort((a, b) => a.r - b.r) // Sort by random number
          .slice(0, paramMaxPoints) // Take first paramMaxPoints items
          .sort((a, b) => a.i - b.i) // Sort back by original index
          .map(({ d }) => d) // Extract just the data
      : paramData;
    
    samplingInfo.parameters[param] = {
      original: paramData.length,
      sampled: sampledParamData.length
    };
    samplingInfo.sampledCount += sampledParamData.length;
    
    sampledData.push(...sampledParamData);
  });

  return { sampledData, samplingInfo };
};

// Add after the sampleData function
interface SamplingInfo {
  originalCount: number;
  sampledCount: number;
  parameters: { [key: string]: { original: number; sampled: number } };
}

const SamplingNotification: React.FC<{ info: SamplingInfo; infoTextSize?: number }> = ({ info, infoTextSize = 18 }) => {
  const [showTooltip, setShowTooltip] = React.useState(false);

  return (
    <div className="mb-4 p-4 bg-[#8ac6bb]/10 border border-[#8ac6bb]/20 rounded-lg max-w-md">
      <div className="flex items-center">
        <div className="relative">
          <svg 
            className="w-5 h-5 text-[#8ac6bb] cursor-help" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showTooltip && (
            <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-white border border-[#8ac6bb]/20 rounded-lg shadow-lg text-sm text-gray-600 z-50">
              Need the complete dataset? Download it for full-resolution analysis in tools like Python, R, or Excel
            </div>
          )}
        </div>
        <div className="text-[#8ac6bb] ml-2" style={{ fontSize: infoTextSize }}>
          <span className="font-medium">Data sampling applied for better performance</span>
          <p className="text-sm mt-1 text-[#8ac6bb]/80">
            The statistical properties of your data remain unchanged
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Histogram
 * Displays a histogram for each parameter in the data as a subplot.
 * Includes an outlier filtering toggle (IQR-based, local state).
 * @param data - array of sensor data objects
 * @param selectedParameters - parameters to plot
 * @param selectedSensors - sensors to plot
 * @param experimentName - (optional) experiment name for plot title
 * @param getSensorColor - (optional) function to get color for a sensor
 * @param getParameterUnit - (optional) function to get parameter unit
 * @param subplotHeight - (optional) height of each subplot
 * @param subplotWidth - (optional) width of each subplot
 * @param subplotSpacing - (optional) vertical spacing between subplots
 * @param axisConfig - (optional) axis configuration
 * @returns JSX.Element
 * @param legendSize - (optional) legend size
 */
const Histogram: React.FC<HistogramProps> = ({
  data,
  selectedParameters,
  selectedSensors,
  experimentName = '',
  getSensorColor = () => '#8ac6bb',
  getParameterUnit = () => '',
  subplotHeight = 200,    // Default height for each subplot
  subplotWidth = 1800,     // Default width for each subplot
  subplotSpacing = 0.1,   // Default spacing between subplots
  axisConfig = defaultAxisConfig, // Use default config if not provided
  sensorLabelMap = {},
  includedLabels = [],
  legendSize = 18 , // deafult legend size
}) => {
  // Outlier filtering toggle state (local to Histogram)
  const [outlierFiltering, setOutlierFiltering] = React.useState<boolean>(() => {
    const stored = localStorage.getItem('histogramOutlierFiltering');
    return stored === null ? false : stored === 'true';
  });
  React.useEffect(() => {
    localStorage.setItem('histogramOutlierFiltering', String(outlierFiltering));
  }, [outlierFiltering]);

  // Group mode: 'all' (entire data) or 'label'
  const [groupMode, setGroupMode] = React.useState<'all' | 'label'>('all');
  // Bin count state
  const [binCount, setBinCount] = React.useState<number>(50);

  // IQR-based outlier filtering logic (per parameter)
  function filterOutliersIQR(data) {
    // Group by parameter
    const grouped = {};
    data.forEach(d => {
      const param = d.parameter;
      if (!grouped[param]) grouped[param] = [];
      grouped[param].push(d);
    });
    Object.keys(grouped).forEach(param => {
      const values = grouped[param].map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
      if (values.length < 4) return;
      values.sort((a, b) => a - b);
      const q1 = values[Math.floor(values.length * 0.25)];
      const q3 = values[Math.floor(values.length * 0.75)];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      grouped[param].forEach(d => {
        if (d.value < lower || d.value > upper) {
          d.value = null;
        }
      });
    });
    return data;
  }

  // Modify the processedData useMemo to handle sampling info
  const processedData = React.useMemo(() => {
    let dataToProcess = data;
    let samplingInfo: SamplingInfo | null = null;
    
    if (data.length > 1_000_000) {
      const result = sampleData(data);
      dataToProcess = result.sampledData;
      samplingInfo = result.samplingInfo;
    }
    
    if (!outlierFiltering) return { data: dataToProcess, samplingInfo };
    const dataCopy = dataToProcess.map(d => ({ ...d }));
    return { data: filterOutliersIQR(dataCopy), samplingInfo };
  }, [data, outlierFiltering]);

  // Get all unique parameters
  const parameters = Array.from(new Set(data.map(d => d.parameter)));

  // State for selected parameters if >10
  const [multiParams, setMultiParams] = React.useState<string[]>(parameters.slice(0, 10));
  React.useEffect(() => {
    if (parameters.length > 10) {
      setMultiParams(prev => {
        // Remove params not in the list
        const filtered = prev.filter(p => parameters.includes(p));
        // If already correct, do nothing
        if (
          filtered.length === Math.min(10, parameters.length) &&
          filtered.every((p, i) => p === parameters[i])
        ) {
          return prev;
        }
        // If empty, or fewer than 10, fill up with more from the list
        const toAdd = parameters.filter(p => !filtered.includes(p)).slice(0, 10 - filtered.length);
        return [...filtered, ...toAdd].slice(0, 10);
      });
    }
    // Only run when parameters.length > 10
    // eslint-disable-next-line
  }, [parameters.length > 10 ? parameters.join(',') : null]);

  // Calculate total height based on number of parameters and spacing
  const paramCount = parameters.length > 10 ? multiParams.length : parameters.length;
  const totalHeight = paramCount * subplotHeight * (1 + subplotSpacing);

  // Parameter list to render
  const parametersToRender = parameters.length > 10 ? multiParams : parameters;

  // Prepare traces and subplot layout
  let traces: any[] = [];
  let showLegend = groupMode === 'label';
  if (groupMode === 'all') {
    traces = parametersToRender.map((param, idx) => {
      const paramData = processedData.data.filter(d => d.parameter === param && selectedSensors.includes(d.sensor));
      const xVals = paramData.map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
      const min = Math.min(...xVals);
      const max = Math.max(...xVals);
      const size = (max - min) / binCount;
      return {
        x: xVals,
        type: 'histogram',
        name: `${param} (${getParameterUnit(param)})`,
        marker: { color: COLORS[idx % COLORS.length] },
        xaxis: `x${idx + 1}`,
        yaxis: `y${idx + 1}`,
        opacity: 0.8,
        xbins: { start: min, end: max, size },
        showlegend: false,
      };
    });
  } else if (groupMode === 'label') {
    traces = parametersToRender.flatMap((param, pIdx) => {
      const labels = includedLabels.length > 0 ? includedLabels : Array.from(new Set(Object.values(sensorLabelMap).flat()));
      const allVals = processedData.data.filter(d => d.parameter === param && selectedSensors.includes(d.sensor)).map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
      const min = Math.min(...allVals);
      const max = Math.max(...allVals);
      const size = (max - min) / binCount;
      return labels.map((label, lIdx) => {
        const sensorsForLabel = Object.entries(sensorLabelMap).filter(([sensor, labels]) => labels.includes(label)).map(([sensor]) => sensor);
        const labelData = processedData.data.filter(d => d.parameter === param && sensorsForLabel.includes(d.sensor));
        const xVals = labelData.map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
        return {
          x: xVals,
          type: 'histogram',
          name: `${label}-${param}`,
          marker: { color: COLORS[lIdx % COLORS.length] },
          xaxis: `x${pIdx + 1}`,
          yaxis: `y${pIdx + 1}`,
          opacity: 0.6,
          xbins: { start: min, end: max, size },
          barmode: 'overlay',
          showlegend: true,
        };
      });
    }).flat();
  }

  const layout: Partial<Layout> = {
    // title: {
    //   text: `${experimentName} - Histogram`,
    //   font: { size:20 },
    //   y: 0.98,
    //   yanchor: 'bottom',
    // },
    grid: {
      rows: paramCount,
      columns: paramCount > 5 ? 2 : 1,
      pattern: 'independent',
      rowheight: Array(paramCount).fill(subplotHeight),
    },
    autosize: true,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    showlegend: showLegend,
    width: subplotWidth,
    height: totalHeight,
    margin: {
      t: 60,  // Top margin for title
      b: 45,  // Bottom margin
      l: 100,  // Increased left margin for y-axis labels
      r: 40,  // Right margin
    },
    barmode: groupMode === 'label' ? 'overlay' : undefined,
    legend: {
      font: {
        size: legendSize
      }
    },
  };

  // Add x and y axis configurations for each subplot
  parametersToRender.forEach((param, idx) => {
    const unit = getParameterUnit(param);
    layout[`xaxis${idx + 1 === 1 ? '' : idx + 1}`] = {
      title: {
        text: `${param} (${unit})`,
        font: { size: axisConfig.textSize },
        standoff: axisConfig.distanceFromPlot,
      },
      tickfont: { size: axisConfig.tickSize },
      showgrid: true,
      gridcolor: '#E2E8F0',
    };
    layout[`yaxis${idx + 1 === 1 ? '' : idx + 1}`] = {
      title: {
        text: 'Count',
        font: { size: axisConfig.textSize },
        standoff: axisConfig.distanceFromPlot,
        y: 0.5,  // Center the y-axis title vertically
        yanchor: 'middle',  // Anchor the title to its middle point
      },
      tickfont: { size: axisConfig.tickSize },
      showgrid: true,
      gridcolor: '#E2E8F0',
    };
  });

  const infoTextSize = 18;

  // Remove the early return for the label guard, and instead set a flag
  const showLabelInfo = groupMode === 'label' && (!includedLabels || includedLabels.length === 0);

  return (
    <div className="w-full">
      {/* Controls Row: MultiParam, Outlier, Bin */}
      <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
        <div className="flex items-center space-x-6">
          {/* Parameter limiting UI (left-aligned) */}
          {parameters.length > 10 && (
            <div className="flex flex-col items-start min-w-[320px] mr-4">
              <span style={{ fontSize: infoTextSize, color: '#8AC6BB', fontWeight: 'bold' }} className="mb-2">Showing up to 10 parameters at a time</span>
              <Select
                isMulti
                options={parameters.map(param => ({ value: param, label: param }))}
                value={multiParams.map(param => ({ value: param, label: param }))}
                onChange={selected => {
                  const vals = Array.isArray(selected) ? selected.map(opt => opt.value) : [];
                  setMultiParams(vals.slice(0, 10));
                }}
                classNamePrefix="select"
                placeholder="Select parameters..."
                closeMenuOnSelect={false}
                isOptionDisabled={opts => multiParams.length >= 10 && !multiParams.includes(opts.value)}
                maxMenuHeight={200}
                styles={{ menu: base => ({ ...base, zIndex: 9999 }) }}
              />
            </div>
          )}
          {/* Removed OutlierToggle here to avoid duplicate toggle */}
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Number of bins:</label>
            <input
              type="range"
              min={10}
              max={100}
              value={binCount}
              onChange={e => setBinCount(Number(e.target.value))}
              className="w-48"
            />
            <input
              type="number"
              min={10}
              max={100}
              value={binCount}
              onChange={e => setBinCount(Number(e.target.value))}
              className="w-16 border border-gray-300 rounded px-2 py-1"
            />
          </div>
        </div>
      </div>
      {/* Add sampling notification if data was sampled */}
      {processedData.samplingInfo && (
        <SamplingNotification info={processedData.samplingInfo} infoTextSize={infoTextSize} />
      )}
      {/* Group mode toggle */}
      <div className="mb-4 flex items-center justify-center">
        <div className="inline-flex rounded-md shadow-sm bg-gray-100" role="group">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border border-gray-300 focus:z-10 focus:ring-2 focus:ring-[#8ac6bb] focus:text-[#8ac6bb] ${groupMode === 'all' ? 'bg-[#8ac6bb] text-white' : 'bg-white text-gray-700'}`}
            onClick={() => setGroupMode('all')}
          >
            Entire Data
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border border-gray-300 focus:z-10 focus:ring-2 focus:ring-[#8ac6bb] focus:text-[#8ac6bb] ${groupMode === 'label' ? 'bg-[#8ac6bb] text-white' : 'bg-white text-gray-700'}`}
            onClick={() => setGroupMode('label')}
          >
            Group by Label
          </button>
        </div>
      </div>
      {/* Chart or info message */}
      {showLabelInfo ? (
        <LabelWarningPlaceholder fontColor={labelWarningFontColor} fontSize={labelWarningFontSize} />
      ) : (
        <div className={`grid ${paramCount > 5 ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
          <Plot
            data={traces}
            layout={layout}
            config={{ responsive: true, displayModeBar: true, displaylogo: false }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
    </div>
  );
};

export default Histogram; 