/*
 * DataSelector.tsx
 * Component for selecting experiment, date range, sensors, and parameters.
 * Handles data fetching, mock data generation, and visualization panel.
 */

import React, { useState, useEffect } from 'react';
import { Range, RangeKeyDict } from 'react-date-range';
import Plot from 'react-plotly.js';
import Select, { MultiValue, components, OptionProps } from 'react-select';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import VisualizationPanel from './VisualizationPanel';
import { API_ENDPOINTS } from '../config';
import { logger } from '../config/logger';
import LabelFilter from './LabelFilter';

// Initialize dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set the timezone to Israel
const TIMEZONE = 'Asia/Jerusalem';

interface ExperimentSummary {
  experimentName: string;
  firstTimestamp: { value: string };
  lastTimestamp: { value: string };
  sensorTypes: string[];
  parameters?: string[];
  sensorLabelOptions?: string[];
  sensorLabelMap?: Record<string, string[]>;
}

interface ParameterOption {
  value: string;
  label: string;
  unit: string;
}

interface DataSelectorProps {
  experimentSummaries: ExperimentSummary[];
  selectedExperiment: string;
  onExperimentChange: (experiment: string) => void;
  dateRange: [Date | null, Date | null];
  onDateChange: (item: RangeKeyDict) => void;
  dateState: Range[];
  minDate: Date | null;
  maxDate: Date | null;
  table_id: string;
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
  [key: string]: string | number;
}

interface SensorOption {
  value: string;
  label: string;
}

interface SensorDataRow {
  timestamp: string;
  sensor_name: string;
  [key: string]: string | number | null;
}

const Y_AXIS_COLORS = ['#8ac6bb', '#b2b27a', '#e6a157'];

// Custom Option components with checkbox
const ParameterOption = (props: OptionProps<ParameterOption, true>) => {
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
          <span>{props.label}</span>
        </div>
      </components.Option>
    </div>
  );
};

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
          <span>{props.label}</span>
        </div>
      </components.Option>
    </div>
  );
};

// Add this after the interfaces and before the DataSelector component
const PARAMETER_OPTIONS = [
  {
    label: 'Basic Environmental',
    options: [
      { value: 'temperature', label: 'Temperature', unit: '°C' },
      { value: 'humidity', label: 'Humidity', unit: '%' },
      { value: 'barometric_pressure', label: 'Barometric Pressure', unit: 'hPa' },
      { value: 'light', label: 'Light', unit: 'lux' },
      { value: 'co2_ppm', label: 'CO2 (PPM)', unit: 'ppm' },
      { value: 'air_velocity', label: 'Air Velocity', unit: 'm/s' }
    ]
  },
  {
    label: 'BMP390 Sensors',
    options: [
      { value: 'bmp_390_u18_pressure', label: 'BMP390 U18 Pressure', unit: 'hPa' },
      { value: 'bmp_390_u18_temperature', label: 'BMP390 U18 Temperature', unit: '°C' },
      { value: 'bmp_390_u19_pressure', label: 'BMP390 U19 Pressure', unit: 'hPa' },
      { value: 'bmp_390_u19_temperature', label: 'BMP390 U19 Temperature', unit: '°C' }
    ]
  },
  {
    label: 'HDC2010 Sensors',
    options: [
      { value: 'hdc_2010_u13_temperature', label: 'HDC2010 U13 Temperature', unit: '°C' },
      { value: 'hdc_2010_u13_humidity', label: 'HDC2010 U13 Humidity', unit: '%' },
      { value: 'hdc_2010_u16_temperature', label: 'HDC2010 U16 Temperature', unit: '°C' },
      { value: 'hdc_2010_u16_humidity', label: 'HDC2010 U16 Humidity', unit: '%' },
      { value: 'hdc_2010_u17_temperature', label: 'HDC2010 U17 Temperature', unit: '°C' },
      { value: 'hdc_2010_u17_humidity', label: 'HDC2010 U17 Humidity', unit: '%' }
    ]
  },
  {
    label: 'OPT3001 Light Sensors',
    options: [
      { value: 'opt_3001_u1_light_intensity', label: 'OPT3001 U1 Light', unit: 'lux' },
      { value: 'opt_3001_u2_light_intensity', label: 'OPT3001 U2 Light', unit: 'lux' },
      { value: 'opt_3001_u3_light_intensity', label: 'OPT3001 U3 Light', unit: 'lux' },
      { value: 'opt_3001_u4_light_intensity', label: 'OPT3001 U4 Light', unit: 'lux' },
      { value: 'opt_3001_u5_light_intensity', label: 'OPT3001 U5 Light', unit: 'lux' }
    ]
  },
  {
    label: 'ZTP315 Temperature Sensors',
    options: [
      { value: 'ztp_315_surface_temperature', label: 'ZTP315 Surface Temp', unit: '°C' },
      { value: 'ztp_315_ambient_temperature', label: 'ZTP315 Ambient Temp', unit: '°C' },
      { value: 'ztp_315_object_temperature', label: 'ZTP315 Object Temp', unit: '°C' },
      { value: 'ztp_315_voltage_output', label: 'ZTP315 Voltage Output', unit: 'V' },
      { value: 'ztp_315_temperature_offset', label: 'ZTP315 Temp Offset', unit: '°C' },
      { value: 'ztp_315_emissivity', label: 'ZTP315 Emissivity', unit: '' },
      { value: 'ztp_315_calibrated_temperature', label: 'ZTP315 Calibrated Temp', unit: '°C' }
    ]
  },
  {
    label: 'IIS3DHHC Motion Sensors',
    options: [
      { value: 'iis3dhhc_tilt_angle', label: 'IIS3DHHC Tilt Angle', unit: '°' },
      { value: 'iis3dhhc_y_acceleration', label: 'IIS3DHHC Y Acceleration', unit: 'g' },
      { value: 'iis3dhhc_x_acceleration', label: 'IIS3DHHC X Acceleration', unit: 'g' },
      { value: 'iis3dhhc_z_acceleration', label: 'IIS3DHHC Z Acceleration', unit: 'g' },
      { value: 'iis3dhhc_yaw_angle', label: 'IIS3DHHC Yaw Angle', unit: '°' },
      { value: 'iis3dhhc_azimuth_angle', label: 'IIS3DHHC Azimuth Angle', unit: '°' },
      { value: 'iis3dhhc_temperature', label: 'IIS3DHHC Temperature', unit: '°C' },
      { value: 'iis3dhhc_roll_angle', label: 'IIS3DHHC Roll Angle', unit: '°' },
      { value: 'iis3dhhc_pitch_angle', label: 'IIS3DHHC Pitch Angle', unit: '°' }
    ]
  },
  {
    label: 'System Parameters',
    options: [
      { value: 'battery', label: 'Battery Level', unit: '%' },
      { value: 'batmon_temperature', label: 'Battery Temperature', unit: '°C' },
      { value: 'batmon_battery_voltage', label: 'Battery Voltage', unit: 'V' },
      { value: 'rssi', label: 'RSSI', unit: 'dBm' },
      { value: 'tmp107_amb', label: 'TMP107 Ambient', unit: '°C' },
      { value: 'tmp107_obj', label: 'TMP107 Object', unit: '°C' },
      { value: 'barometric_temp', label: 'Barometric Temperature', unit: '°C' }
    ]
  }
];

// Add this after the imports and before the DataSelector component
const generateColorFromString = (str: string): string => {
  // Improved hash function for better color distribution
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Use golden ratio to distribute colors evenly
  const goldenRatio = 0.618033988749895;
  const hue = (hash * goldenRatio) % 1;
  
  // Convert to HSL with better distribution
  const h = Math.floor(hue * 360);
  const s = 70 + (Math.abs(hash) % 15); // Saturation: 70-85%
  const l = 50 + (Math.abs(hash) % 10); // Lightness: 50-60%
  
  return `hsl(${h}, ${s}%, ${l}%)`;
};

// Cache for sensor colors
const sensorColorCache: Record<string, string> = {};

const getSensorColor = (sensorName: string): string => {
  if (!sensorColorCache[sensorName]) {
    sensorColorCache[sensorName] = generateColorFromString(sensorName);
  }
  return sensorColorCache[sensorName];
};

// Add a helper function to get parameter unit
export const getParameterUnit = (parameter: string): string => {
  for (const group of PARAMETER_OPTIONS) {
    const option = group.options.find(opt => opt.value === parameter);
    if (option) {
      return option.unit;
    }
  }
  return ''; // Return empty string if no unit found
};

/**
 * DataSelector
 * Allows user to select experiment, date range, sensors, and parameters.
 * Fetches and transforms data for visualization.
 * @param experimentSummaries - list of experiment summary objects
 * @param selectedExperiment - currently selected experiment name
 * @param onExperimentChange - callback for experiment change
 * @param dateRange - [start, end] date tuple
 * @param onDateChange - callback for date range change
 * @param dateState - react-date-range state
 * @param minDate, maxDate - date bounds
 * @param table_id - BigQuery table ID
 * @returns JSX.Element
 */
const DataSelector: React.FC<DataSelectorProps> = ({ 
  experimentSummaries, 
  selectedExperiment,
  onExperimentChange,
  dateRange,
  dateState,
  minDate,
  maxDate,
  table_id
}) => {
  const [selectedSensors, setSelectedSensors] = useState<string[]>([]);
  const [visualizedSensors, setVisualizedSensors] = useState<string[]>([]);
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
  const [availableSensors, setAvailableSensors] = useState<string[]>([]);
  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [showVisualization, setShowVisualization] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showLabelFilter, setShowLabelFilter] = useState(false);
  const [includedLabels, setIncludedLabels] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'sensor' | 'label'>('sensor');

  // Get current experiment and check if it has label options
  const currentExperiment = experimentSummaries.find(exp => exp.experimentName === selectedExperiment);
  const hasLabelOptions = Boolean(currentExperiment?.sensorLabelOptions?.length);

  // Outlier filtering state (single source of truth)
  const [outlierFiltering, setOutlierFiltering] = React.useState<boolean>(false);

  // Helper: IQR-based outlier detection (same as in VisualizationPanel)
  function filterOutliersIQR(data, selectedParameters) {
    const grouped = {};
    data.forEach(d => {
      const param = d.parameter;
      const date = typeof d.timestamp === 'string' ? d.timestamp.split('T')[0] : '';
      if (!grouped[param]) grouped[param] = {};
      if (!grouped[param][date]) grouped[param][date] = [];
      grouped[param][date].push(d);
    });
    Object.keys(grouped).forEach(param => {
      Object.keys(grouped[param]).forEach(date => {
        const values = grouped[param][date].map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
        if (values.length < 4) return;
        values.sort((a, b) => a - b);
        const q1 = values[Math.floor(values.length * 0.25)];
        const q3 = values[Math.floor(values.length * 0.75)];
        const iqr = q3 - q1;
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;
        grouped[param][date].forEach(d => {
          if (d.value < lower || d.value > upper) {
            d.value = null;
          }
        });
      });
    });
    return data;
  }

  // Use processed data for CSV export if filtering is enabled
  const processedSensorData = React.useMemo(() => {
    if (!outlierFiltering) return sensorData;
    const dataCopy = sensorData.map(d => ({ ...d }));
    return filterOutliersIQR(dataCopy, selectedParameters);
  }, [sensorData, outlierFiltering, selectedParameters]);

  // Reset and update available data when experiment changes
  useEffect(() => {
    if (selectedExperiment) {
      const experimentData = experimentSummaries.find(
        exp => exp.experimentName === selectedExperiment
      );
      if (experimentData) {
        setAvailableSensors(experimentData.sensorTypes);
        setAvailableParameters(experimentData.parameters || []);
        setSelectedSensors([]);
        setSelectedParameters([]);
        setSensorData([]);
        setShowVisualization(false);
        setShowLabelFilter(!!experimentData.sensorLabelOptions?.length);
      }
    } else {
      setAvailableSensors([]);
      setAvailableParameters([]);
      setSelectedSensors([]);
      setSelectedParameters([]);
      setSensorData([]);
      setShowVisualization(false);
      setShowLabelFilter(false);
    }
  }, [selectedExperiment, experimentSummaries]);

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
    setSelectedSensors(selectedOptions.map(option => option.value));
  };

  // Convert availableSensors to options format for react-select and sort alphabetically
  const sensorOptions: SensorOption[] = availableSensors
    .sort((a, b) => a.localeCompare(b))
    .map(sensor => ({
      value: sensor,
      label: sensor
    }));

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
        timestamp: currentTimeUTC.toISOString() // Store timestamp in ISO format (UTC)
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
   * Converts local date range to UTC ISO strings for backend queries.
   * @param startDate - Date
   * @param endDate - Date
   * @returns { start: string, end: string }
   */
  const getUtcRangeFromLocalDates = (startDate: Date, endDate: Date) => {
    // Create copies to avoid mutation
    const start = new Date(startDate);
    const end = new Date(endDate);
  
    // Force exact times, without applying timezone shift
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  
    // Format manually to keep local time as-is in the output string
    const toFixedISOString = (date: Date) => {
      const pad = (n: number, z = 2) => ('00' + n).slice(-z);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}Z`;
    };
  
    logger.info('Date conversions:', {
      inputStart: startDate,
      inputEnd: endDate,
      startDateConverted: start,
      endDateConverted: end
    });
  
    return {
      start: toFixedISOString(start),
      end: toFixedISOString(end)
    };
  };
  
  /**
   * handleFetchData
   * Fetches sensor/parameter data from backend for selected experiment and date range.
   * Implements chunking of selectedSensors to avoid request size limits.
   * Updates sensorData and visualization state.
   * Side effect: network request, state update.
   */
  const handleFetchData = async () => {
    if (selectedExperiment && dateRange[0] && dateRange[1] && (selectedSensors.length > 0 || selectedParameters.length > 0)) {
      setIsLoading(true);
      const startTime = performance.now();
      try {
        // Add "SensorData_" prefix to all parameters
        const prefixedParameters = selectedParameters.map(param => `SensorData_${param}`);
        
        // Get UTC range while preserving local day boundaries
        const utcRange = getUtcRangeFromLocalDates(dateRange[0], dateRange[1]);

        // Split selectedSensors into chunks of 50
        const CHUNK_SIZE = 50;
        const sensorChunks: string[][] = [];
        for (let i = 0; i < selectedSensors.length; i += CHUNK_SIZE) {
          sensorChunks.push(selectedSensors.slice(i, i + CHUNK_SIZE));
        }

        logger.info(`Split ${selectedSensors.length} sensors into ${sensorChunks.length} chunks`);

        // Process each chunk and transform data immediately
        const transformedData: SensorData[] = [];
        const BATCH_SIZE = 500; // Small batch size for memory management
        const LOG_PERCENTAGE = 5; // Log n% of batches
        const LOG_INTERVAL = Math.max(1, Math.floor(100 / LOG_PERCENTAGE)); // Calculate how often to log
        

        for (const [index, sensorChunk] of sensorChunks.entries()) {
          logger.info(`Processing chunk ${index + 1}/${sensorChunks.length}`);
          
          const requestData = {
            table_id,
            experiment: selectedExperiment,
            selectedSensors: sensorChunk,
            selectedParameters: prefixedParameters,
            dateRange: utcRange
          };
          
          logger.info(`Sending request for chunk ${index + 1} with ${sensorChunk.length} sensors`);

          const response = await fetch(API_ENDPOINTS.FETCH_DATA, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for chunk ${index + 1}`);
          }

          const data: SensorDataRow[] = await response.json();
          
          // Process the chunk data immediately in small batches
          const totalBatches = Math.ceil(data.length / BATCH_SIZE);
          
          for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, data.length);
            const batch = data.slice(start, end);

            // Process each row in the batch
            for (const row of batch) {
              const timestamp = row.timestamp;
              const sensor = row.sensor_name;

              // Process each parameter for this row
              for (const paramKey of prefixedParameters) {
                const value = row[paramKey];
                if (value !== undefined && value !== null) {
                  transformedData.push({
                    timestamp,
                    value,
                    sensor,
                    parameter: paramKey.replace("SensorData_", "")
                  });
                }
              }
            }

            // Log progress the batches based on percentage
            if (batchIndex % LOG_INTERVAL === 0) {
              logger.info(`Processed batch ${batchIndex + 1}/${totalBatches} of chunk ${index + 1}`);
            }
          }

          // Clear the processed data from memory
          data.length = 0;
        }

        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000; // Convert to seconds
        logger.info(`All processing completed in ${duration.toFixed(2)} seconds`);
        logger.info('Total transformed data points:', transformedData.length);

        setSensorData(transformedData);
        setVisualizedSensors(selectedSensors);
        setShowVisualization(true);
      } catch (error) {
        logger.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  /**
   * handleDownloadCSV
   * Downloads the currently loaded sensor data as a CSV file.
   * Side effect: triggers file download in browser.
   * Uses outlier filtering if enabled.
   */
  const handleDownloadCSV = () => {
    if (processedSensorData.length === 0) return;

    // Group by Label mode
    if (groupBy === 'label' && currentExperiment?.sensorLabelMap && includedLabels.length > 0) {
      const labelMap = currentExperiment.sensorLabelMap;
      const labelsToExport = includedLabels;

      // For each parameter, build a map: timestamp -> label -> [values]
      const byTimestamp: Record<string, Record<string, Record<string, number[]>>> = {};
      processedSensorData.forEach(d => {
        const param = d.parameter;
        const timestamp = d.timestamp;
        const sensor = String(d.sensor);
        // Find all labels for this sensor that are in includedLabels
        const sensorLabels = (labelMap[sensor] || []).filter(l => labelsToExport.includes(l));
        sensorLabels.forEach(label => {
          if (!byTimestamp[timestamp]) byTimestamp[timestamp] = {};
          if (!byTimestamp[timestamp][label]) byTimestamp[timestamp][label] = {};
          if (!byTimestamp[timestamp][label][param]) byTimestamp[timestamp][label][param] = [];
          if (d.value !== null && d.value !== undefined && !isNaN(Number(d.value))) {
            byTimestamp[timestamp][label][param].push(Number(d.value));
          }
        });
      });

      // Get all timestamps sorted
      const allTimestamps = Object.keys(byTimestamp).sort();

      // Create a separate file for each parameter
      selectedParameters.forEach(param => {
        // Build columns: for each label, add mean and STD
        const columns: string[] = ['Timestamp'];
        labelsToExport.forEach(label => {
          columns.push(`${label}-Mean`);
          columns.push(`${label}-STD`);
        });

        // Build rows
        const rows = allTimestamps.map(ts => {
          const row: (string | number)[] = [ts.split('.')[0]];
          labelsToExport.forEach(label => {
            const values = byTimestamp[ts]?.[label]?.[param] || [];
            if (values.length > 0) {
              // Calculate mean
              const mean = values.reduce((a, b) => a + b, 0) / values.length;
              row.push(mean);

              // Calculate STD if we have more than 1 value
              if (values.length > 1) {
                const meanVal = mean;
                const variance = values.reduce((a, b) => a + (b - meanVal) ** 2, 0) / values.length;
                row.push(Math.sqrt(variance));
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
        const csvContent = [columns.join(','), ...rows.map(row => row.join(','))].join('\n');

        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedExperiment}_${param}_labels_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      });
      return;
    }

    // Default: Group by Sensor (current logic)
    // Group data by parameter
    const dataByParameter: Record<string, Record<string, Record<string, number | string>>> = {};
    
    // Initialize data structure for each parameter
    selectedParameters.forEach(param => {
      dataByParameter[param] = {};
    });

    // Group data by parameter and timestamp
    processedSensorData.forEach(curr => {
      const param = curr.parameter;
      const timestamp = curr.timestamp;
      const sensor = curr.sensor;

      if (!dataByParameter[param][timestamp]) {
        dataByParameter[param][timestamp] = {};
      }
      dataByParameter[param][timestamp][sensor] = curr.value ?? '';
    });

    // Create and download a file for each parameter
    selectedParameters.forEach(param => {
      const paramData = dataByParameter[param];
      const timestamps = Object.keys(paramData).sort();
      const sensors = visualizedSensors.sort();

      // Create CSV content
      const rows = timestamps.map(timestamp => {
        const values = paramData[timestamp];
        return [
          timestamp.split('.')[0], // Format timestamp
          ...sensors.map(sensor => (values && sensor in values ? values[sensor] : ''))
        ];
      });

      // Combine header and rows
      const csvContent = [
        ['Timestamp', ...sensors].join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedExperiment}_${param}_${new Date().toISOString().split('T')[0]}.csv`;
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

  if (!selectedExperiment) return null;

  return (
    <div className="space-y-6">
      <div className="p-4 bg-white rounded-lg shadow">
        {/* Sensor Selection */}
        <div className="mb-6">
          <div className="flex items-center mb-2">
            {hasLabelOptions && (
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
                ({selectedSensors.length}/{availableSensors.length})
              </span>
            </label>
          </div>

          {showLabelFilter && hasLabelOptions && currentExperiment && (
            <div className="mb-4">
              <LabelFilter
                sensorLabelOptions={currentExperiment.sensorLabelOptions ?? []}
                sensorLabelMap={currentExperiment.sensorLabelMap ?? {}}
                onFilterChange={(filteredSensors, includeLabels) => {
                  setSelectedSensors(filteredSensors);
                  setIncludedLabels(includeLabels);
                }}
              />
            </div>
          )}

          <div className="flex items-center space-x-2 mb-2">
            <button
              onClick={() => {
                if (selectedSensors.length === availableSensors.length) {
                  setSelectedSensors([]);
                } else {
                  setSelectedSensors([...availableSensors]);
                }
              }}
              className="text-sm text-[#8ac6bb] hover:text-[#7ab6ab]"
            >
              {selectedSensors.length === availableSensors.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <Select<SensorOption, true>
            isMulti
            options={sensorOptions}
            value={sensorOptions.filter(option => selectedSensors.includes(option.value))}
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
          <Select<ParameterOption, true>
            isMulti
            options={PARAMETER_OPTIONS}
            value={PARAMETER_OPTIONS.flatMap(group => group.options).filter(option => selectedParameters.includes(option.value))}
            onChange={handleParameterChange}
            className="basic-multi-select"
            classNamePrefix="select"
            components={{ Option: ParameterOption }}
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



        {/* Action Buttons */}
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
          {showSelectionWarning && (
            <div className="mt-2 text-red-600 text-sm font-semibold">You need to choose at least one sensor and one parameter.</div>
          )}
          {processedSensorData.length > 0 && !isLoading && (
            <button
              onClick={handleDownloadCSV}
              className="bg-[#b2b27a] text-white py-2 px-4 rounded hover:bg-[#a2a26a] transition-colors"
            >
              Download CSV
            </button>
          )}
        </div>
      </div>

      {/* Data Visualization */}
      {showVisualization && processedSensorData.length > 0 && !isLoading && (
        <div className="p-4 bg-white rounded-lg shadow">
          <VisualizationPanel
            data={sensorData}
            selectedParameters={selectedParameters}
            selectedSensors={visualizedSensors}
            experimentName={selectedExperiment}
            getSensorColor={getSensorColor}
            outlierFiltering={outlierFiltering}
            setOutlierFiltering={setOutlierFiltering}
            sensorLabelMap={currentExperiment?.sensorLabelMap ?? {}}
            includedLabels={includedLabels}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
          />
        </div>
      )}
    </div>
  );
};

export default DataSelector; 