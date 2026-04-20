/*
 * ANOVAResultsScatterPlot.tsx
 * Renders a scatter plot with ANOVA results overlaid, showing significant differences.
 * Reuses the existing ScatterPlot component for consistent visuals and interactions.
 */

import React, { useMemo, useState, useEffect } from 'react';
import ScatterPlot from './ScatterPlot';
import LabelWarningPlaceholder from './LabelWarningPlaceholder';
import { getParameterUnit } from '../DataSelector';

interface SensorData {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number;
  [key: string]: any;
}

interface ANOVAResult {
  timestamp: string;
  groups_tested: string[];
  group_stats: Record<string, {
    mean: number;
    standard_error: number;
    n: number;
  }>;
  significant_differences: Array<{
    comparison: string;
    p_value: number;
    reject_null: boolean;
  }>;
  letters_report: Record<string, string>;
}

interface AnalysisResults {
  parameter: string;
  test_type: string;
  batch_size: number;
  user: string;
  results: ANOVAResult[];
  metadata: {
    interval: string;
    total_days: number;
    total_timestamps: number;
    groups_count: number;
  };
}

interface ANOVAResultsScatterPlotProps {
  data: SensorData[];
  analysisResults: AnalysisResults | null;
  selectedLabels: string[];
  parameter: string;
  experimentName?: string;
  getSensorColor?: (sensor: string) => string;
  sensorLabelMap: Record<string, string[]>;
  includedLabels: string[];
  zoomLevel?: number;
}

/**
 * ANOVAResultsScatterPlot
 * Displays scatter plot with ANOVA results overlaid, showing significant differences.
 * Reuses existing ScatterPlot component for consistent visuals and interactions.
 * @param data - array of sensor data objects
 * @param analysisResults - ANOVA analysis results
 * @param selectedLabels - labels selected for analysis
 * @param parameter - parameter being analyzed
 * @param experimentName - (optional) experiment name for plot title
 * @param getSensorColor - (optional) function to get color for a sensor
 * @param sensorLabelMap - mapping of sensors to labels
 * @param includedLabels - labels included in the analysis
 * @param zoomLevel - current zoom level for performance optimization
 * @returns JSX.Element
 */
const ANOVAResultsScatterPlot: React.FC<ANOVAResultsScatterPlotProps> = ({
  data,
  analysisResults,
  selectedLabels,
  parameter,
  experimentName = '',
  getSensorColor,
  sensorLabelMap,
  includedLabels,
  zoomLevel = 1,
}) => {
  const [plotDimensions, setPlotDimensions] = useState({ width: 1800, height: 750 });

  // Calculate responsive plot dimensions based on screen size and zoom
  useEffect(() => {
    const calculateDimensions = () => {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const zoomLevel = window.devicePixelRatio || 1;
      
      // Base dimensions that work well on most screens
      let baseWidth = 1800;
      let baseHeight = 750;
      
      // Adjust for smaller screens
      if (screenWidth < 1200) {
        baseWidth = Math.max(800, screenWidth - 100); // Leave some margin
        baseHeight = Math.max(400, (baseWidth * 750) / 1800); // Maintain aspect ratio
      } else if (screenWidth < 1600) {
        baseWidth = Math.max(1200, screenWidth - 150);
        baseHeight = Math.max(500, (baseWidth * 750) / 1800);
      }
      
      // Adjust for zoom level
      const adjustedWidth = Math.round(baseWidth / zoomLevel);
      const adjustedHeight = Math.round(baseHeight / zoomLevel);
      
      setPlotDimensions({
        width: adjustedWidth,
        height: adjustedHeight
      });
    };

    // Calculate initial dimensions
    calculateDimensions();

    // Recalculate on window resize and zoom changes
    const handleResize = () => {
      calculateDimensions();
    };

    window.addEventListener('resize', handleResize);
    
    // Listen for zoom changes (this is a bit tricky, but we can use a MutationObserver)
    const observer = new MutationObserver(handleResize);
    observer.observe(document.body, { 
      attributes: true, 
      attributeFilter: ['style'] 
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  // Label requirement enforcement - same as Group by Label
  if (!includedLabels || includedLabels.length === 0) {
    return <LabelWarningPlaceholder fontColor="#8AC6BB" fontSize={20} />;
  }

  // Merge sensor data with ANOVA results for significance highlighting
  const enhancedData = useMemo(() => {
    if (!analysisResults) return data;

    // Create a map of ANOVA results by timestamp for quick lookup
    const anovaMap = new Map<string, ANOVAResult>();
    analysisResults.results.forEach(result => {
      anovaMap.set(result.timestamp, result);
    });

    // Enhance sensor data with ANOVA significance information
    return data.map(sensorData => {
      const anovaResult = anovaMap.get(sensorData.timestamp);
      
      if (anovaResult) {
        // Find if this data point is part of a significant comparison
        const isSignificant = anovaResult.significant_differences.some(diff => 
          diff.reject_null && diff.p_value < 0.05
        );
        
        const significanceLevel = anovaResult.significant_differences.some(diff => 
          diff.reject_null && diff.p_value < 0.001
        ) ? 'high' : isSignificant ? 'medium' : 'none';

        return {
          ...sensorData,
          _anovaSignificant: isSignificant,
          _anovaSignificanceLevel: significanceLevel,
          _anovaPValue: anovaResult.significant_differences[0]?.p_value || null,
          _anovaComparison: anovaResult.significant_differences[0]?.comparison || null,
        };
      }

      return {
        ...sensorData,
        _anovaSignificant: false,
        _anovaSignificanceLevel: 'none',
        _anovaPValue: null,
        _anovaComparison: null,
      };
    });
  }, [data, analysisResults]);

  // Performance optimization: downsample data based on zoom level
  const optimizedData = useMemo(() => {
    if (enhancedData.length <= 1000) return enhancedData as SensorData[]; // No optimization needed for small datasets

    const downsamplingFactor = zoomLevel < 0.5 ? 10 : zoomLevel < 1 ? 3 : 1;
    const step = Math.max(1, Math.floor(enhancedData.length / (enhancedData.length / downsamplingFactor)));
    
    return enhancedData.filter((_, index) => index % step === 0) as SensorData[];
  }, [enhancedData, zoomLevel]);

  // Prepare parameters for ScatterPlot (single parameter for ANOVA analysis)
  const selectedParameters = [parameter];

  // Get unique sensors from the data
  const selectedSensors = Array.from(new Set(optimizedData.map(d => d.sensor)));

  return (
    <div className="space-y-4">
      {/* Performance Info */}
      {optimizedData.length < data.length && (
        <div className="text-sm text-gray-500 text-center">
          Showing {optimizedData.length} of {data.length} points for performance
        </div>
      )}

      {/* ANOVA Results Legend */}
      {analysisResults && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h4 className="text-lg font-medium text-gray-700 mb-3">📊 Significance Legend</h4>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full border-2 border-red-500 bg-red-100"></div>
              <span>Highly Significant (p &lt; 0.001)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full border-2 border-orange-500 bg-orange-100"></div>
              <span>Significant (p &lt; 0.05)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full border-2 border-gray-300 bg-gray-100"></div>
              <span>Non-significant</span>
            </div>
          </div>
        </div>
      )}

      {/* Scatter Plot */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <ScatterPlot
          data={optimizedData}
          selectedParameters={selectedParameters}
          selectedSensors={selectedSensors}
          experimentName={`${experimentName} - ANOVA Results`}
          getSensorColor={getSensorColor}
          getParameterUnit={getParameterUnit}
          sensorLabelMap={sensorLabelMap}
          groupBy="label"
          includedLabels={includedLabels}
          errorType="SE"
          plotWidth={plotDimensions.width}
          plotHeight={plotDimensions.height}
        />
      </div>
    </div>
  );
};

export default ANOVAResultsScatterPlot; 