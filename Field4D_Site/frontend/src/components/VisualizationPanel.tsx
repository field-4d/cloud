/*
 * VisualizationPanel.tsx
 * Panel for selecting and displaying different types of data visualizations.
 * Supports scatter, box, and histogram plots.
 */

import React, { useState, useMemo, useEffect } from 'react';
import ScatterPlot from './graph-components/ScatterPlot';
import BoxPlot from './graph-components/BoxPlot';
import Select from 'react-select';
import Histogram from './graph-components/Histogram';
import OutlierToggle from './Advanced-function/OutlierToggle';
import CorrelationMatrix from './graph-components/CorrelationMatrix';
import CorrelationScatter from './graph-components/CorrelationScatter';
import LoadingSpinner from './graph-components/LoadingSpinner';
import { getParameterUnit } from './DataSelector';

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
  /**
   * Whether outlier filtering is enabled (controlled by parent)
   */
  outlierFiltering: boolean;
  /**
   * Callback to set outlier filtering state (controlled by parent)
   */
  setOutlierFiltering: React.Dispatch<React.SetStateAction<boolean>>;
  sensorLabelMap: Record<string, string[]>;
  includedLabels: string[];
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

/**
 * VisualizationPanel
 * Allows user to select visualization type, dates, and parameters.
 * Renders the appropriate plot component based on selection.
 * @param data - array of sensor data objects
 * @param selectedParameters - parameters to visualize
 * @param selectedSensors - sensors to visualize
 * @param experimentName - (optional) experiment name for plot titles
 * @param getSensorColor - (optional) function to get color for a sensor
 * @param outlierFiltering - whether outlier filtering is enabled
 * @param setOutlierFiltering - callback to set outlier filtering state
 * @returns JSX.Element
 */
const VisualizationPanel: React.FC<VisualizationPanelProps> = (props) => {
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
  const [outlierMethod, setOutlierMethod] = useState('IQR');
  const [outlierThreshold, setOutlierThreshold] = useState(1.5);

  // Extract unique dates from data
  const allDates = Array.from(new Set(props.data.map(d => (typeof d.timestamp === 'string' ? d.timestamp.split('T')[0] : '')))).filter(Boolean);
  const [selectedDates, setSelectedDates] = useState<string[]>(allDates);
  const [allDatesSelected, setAllDatesSelected] = useState(true);

  // Extract unique parameters from data
  const allParameters = Array.from(new Set(props.data.map(d => d.parameter).filter(Boolean))).map(String);
  const [selectedParameters, setSelectedParameters] = useState<string[]>(allParameters);

  useEffect(() => {
    if (selectedViz === 'correlation') {
      setShowCorrelationInfo(true);
      setCorrelationApproved(false);
    } else {
      setCorrelationApproved(false);
    }
  }, [selectedViz]);

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

  // Filter data by selected dates unless allDatesSelected
  const filteredData = allDatesSelected
    ? props.data
    : props.data.filter(d => selectedDates.includes((d.timestamp as string).split('T')[0]));

  // Type guard to check if data is suitable for BoxPlot
  const isBoxPlotData = Array.isArray(props.data) && props.data.length > 0 &&
    typeof props.data[0].sensor === 'string' &&
    typeof props.data[0].parameter === 'string' &&
    typeof props.data[0].value !== 'undefined';

  // Helper: Outlier detection (per parameter, per date)
  function filterOutliers(data: SensorData[], selectedParameters: string[]) {
    // Group by parameter and date
    const grouped: Record<string, Record<string, SensorData[]>> = {};
    data.forEach(d => {
      const param = d.parameter;
      const date = typeof d.timestamp === 'string' ? d.timestamp.split('T')[0] : '';
      if (!grouped[param]) grouped[param] = {};
      if (!grouped[param][date]) grouped[param][date] = [];
      grouped[param][date].push(d);
    });

    // For each group, compute and filter based on selected method
    Object.keys(grouped).forEach(param => {
      Object.keys(grouped[param]).forEach(date => {
        const values = grouped[param][date]
          .map(d => d.value)
          .filter(v => !isNaN(v));
        
        if (values.length < 4) return; // Not enough data for statistical analysis

        if (outlierMethod === 'IQR') {
          // IQR method
          values.sort((a, b) => a - b);
          const q1 = values[Math.floor(values.length * 0.25)];
          const q3 = values[Math.floor(values.length * 0.75)];
          const iqr = q3 - q1;
          const lower = q1 - outlierThreshold * iqr;
          const upper = q3 + outlierThreshold * iqr;
          grouped[param][date].forEach(d => {
            if (d.value < lower || d.value > upper) {
              d.value = NaN; // Mark as outlier
            }
          });
        } else if (outlierMethod === 'ZSCORE') {
          // Z-Score method
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
          const std = Math.sqrt(variance);
          grouped[param][date].forEach(d => {
            const zScore = Math.abs((d.value - mean) / std);
            if (zScore > outlierThreshold) {
              d.value = NaN; // Mark as outlier
            }
          });
        }
      });
    });

    // Flatten back to array
    return data;
  }

  // Preprocess data for visualization (apply outlier filtering if enabled)
  const processedData = React.useMemo(() => {
    if (selectedViz === 'scatter') return filteredData;
    if (!props.outlierFiltering) return filteredData;
    // Deep copy to avoid mutating original data
    const dataCopy = filteredData.map(d => ({
      ...d,
      value: typeof d.value === 'number' ? d.value : NaN
    }));
    return filterOutliers(dataCopy, selectedParameters);
  }, [filteredData, props.outlierFiltering, selectedParameters, outlierMethod, outlierThreshold, selectedViz]);

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

  // Helper function to compute Pearson correlation
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

  // Wrap outlier filtering toggle handler for correlation section
  const handleOutlierToggle = (value: boolean) => {
    setCorrelationLoading(true);
    props.setOutlierFiltering(value);
    // Wait for React state update and re-render
    setTimeout(() => setCorrelationLoading(false), 400); // Adjust delay as needed
  };

  return (
    <div className="space-y-4">
      {/* Correlation Matrix Info Popup */}
      {showCorrelationInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full text-center">
            <h2 className="text-lg font-semibold mb-2 text-[#8ac6bb]">Correlation Matrix Calculation</h2>
            <p className="mb-4 text-gray-700">Calculating the correlation matrix may take some time, especially for large datasets. Please wait until the calculation is finished.</p>
            <button
              className="mt-2 px-4 py-2 bg-[#8ac6bb] text-white rounded hover:bg-[#7ab6ab] transition-colors"
              onClick={() => {
                setShowCorrelationInfo(false);
                setCorrelationApproved(true);
              }}
            >
              OK
            </button>
            <button
              className="mt-2 ml-4 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
              onClick={() => {
                setShowCorrelationInfo(false);
                setCorrelationApproved(false);
                setSelectedViz('scatter');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center space-x-2 mb-2">
        <label className="text-sm font-medium text-gray-700">Visualization:</label>
        <select
          className="border border-[#b2b27a] rounded px-2 py-1 text-[#8ac6bb] focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
          value={selectedViz}
          onChange={e => setSelectedViz(e.target.value)}
        >
          {VISUALIZATIONS.map(viz => (
            <option key={viz.value} value={viz.value}>{viz.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center space-x-4 mb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowDates(!showDates)}
            className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-[#8ac6bb] transition-colors"
            title="Press to filter dates"
          >
            <span>Select Dates</span>
            <svg
              className={`w-4 h-4 transform transition-transform ${showDates ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        {showDates && (
          <div className="flex flex-col min-w-[200px]">
            {/* Toolbar for Select All / Deselect All */}
            <div className="flex space-x-3 mb-1">
              <button
                type="button"
                className="text-sm font-semibold text-[#8AC6B6] hover:underline px-2 py-1 rounded transition-colors"
                style={{ fontWeight: 600 }}
                onClick={() => {
                  setSelectedDates(allDates);
                  setAllDatesSelected(true);
                }}
              >
                Select All
              </button>
              <button
                type="button"
                className="text-sm font-semibold text-[#8AC6B6] hover:underline px-2 py-1 rounded transition-colors"
                style={{ fontWeight: 600 }}
                onClick={() => {
                  setSelectedDates([]);
                  setAllDatesSelected(false);
                }}
              >
                Deselect All
              </button>
            </div>
            <Select
              isMulti
              options={[
                ...allDates.map(date => ({ value: date, label: date }))
              ]}
              value={
                selectedDates.map(date => ({ value: date, label: date }))
              }
              onChange={selected => {
                if (!selected) {
                  setSelectedDates([]);
                  setAllDatesSelected(false);
                } else {
                  setSelectedDates(selected.map((opt: any) => opt.value));
                  setAllDatesSelected(selected.length === allDates.length);
                }
              }}
              classNamePrefix="select"
              placeholder="Select dates..."
              closeMenuOnSelect={false}
            />
          </div>
        )}
      </div>
      {/* Parameter selection for Scatter and BoxPlot */}
      {selectedViz === 'scatter' && (
        <div className="flex items-center space-x-2 mb-2">
          <label className="text-sm font-medium text-gray-700">Parameters:</label>
          <div className="min-w-[200px]">
            <Select
              isMulti
              options={[
                ...allParameters.map(param => ({ value: param, label: param }))
              ]}
              value={
                selectedParameters.map(param => ({ value: param, label: param }))
              }
              onChange={selected => {
                if (!selected) {
                  setSelectedParameters([]);
                } else {
                  setSelectedParameters(selected.map((opt: any) => opt.value));
                }
              }}
              classNamePrefix="select"
              placeholder="Select parameters..."
              closeMenuOnSelect={false}
            />
          </div>
        </div>
      )}
      {['box', 'histogram'].includes(selectedViz) && (
        <div className="flex items-center space-x-2 mb-2">
          <label className="text-sm font-medium text-gray-700">Parameters:</label>
          <div className="min-w-[200px]">
            <Select
              isMulti
              options={[
                ...allParameters.map(param => ({ value: param, label: param }))
              ]}
              value={
                selectedParameters.map(param => ({ value: param, label: param }))
              }
              onChange={selected => {
                if (!selected) {
                  setSelectedParameters([]);
                } else {
                  setSelectedParameters(selected.map((opt: any) => opt.value));
                }
              }}
              classNamePrefix="select"
              placeholder="Select parameters..."
              closeMenuOnSelect={false}
            />
          </div>
          {/* Outlier toggle next to parameters */}
          <OutlierToggle 
            enabled={props.outlierFiltering} 
            onChange={props.setOutlierFiltering}
            method={outlierMethod}
            threshold={outlierThreshold}
            onMethodChange={setOutlierMethod}
            onThresholdChange={setOutlierThreshold}
            visualizationType={selectedViz === 'box' ? 'boxplot' : 'histogram'}
          />
        </div>
      )}
      <div>
        {(selectedViz === 'scatter' || selectedViz === 'box') && (
          <div className="flex items-center justify-center mb-4 space-x-4">
            <div className="inline-flex rounded-md shadow-sm bg-gray-100" role="group">
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border border-gray-300 focus:z-10 focus:ring-2 focus:ring-[#8ac6bb] focus:text-[#8ac6bb] ${props.groupBy === 'sensor' ? 'bg-[#8ac6bb] text-white' : 'bg-white text-gray-700'}`}
                onClick={() => props.setGroupBy && props.setGroupBy('sensor')}
              >
                Group by Sensor
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border border-gray-300 focus:z-10 focus:ring-2 focus:ring-[#8ac6bb] focus:text-[#8ac6bb] ${props.groupBy === 'label' ? 'bg-[#8ac6bb] text-white' : 'bg-white text-gray-700'}`}
                onClick={() => props.setGroupBy && props.setGroupBy('label')}
              >
                Group by Label
              </button>
            </div>
            
            {/* Error Type Selection - Only show for scatter plot */}
            {props.groupBy === 'label' && selectedViz === 'scatter' && (
              <div className="flex items-center space-x-2">
                <div className="relative group">
                  <select
                    value={props.errorType}
                    onChange={(e) => props.setErrorType && props.setErrorType(e.target.value as 'STD' | 'SE')}
                    className="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
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
        {isLoading ? (
          <div className="h-[calc(70vh-280px)] w-full flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#8ac6bb] border-t-transparent"></div>
              <p className="mt-4 text-gray-600">Loading visualization...</p>
            </div>
          </div>
        ) : (
          <>
            {selectedViz === 'scatter' && (
              <div className="flex justify-center">
                <ScatterPlot
                  data={filteredData}
                  selectedParameters={selectedParameters}
                  selectedSensors={props.selectedSensors}
                  experimentName={props.experimentName}
                  getSensorColor={props.getSensorColor}
                  getParameterUnit={getParameterUnit}
                  sensorLabelMap={props.sensorLabelMap}
                  groupBy={props.groupBy}
                  includedLabels={props.includedLabels}
                  errorType={props.errorType}
                />
              </div>
            )}
            {selectedViz === 'box' && isBoxPlotData && (
              <div className="flex justify-center">
                <BoxPlot
                  data={processedData}
                  selectedParameters={selectedParameters}
                  selectedSensors={props.selectedSensors}
                  experimentName={props.experimentName}
                  getSensorColor={props.getSensorColor}
                  getParameterUnit={getParameterUnit}
                  onParameterLimitExceeded={() => {
                    setSelectedParameters(selectedParameters.slice(0, 2));
                  }}
                  combine={false}
                  groupBy={props.groupBy || 'label'}
                  sensorLabelMap={props.sensorLabelMap}
                  includedLabels={props.includedLabels}
                />
              </div>
            )}
            {selectedViz === 'histogram' && (
              <div className="flex justify-center">
                <Histogram
                  data={processedData}
                  selectedParameters={selectedParameters}
                  selectedSensors={props.selectedSensors}
                  experimentName={props.experimentName}
                  getSensorColor={props.getSensorColor}
                  getParameterUnit={getParameterUnit}
                  sensorLabelMap={props.sensorLabelMap}
                  includedLabels={props.includedLabels}
                />
              </div>
            )}
          </>
        )}
        {selectedViz === 'correlation' && correlationApproved && (
          <div className="space-y-4 relative">
            {/* Outlier Filtering Toggle for Correlation Matrix */}
            <div className="mb-2 flex items-center justify-start">
              <OutlierToggle
                enabled={props.outlierFiltering}
                onChange={handleOutlierToggle}
                method="IQR"
                disabled={correlationLoading}
                visualizationType="boxplot"
              />
            </div>
            {/* Loading spinner overlay */}
            {correlationLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-60 z-10">
                <LoadingSpinner size="large" text="Processing outlier filtering..." />
              </div>
            )}
            {allParameters.length < 2 ? (
              <div className="text-center p-4 bg-yellow-50 text-yellow-700 rounded">
                Please select at least 2 parameters to view correlations
              </div>
            ) :
              <>
                <div className="grid grid-cols-2 gap-4">
                  {/* Correlation Matrix */}
                  <div>
                    <CorrelationMatrix
                      data={processedData}
                      selectedParameters={allParameters}
                      selectedSensors={props.selectedSensors}
                      getParameterUnit={getParameterUnit}
                      onCellClick={(param1, param2) => setSelectedCorrelationPair({ param1, param2 })}
                    />
                  </div>

                  {/* Selected Correlation Scatter Plot */}
                  <div>
                    {selectedCorrelationPair ? (
                      <CorrelationScatter
                        data={processedData}
                        param1={selectedCorrelationPair.param1}
                        param2={selectedCorrelationPair.param2}
                        correlation={correlationData?.matrix[
                          correlationData.parameters.indexOf(selectedCorrelationPair.param1)
                        ][
                          correlationData.parameters.indexOf(selectedCorrelationPair.param2)
                        ] || 0}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-gray-500">
                        Click on a cell in the correlation matrix to view the scatter plot
                      </div>
                    )}
                  </div>

                  {/* Top/Bottom Correlations */}
                  <div className="col-span-2">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">Top/Bottom Correlations</h3>
                      <select
                        value={numCorrelationPairs}
                        onChange={(e) => setNumCorrelationPairs(Number(e.target.value))}
                        className="border border-[#b2b27a] rounded px-2 py-1"
                      >
                        <option value={2}>Top/Bottom 2</option>
                        <option value={3}>Top/Bottom 3</option>
                        <option value={5}>Top/Bottom 5</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Top Correlations */}
                      <div>
                        <h4 className="text-md font-medium mb-2">Highest Correlations</h4>
                        {correlationData?.topCorrelations.map((corr, i) => (
                          <div key={i} className="mb-4">
                            <CorrelationScatter
                              data={processedData}
                              param1={corr.param1}
                              param2={corr.param2}
                              correlation={corr.correlation}
                            />
                          </div>
                        ))}
                      </div>
                      {/* Bottom Correlations */}
                      <div>
                        <h4 className="text-md font-medium mb-2">Lowest Correlations</h4>
                        {correlationData?.bottomCorrelations.map((corr, i) => (
                          <div key={i} className="mb-4">
                            <CorrelationScatter
                              data={processedData}
                              param1={corr.param1}
                              param2={corr.param2}
                              correlation={corr.correlation}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default VisualizationPanel; 