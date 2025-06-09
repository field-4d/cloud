import React, { useState, useEffect, useMemo } from 'react';
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

interface CorrelationScatterProps {
  data: SensorData[];
  param1: string;
  param2: string;
  correlation: number;
  axisConfig?: AxisConfig; // Optional axis configuration
}

// Parameter units mapping
const PARAMETER_UNITS: { [key: string]: string } = {
  'RH': '%',
  'Temperature': '°C',
  'VPD': 'kPa',
  'PAR': 'μmol/m²/s',
  'CO2': 'ppm',
  'Pressure': 'kPa',
  'Wind Speed': 'm/s',
  'Wind Direction': '°',
  'Rain': 'mm',
  'Soil Moisture': '%',
  'Leaf Temperature': '°C',
  'Stomatal Conductance': 'mmol/m²/s',
  'Photosynthesis': 'μmol/m²/s',
  'Transpiration': 'mmol/m²/s',
  'Water Potential': 'MPa',
  'Chlorophyll': 'SPAD',
  'NDVI': 'unitless',
  'LAI': 'm²/m²',
  'Biomass': 'g/m²',
  'Yield': 'kg/ha',
};

// Helper function to get parameter unit
const getParameterUnit = (param: string): string => {
  // Try exact match first
  if (PARAMETER_UNITS[param]) {
    return PARAMETER_UNITS[param];
  }
  
  // Try case-insensitive match
  const paramLower = param.toLowerCase();
  const match = Object.keys(PARAMETER_UNITS).find(key => 
    key.toLowerCase() === paramLower
  );
  
  return match ? PARAMETER_UNITS[match] : '';
};

const CorrelationScatter: React.FC<CorrelationScatterProps> = ({ 
  data, 
  param1, 
  param2, 
  correlation,
  axisConfig = defaultAxisConfig, // Use default config if not provided
}) => {
  const [isLoading, setIsLoading] = useState(true);

  // Memoize parameter units
  const param1Unit = useMemo(() => getParameterUnit(param1), [param1]);
  const param2Unit = useMemo(() => getParameterUnit(param2), [param2]);

  // Memoize axis titles
  const axisTitles = useMemo(() => ({
    x: param1Unit ? `${param1} (${param1Unit})` : param1,
    y: param2Unit ? `${param2} (${param2Unit})` : param2
  }), [param1, param2, param1Unit, param2Unit]);

  // Memoize filtered data
  const filteredData = useMemo(() => {
    const xData = data
      .filter(d => d.parameter === param1)
      .map(d => Number(d.value))
      .filter(v => !isNaN(v));

    const yData = data
      .filter(d => d.parameter === param2)
      .map(d => Number(d.value))
      .filter(v => !isNaN(v));

    return { xData, yData };
  }, [data, param1, param2]);

  // Memoize regression statistics
  const regressionStats = useMemo(() => {
    const { xData, yData } = filteredData;

    if (xData.length === 0 || yData.length === 0) {
      return { slope: 0, intercept: 0, rSquared: 0 };
    }

    const n = xData.length;
    const sumX = xData.reduce((a, b) => a + b, 0);
    const sumY = yData.reduce((a, b) => a + b, 0);
    const sumXY = xData.reduce((a, b, i) => a + b * yData[i], 0);
    const sumX2 = xData.reduce((a, b) => a + b * b, 0);
    const sumY2 = yData.reduce((a, b) => a + b * b, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const rSquared = correlation * correlation;

    return { slope, intercept, rSquared };
  }, [filteredData, correlation]);

  // Memoize regression line points
  const regressionLine = useMemo(() => {
    const { xData } = filteredData;
    const xMin = Math.min(...xData);
    const xMax = Math.max(...xData);
    return {
      x: [xMin, xMax],
      y: [xMin, xMax].map(x => regressionStats.slope * x + regressionStats.intercept)
    };
  }, [filteredData, regressionStats]);

  // Memoize equation string
  const equation = useMemo(() => 
    `y = ${regressionStats.slope.toFixed(2)}x ${regressionStats.intercept >= 0 ? '+' : ''}${regressionStats.intercept.toFixed(2)}`,
    [regressionStats]
  );

  // Memoize plot data
  const plotData = useMemo(() => [
    {
      x: filteredData.xData,
      y: filteredData.yData,
      type: 'scatter',
      mode: 'markers',
      name: 'Data Points',
      marker: {
        color: '#8AC6B6',
        size: 8,
        opacity: 0.7
      }
    },
    {
      x: regressionLine.x,
      y: regressionLine.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Regression Line',
      line: {
        color: '#000000',
        width: 2
      }
    }
    
  ], [filteredData, regressionLine]);

  // Memoize layout
  const layout = useMemo(() => ({
    title: {
      text: `Correlation Analysis: ${param1} vs ${param2}`,
      font: {
        size: axisConfig.textSize,
        color: '#8AC6B6'
      }
    },
    xaxis: { 
      title: {
        text: axisTitles.x,
        font: {
          size: axisConfig.textSize,
          color: '#8AC6B6'
        },
        standoff: axisConfig.distanceFromPlot,
      },
      tickfont: {
        size: axisConfig.tickSize,
        color: '#8AC6B6'
      }
    },
    yaxis: { 
      title: {
        text: axisTitles.y,
        font: {
          size: axisConfig.textSize,
          color: '#8AC6B6'
        },
        standoff: axisConfig.distanceFromPlot,
      },
      tickfont: {
        size: axisConfig.tickSize,
        color: '#8AC6B6'
      }
    },
    height: 300,
    margin: { t: 80, b: 120, l: 60, r: 40 },
    showlegend: true,
    legend: {
      x: 0.5,
      y: 1.1,
      orientation: 'h'
    },
    annotations: [
      {
        x: 0.01,
        y: -0.55,
        xref: 'paper',
        yref: 'paper',
        text: `R² = ${regressionStats.rSquared.toFixed(3)}`,
        showarrow: false,
        font: {
          size: axisConfig.textSize,
          color: '#8AC6B6'
        },
        align: 'left'
      },
      {
        x: 0.01,
        y: -0.75,
        xref: 'paper',
        yref: 'paper',
        text: equation,
        showarrow: false,
        font: {
          size: axisConfig.textSize,
          color: '#8AC6B6'
        },
        align: 'left'
      }
    ]
  }), [param1, param2, axisTitles, regressionStats, equation, axisConfig]);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, [data, param1, param2, correlation]);

  if (isLoading) {
    return (
      <LoadingSpinner 
        size="medium" 
        text={`Loading correlation between ${param1} and ${param2}...`}
      />
    );
  }

  return (
    <Plot
      data={plotData}
      layout={layout}
      config={{
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false
      }}
    />
  );
};

export default React.memo(CorrelationScatter); 