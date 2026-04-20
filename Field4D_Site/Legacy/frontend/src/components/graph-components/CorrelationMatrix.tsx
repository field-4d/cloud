import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import LoadingSpinner from './LoadingSpinner';

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
  distanceFromPlot: 75,
};

interface SensorData {
  timestamp: string;
  parameter: string;
  value: number;
  [key: string]: string | number;
}

interface CorrelationMatrixProps {
  data: SensorData[];
  selectedParameters: string[];
  selectedSensors: string[];
  experimentName?: string;
  getParameterUnit?: (parameter: string) => string;
  onCellClick?: (param1: string, param2: string) => void;
  axisConfig?: AxisConfig; // Optional axis configuration
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

const CorrelationMatrix: React.FC<CorrelationMatrixProps> = ({
  data,
  selectedParameters,
  selectedSensors,
  experimentName = '',
  getParameterUnit = () => '',
  onCellClick,
  axisConfig = defaultAxisConfig, // Use default config if not provided
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const plotWidth = 800;
  const plotHeight = 600;

  // Compute correlation matrix
  const correlationData = useMemo(() => {
    setIsLoading(true);
    if (selectedParameters.length < 2) {
      setIsLoading(false);
      return null;
    }

    // Prepare data for correlation computation
    const paramData: { [key: string]: number[] } = {};
    selectedParameters.forEach(param => {
      paramData[param] = data
        .filter(d => d.parameter === param)
        .map(d => Number(d.value))
        .filter(v => !isNaN(v));
    });

    // Compute correlation matrix
    const matrix: number[][] = [];
    const correlations: Array<{param1: string; param2: string; correlation: number}> = [];

    selectedParameters.forEach((param1, i) => {
      const row: number[] = [];
      selectedParameters.forEach((param2, j) => {
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

    const result = {
      matrix,
      parameters: selectedParameters,
      topCorrelations: correlations.slice(0, 2),
      bottomCorrelations: correlations.slice(-2)
    };

    // Simulate a small delay to show loading state
    setTimeout(() => setIsLoading(false), 300);
    return result;
  }, [data, selectedParameters]);

  if (isLoading) {
    return (
      <LoadingSpinner 
        size="large" 
        text="Computing correlation matrix..."
      />
    );
  }

  if (!correlationData) {
    return (
      <div className="text-center p-4 bg-yellow-50 text-yellow-700 rounded">
        Please select at least 2 parameters to view correlations
      </div>
    );
  }

  return (
    <div style={{ width: plotWidth, height: plotHeight }}>
    <Plot
      data={[
        {
          z: correlationData.matrix,
          x: correlationData.parameters,
          y: correlationData.parameters,
          type: 'heatmap',
          colorscale: 'RdBu',
          zmin: -1,
          zmax: 1,
          hoverongaps: false,
          hoverinfo: 'x+y+z',
          text: correlationData.matrix.map(row => 
            row.map(val => val.toFixed(2))
          ),
          texttemplate: '%{text}',
          textfont: { color: 'white' }
        }
      ]}
      layout={{
          title: {
            text: `${experimentName} - Correlation Matrix`,
            font: { size: axisConfig.textSize },
            y: 0.98,
            yanchor: 'bottom',
          },
          xaxis: {
            title: 'Parameters',
            titlefont: { size: axisConfig.textSize },
            tickfont: { size: axisConfig.tickSize },
            ticktext: selectedParameters.map(label => `${label} (${getParameterUnit(label)})`),
            tickvals: selectedParameters,
            standoff: axisConfig.distanceFromPlot,
          },
          yaxis: {
            title: 'Parameters',
            titlefont: { size: axisConfig.textSize },
            tickfont: { size: axisConfig.tickSize },
            ticktext: selectedParameters.map(label => `${label} (${getParameterUnit(label)})`),
            tickvals: selectedParameters,
            standoff: axisConfig.distanceFromPlot,
          },
        height: 500,
        margin: { t: 50, b: 100, l: 100, r: 50 }
      }}
      onClick={(event) => {
        if (isLoading) return; // Prevent clicks while loading
        if (event.points && event.points[0] && onCellClick) {
          const { x, y } = event.points[0];
          onCellClick(x, y);
        }
      }}
      config={{
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false,
        // Add cursor style based on loading state
        staticPlot: isLoading
      }}
    />
    </div>
  );
};

export default CorrelationMatrix; 