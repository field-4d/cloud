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
import { apiLog, logger } from '../config/logger';
import LabelFilter from './LabelFilter';
import { applyOutlierFiltering, type OutlierConfig } from '../utils/outlierFiltering';
import {
  getSelectedLabelMemberships,
  normalizeIncludedLabels,
  type RowWithSensorLabel,
} from '../utils/labelGrouping';

// Initialize dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set the timezone to Israel
const TIMEZONE = 'Asia/Jerusalem';

const normalizeLocationKey = (value: string): string =>
  String(value).trim().toLocaleLowerCase();

interface ExperimentSummary {
  experimentName: string;
  firstTimestamp?: string | { value: string };
  lastTimestamp?: string | { value: string };
  sensors?: string[];
  parameters?: string[];
  labelOptions?: string[];
  locationOptions?: string[];
  /** LLA -> distinct labels for that sensor (from experiment-summary). */
  sensorLabelMap?: Record<string, string[]>;
  /** Sensors per label (latest label per sensor); same basis as sensorLabelMap. */
  labelCounts?: Record<string, number>;
  /** LLA -> latest Location (from experiment-summary). */
  sensorLocationMap?: Record<string, string>;
}

interface ParameterOption {
  value: string;
  label: string;
  unit: string;
}

interface DataSelectorProps {
  experimentSummaries: ExperimentSummary[];
  selectedExperiment: string;
  owner: string;
  mac_address: string;
  onExperimentChange: (experiment: string) => void;
  dateRange: [Date | null, Date | null];
  onDateChange: (item: RangeKeyDict) => void;
  dateState: Range[];
  minDate: Date | null;
  maxDate: Date | null;
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
  sensor: string;
  parameter: string;
  value: number | null;
  label?: string | null;
  location?: string | null;
  [key: string]: any;
}

interface SensorOption {
  value: string;
  label: string;
}

interface SensorDisplayOption {
  displayKey: string;
  displayLabel: string;
  llaIds: string[];
  isLocationBacked: boolean;
  sortPrimary: string;
  sortSecondary: string;
}

interface SensorDataRow {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number | null;
  label: string | null;
  location: string | null;
  experiment: string;
  owner: string;
  mac_address: string;
}

const Y_AXIS_COLORS = ['#8ac6bb', '#b2b27a', '#e6a157'];

// Artifact thresholds per parameter (case-insensitive matching)
const ARTIFACT_THRESHOLDS: Record<string, number> = {
  temperature: -40,
  humidity: -999,
  // Add more as needed
};

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
      { value: 'temperature', label: 'Temperature (°C)', unit: '°C' },
      { value: 'humidity', label: 'Relative Humidity (RH)', unit: '%' },
      { value: 'barometric_pressure', label: 'Barometric Pressure (hPa)', unit: 'hPa' },
      { value: 'light', label: 'Light Intensity (lux)', unit: 'lux' },
      { value: 'battery', label: 'Battery Level (mV)', unit: 'mV' },
      { value: 'co2_ppm', label: 'CO2 Concentration (PPM)', unit: 'ppm' },
      { value: 'air_velocity', label: 'Air Velocity', unit: 'm/s' }
    ]
  },
  {
    label: 'BMP390 Sensors',
    options: [
      { value: 'bmp_390_u18_pressure', label: 'BMP390 U18 Pressure (hPa)', unit: 'hPa' },
      { value: 'bmp_390_u18_temperature', label: 'BMP390 U18 Temperature (°C)', unit: '°C' },
      { value: 'bmp_390_u19_pressure', label: 'BMP390 U19 Pressure (hPa)', unit: 'hPa' },
      { value: 'bmp_390_u19_temperature', label: 'BMP390 U19 Temperature (°C)', unit: '°C' }
    ]
  },
  {
    label: 'HDC2010 Sensors',
    options: [
      { value: 'hdc_2010_u13_temperature', label: 'HDC2010 U13 Temperature (°C)', unit: '°C' },
      { value: 'hdc_2010_u13_humidity', label: 'HDC2010 U13 Relative Humidity (RH)', unit: '%' },
      { value: 'hdc_2010_u16_temperature', label: 'HDC2010 U16 Temperature (°C)', unit: '°C' },
      { value: 'hdc_2010_u16_humidity', label: 'HDC2010 U16 Relative Humidity (RH)', unit: '%' },
      { value: 'hdc_2010_u17_temperature', label: 'HDC2010 U17 Temperature (°C)', unit: '°C' },
      { value: 'hdc_2010_u17_humidity', label: 'HDC2010 U17 Relative Humidity (RH)', unit: '%' }
    ]
  },
  {
    label: 'OPT3001 Light Sensors',
    options: [
      { value: 'opt_3001_u1_light_intensity', label: 'OPT3001 U1 Light Intensity (lux)', unit: 'lux' },
      { value: 'opt_3001_u2_light_intensity', label: 'OPT3001 U2 Light Intensity (lux)', unit: 'lux' },
      { value: 'opt_3001_u3_light_intensity', label: 'OPT3001 U3 Light Intensity (lux)', unit: 'lux' },
      { value: 'opt_3001_u4_light_intensity', label: 'OPT3001 U4 Light Intensity (lux)', unit: 'lux' },
      { value: 'opt_3001_u5_light_intensity', label: 'OPT3001 U5 Light Intensity (lux)', unit: 'lux' }
    ]
  },
  {
    label: 'ZTP315 Temperature Sensors',
    options: [
      { value: 'ztp_315_surface_temperature', label: 'ZTP315 Surface Temperature (°C)', unit: '°C' },
      { value: 'ztp_315_ambient_temperature', label: 'ZTP315 Ambient Temperature (°C)', unit: '°C' },
      { value: 'ztp_315_object_temperature', label: 'ZTP315 Object Temperature (°C)', unit: '°C' },
      { value: 'ztp_315_voltage_output', label: 'ZTP315 Voltage Output', unit: 'V' },
      { value: 'ztp_315_temperature_offset', label: 'ZTP315 Temperature Offset (°C)', unit: '°C' },
      { value: 'ztp_315_emissivity', label: 'ZTP315 Emissivity', unit: '' },
      { value: 'ztp_315_calibrated_temperature', label: 'ZTP315 Calibrated Temperature (°C)', unit: '°C' }
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
      { value: 'batmon_temperature', label: 'Battery Temperature (°C)', unit: '°C' },
      { value: 'batmon_battery_voltage', label: 'Battery Voltage (V)', unit: 'V' },
      { value: 'rssi', label: 'RSSI', unit: 'dBm' },
      { value: 'tmp107_amb', label: 'TMP107 Ambient Temperature (°C)', unit: '°C' },
      { value: 'tmp107_obj', label: 'TMP107 Object Temperature (°C)', unit: '°C' },
      { value: 'barometric_temp', label: 'Barometric Temperature (°C)', unit: '°C' }
    ]
  }
];

// Add this after the imports and before the DataSelector component
const generateColorFromString = (str: string): string => {
  // Improved hash function for better color distribution
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use golden ratio to distribute colors evenly across the full spectrum
  const goldenRatio = 0.618033988749895;
  const hue = (Math.abs(hash) * goldenRatio) % 1;
  
  // Convert to HSL with better distribution - avoid red range (0-30 and 330-360)
  let h = Math.floor(hue * 360);
  // Shift red hues to other colors for better visibility
  if (h < 30) h = h + 60; // Shift early reds to yellow-orange
  if (h > 330) h = h - 60; // Shift late reds to purple
  
  const s = 70 + (Math.abs(hash) % 20); // Saturation: 70-90%
  const l = 45 + (Math.abs(hash) % 20); // Lightness: 45-65%
  
  // Convert HSL to RGB for better Plotly compatibility
  const hNorm = h / 360;
  const sNorm = s / 100;
  const lNorm = l / 100;
  
  let r, g, b;
  if (sNorm === 0) {
    r = g = b = lNorm;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;
    r = hue2rgb(p, q, hNorm + 1/3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1/3);
  }
  
  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
 * @returns JSX.Element
 */
const DataSelector: React.FC<DataSelectorProps> = ({ 
  experimentSummaries, 
  selectedExperiment,
  owner,
  mac_address,
  onExperimentChange,
  dateRange,
  dateState,
  minDate,
  maxDate,
}) => {
  const [selectedSensors, setSelectedSensors] = useState<string[]>([]);
  const [selectedDisplayKeys, setSelectedDisplayKeys] = useState<string[]>([]);
  const [visualizedSensors, setVisualizedSensors] = useState<string[]>([]);
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
  const [availableSensors, setAvailableSensors] = useState<string[]>([]);
  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [showVisualization, setShowVisualization] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showLabelFilter, setShowLabelFilter] = useState(false);
  const [sensorLabelMap, setSensorLabelMap] = useState<Record<string, string[]>>({});
  /** Latest Location per LLA (summary + merged from fetch rows). */
  const [sensorLocationMap, setSensorLocationMap] = useState<Record<string, string>>({});
  /** Sensors passing include/exclude label rules. */
  const [sensorsAfterLabelFilter, setSensorsAfterLabelFilter] = useState<string[]>([]);
  const [includedLabels, setIncludedLabels] = useState<string[]>([]);
  const [excludeLabels, setExcludeLabels] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'sensor' | 'label'>('sensor');
  const [errorType, setErrorType] = useState<'STD' | 'SE'>('SE');

  // Get current experiment and check if it has label options
  const currentExperiment = experimentSummaries.find(exp => exp.experimentName === selectedExperiment);
  const hasLabelOptions = Boolean(currentExperiment?.labelOptions?.length);

  /** Strict include labels for grouping/export; no composite expansion. */
  const selectedIncludeLabels = React.useMemo(
    () => normalizeIncludedLabels(includedLabels),
    [includedLabels]
  );

  /** Pool for sensor multiselect / Select All: label-filtered list, or all available before filter applies. */
  const sensorSelectionPool = React.useMemo(
    () =>
      sensorsAfterLabelFilter.length > 0 ? sensorsAfterLabelFilter : availableSensors,
    [sensorsAfterLabelFilter, availableSensors]
  );

  // Outlier filtering state (single source of truth)
  const [outlierConfig, setOutlierConfig] = React.useState<OutlierConfig>({
    enabled: false,
    method: 'IQR',
    threshold: 1.5,
  });
  
  // Artifact filtering state (single source of truth)
  const [artifactFiltering, setArtifactFiltering] = React.useState<boolean>(false);

  // Helper: Filter artifact measurements (e.g., -40°C for temperature)
  function filterArtifacts(data: SensorData[]): SensorData[] {
    return data.map(d => {
      const param = String(d.parameter).toLowerCase();
      const threshold = ARTIFACT_THRESHOLDS[param];
      
      if (threshold !== undefined && typeof d.value === 'number' && d.value === threshold) {
        return { ...d, value: NaN };
      }
      return d;
    });
  }

  // Use processed data for CSV export if filtering is enabled
  const processedSensorData = React.useMemo(() => {
    let data = sensorData.map(d => ({ ...d }));
    
    // Apply artifact filtering first
    if (artifactFiltering) {
      data = filterArtifacts(data);
    }
    
    // Then apply outlier filtering
    if (outlierConfig.enabled) {
      data = applyOutlierFiltering(data, outlierConfig);
    }
    
    return data;
  }, [sensorData, artifactFiltering, outlierConfig]);

  // Reset and update available data when experiment changes
  useEffect(() => {
    if (selectedExperiment) {
      const experimentData = experimentSummaries.find(
        exp => exp.experimentName === selectedExperiment
      );
      if (experimentData) {
        setAvailableSensors(experimentData.sensors || []);
        setAvailableParameters(experimentData.parameters || []);
        setSelectedSensors([]);
        setSelectedDisplayKeys([]);
        setSelectedParameters([]);
        setSensorData([]);
        setSensorLabelMap(
          experimentData.sensorLabelMap && typeof experimentData.sensorLabelMap === 'object'
            ? { ...experimentData.sensorLabelMap }
            : {}
        );
        setSensorLocationMap(
          experimentData.sensorLocationMap && typeof experimentData.sensorLocationMap === 'object'
            ? { ...experimentData.sensorLocationMap }
            : {}
        );
        setSensorsAfterLabelFilter(experimentData.sensors || []);
        setIncludedLabels([]);
        setExcludeLabels([]);
        setShowVisualization(false);
        setShowLabelFilter(!!experimentData.labelOptions?.length);
      }
    } else {
      setAvailableSensors([]);
      setAvailableParameters([]);
      setSelectedSensors([]);
      setSelectedDisplayKeys([]);
      setSelectedParameters([]);
      setSensorData([]);
      setSensorLabelMap({});
      setSensorLocationMap({});
      setSensorsAfterLabelFilter([]);
      setIncludedLabels([]);
      setExcludeLabels([]);
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
    const nextDisplayKeys = selectedOptions.map((option) => option.value);
    setSelectedDisplayKeys(nextDisplayKeys);
    setSelectedSensors(expandDisplayKeysToSensors(nextDisplayKeys));
  };

  const getSensorDisplayName = React.useCallback((sensor: string) => {
    const location = sensorLocationMap[sensor];
    return location != null && String(location).trim() !== ''
      ? String(location).trim()
      : sensor;
  }, [sensorLocationMap]);

  const compareSensorNames = React.useCallback((left: string, right: string) => {
    const leftName = getSensorDisplayName(left);
    const rightName = getSensorDisplayName(right);
    const byName = leftName.localeCompare(rightName, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (byName !== 0) return byName;
    return left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }, [getSensorDisplayName]);

  const buildReplacementNamesForParameter = React.useCallback((
    parameterRows: SensorData[],
    sensors: string[]
  ) => {
    const rangesBySensor = new Map<string, { latest: number; earliest: number }>();
    for (const sensor of sensors) {
      rangesBySensor.set(sensor, {
        latest: Number.NEGATIVE_INFINITY,
        earliest: Number.POSITIVE_INFINITY,
      });
    }

    for (const row of parameterRows) {
      const sensor = String(row.sensor ?? '');
      if (!rangesBySensor.has(sensor)) continue;
      const ts = Date.parse(String(row.timestamp ?? ''));
      if (!Number.isFinite(ts)) continue;
      const range = rangesBySensor.get(sensor);
      if (!range) continue;
      range.latest = Math.max(range.latest, ts);
      range.earliest = Math.min(range.earliest, ts);
    }

    const groupedByLocation = new Map<string, string[]>();
    for (const sensor of sensors) {
      const displayName = getSensorDisplayName(sensor);
      const group = groupedByLocation.get(displayName);
      if (group) {
        group.push(sensor);
      } else {
        groupedByLocation.set(displayName, [sensor]);
      }
    }

    const namesBySensor: Record<string, string> = {};
    for (const [displayName, sensorsInLocation] of groupedByLocation.entries()) {
      if (sensorsInLocation.length <= 1) {
        namesBySensor[sensorsInLocation[0]] = displayName;
        continue;
      }

      const ranked = sensorsInLocation
        .slice()
        .sort((left, right) => {
          const leftRange = rangesBySensor.get(left);
          const rightRange = rangesBySensor.get(right);
          const leftLatest = leftRange?.latest ?? Number.NEGATIVE_INFINITY;
          const rightLatest = rightRange?.latest ?? Number.NEGATIVE_INFINITY;
          if (leftLatest !== rightLatest) return rightLatest - leftLatest;
          const leftEarliest = leftRange?.earliest ?? Number.POSITIVE_INFINITY;
          const rightEarliest = rightRange?.earliest ?? Number.POSITIVE_INFINITY;
          if (leftEarliest !== rightEarliest) return rightEarliest - leftEarliest;
          return left.localeCompare(right, undefined, {
            numeric: true,
            sensitivity: 'base',
          });
        });

      ranked.forEach((sensor, index) => {
        if (index === 0) {
          namesBySensor[sensor] = displayName;
          return;
        }
        if (ranked.length === 2) {
          namesBySensor[sensor] = `${displayName} (replaced)`;
          return;
        }
        namesBySensor[sensor] = `${displayName} (replaced ${index})`;
      });
    }

    return namesBySensor;
  }, [getSensorDisplayName]);

  const formatCsvTimestamp = React.useCallback((timestamp: string) => {
    const trimmed = String(timestamp).trim();
    return trimmed
      .replace(/\.\d+Z$/, '')
      .replace(/\.\d+$/, '')
      .replace(/Z$/, '');
  }, []);

  const {
    displayOptions,
    displayKeyToLlas,
    llaToDisplayKey,
    sensorOptions,
  } = React.useMemo(() => {
    const grouped = new Map<string, SensorDisplayOption>();

    for (const sensor of sensorSelectionPool) {
      const rawLocation = sensorLocationMap[sensor];
      const location = rawLocation != null ? String(rawLocation).trim() : '';
      const isLocationBacked = location !== '';
      const displayKey = isLocationBacked
        ? `location:${normalizeLocationKey(location)}`
        : `lla:${sensor}`;
      const displayLabel = isLocationBacked ? location : sensor;
      const sortPrimary = isLocationBacked
        ? normalizeLocationKey(location)
        : normalizeLocationKey(sensor);

      const existing = grouped.get(displayKey);
      if (existing) {
        existing.llaIds.push(sensor);
        continue;
      }

      grouped.set(displayKey, {
        displayKey,
        displayLabel,
        llaIds: [sensor],
        isLocationBacked,
        sortPrimary,
        sortSecondary: sensor,
      });
    }

    const dedupedOptions = Array.from(grouped.values())
      .map((option) => ({
        ...option,
        llaIds: option.llaIds.slice().sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        ),
      }))
      .sort((left, right) => {
        const byPrimary = left.sortPrimary.localeCompare(right.sortPrimary, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (byPrimary !== 0) return byPrimary;
        return left.sortSecondary.localeCompare(right.sortSecondary, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });

    const keyToLlas: Record<string, string[]> = {};
    const sensorToKey: Record<string, string> = {};
    for (const option of dedupedOptions) {
      keyToLlas[option.displayKey] = option.llaIds;
      for (const lla of option.llaIds) {
        sensorToKey[lla] = option.displayKey;
      }
    }

    return {
      displayOptions: dedupedOptions,
      displayKeyToLlas: keyToLlas,
      llaToDisplayKey: sensorToKey,
      sensorOptions: dedupedOptions.map((option) => ({
        value: option.displayKey,
        label: option.displayLabel,
      })),
    };
  }, [sensorSelectionPool, sensorLocationMap]);

  const expandDisplayKeysToSensors = React.useCallback((displayKeys: string[]) => {
    const seen = new Set<string>();
    const expanded: string[] = [];
    const poolSet = new Set(sensorSelectionPool);
    for (const key of displayKeys) {
      const llas = displayKeyToLlas[key] ?? [];
      for (const lla of llas) {
        if (!poolSet.has(lla) || seen.has(lla)) continue;
        seen.add(lla);
        expanded.push(lla);
      }
    }
    return expanded.slice().sort(compareSensorNames);
  }, [displayKeyToLlas, sensorSelectionPool, compareSensorNames]);

  /**
   * Clamp selected display options when pool/mapping changes.
   * Defaults to all currently available visible options.
   */
  React.useEffect(() => {
    setSelectedDisplayKeys((prev) => {
      const valid = prev.filter((key) => displayKeyToLlas[key] != null);
      if (valid.length === prev.length && valid.length > 0) return prev;
      if (valid.length > 0) return valid;
      return displayOptions.map((option) => option.displayKey);
    });
  }, [displayOptions, displayKeyToLlas]);

  React.useEffect(() => {
    setSelectedSensors(expandDisplayKeysToSensors(selectedDisplayKeys));
  }, [selectedDisplayKeys, expandDisplayKeysToSensors]);

  // Convert availableParameters to options format for react-select.
  const parameterOptions: ParameterOption[] = availableParameters
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map(param => {
      const unit = getParameterUnit(param);
      return { value: param, label: param, unit };
    });

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
        timestamp: currentTimeUTC.toISOString(),
        sensor: '',
        parameter: '',
        value: null,
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
   * Converts picker-selected calendar dates into UTC day bounds for backend queries.
   * @param startDate - Date
   * @param endDate - Date
   * @returns { start: string, end: string }
   */
  const getUtcRangeFromLocalDates = (startDate: Date, endDate: Date) => {
    const startUtc = new Date(
      Date.UTC(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate(),
        0,
        0,
        0,
        0
      )
    ).toISOString();
    const endUtc = new Date(
      Date.UTC(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate(),
        23,
        59,
        59,
        999
      )
    ).toISOString();

    logger.info('Date conversions:', {
      inputStart: startDate,
      inputEnd: endDate,
      startDateConvertedUtc: startUtc,
      endDateConvertedUtc: endUtc,
    });

    return {
      start: startUtc,
      end: endUtc,
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
    if (
      selectedExperiment &&
      dateRange[0] &&
      dateRange[1] &&
      selectedSensors.length > 0 &&
      selectedParameters.length > 0
    ) {
      setIsLoading(true);
      const startTime = performance.now();
      try {
        // Get UTC range while preserving local day boundaries
        const utcRange = getUtcRangeFromLocalDates(dateRange[0], dateRange[1]);

        // Label filter is enforced via selected sensors + viz (atomic matching); fetch returns latest Label per LLA for every row.

        // Split selectedSensors into chunks of 20
        const CHUNK_SIZE = 20;
        const sensorChunks: string[][] = [];
        for (let i = 0; i < selectedSensors.length; i += CHUNK_SIZE) {
          sensorChunks.push(selectedSensors.slice(i, i + CHUNK_SIZE));
        }

        // Process each chunk and transform data immediately (long-format rows)
        const transformedData: SensorData[] = [];

        for (const [index, sensorChunk] of sensorChunks.entries()) {
          const requestData = {
            owner,
            mac_address,
            experiment: selectedExperiment,
            selectedSensors: sensorChunk,
            selectedParameters: selectedParameters,
            dateRange: utcRange,
          };

          const response = await fetch(API_ENDPOINTS.FETCH_DATA, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for chunk ${index + 1}`);
          }

          const data: SensorDataRow[] = await response.json();
          apiLog(`[API] fetch-data response chunk ${index + 1}/${sensorChunks.length}`, {
            request: requestData,
            rowCount: data.length,
            data,
          });

          for (const row of data) {
            transformedData.push({
              timestamp: row.timestamp,
              sensor: row.sensor,
              parameter: row.parameter,
              value: row.value,
              label: row.label,
              location: row.location,
            });
          }
        }

        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000; // Convert to seconds
        logger.info(`All processing completed in ${duration.toFixed(2)} seconds`);
        logger.info('Total transformed data points:', transformedData.length);
        logger.info('Transformed data:', transformedData);

        const sortedSensorsForFront = Array.from(
          new Set(transformedData.map((row) => row.sensor))
        )
          .slice()
          .sort(compareSensorNames)
          .map((sensor) => ({
            value: sensor,
            label: getSensorDisplayName(sensor),
          }));
        const sortedParametersForFront = Array.from(
          new Set(transformedData.map((row) => row.parameter))
        )
          .slice()
          .sort((a, b) => a.localeCompare(b))
          .map((parameter) => ({
            value: parameter,
            label: parameter,
            unit: getParameterUnit(parameter),
          }));

        apiLog('[API] fetch-data transformed for front', {
          rowCount: transformedData.length,
          sensors: sortedSensorsForFront,
          parameters: sortedParametersForFront,
          data: transformedData,
        });

        setSensorLocationMap((prev) => {
          const merged: Record<string, string> = { ...prev };
          for (const row of transformedData) {
            if (row.sensor && row.location != null && String(row.location).trim() !== '') {
              merged[String(row.sensor)] = String(row.location).trim();
            }
          }
          return merged;
        });
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

    const csvCell = (value: string | number) => {
      const text = String(value ?? '');
      const escaped = text.replace(/"/g, '""');
      return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
    };

    const safeHeaderLabel = (label: string) =>
      String(label)
        .trim()
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ');

    // Group by Label mode
    if (groupBy === 'label' && selectedIncludeLabels.length > 0) {
      const labelMap = sensorLabelMap;
      const labelsToExport = selectedIncludeLabels;
      
      // For each parameter, build a map: timestamp -> label -> [values]
      const byTimestamp: Record<string, Record<string, Record<string, number[]>>> = {};
      processedSensorData.forEach(d => {
        const param = d.parameter;
        const timestamp = d.timestamp;
        const matchedLabels = getSelectedLabelMemberships(
          d as RowWithSensorLabel,
          labelMap,
          labelsToExport
        );
        matchedLabels.forEach((label) => {
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
        // Build columns: for each label, add mean and errorType (SE or STD)
        const columns: string[] = ['Timestamp'];
        labelsToExport.forEach(label => {
          const safeLabel = safeHeaderLabel(label);
          columns.push(`${safeLabel}-Mean`);
          columns.push(`${safeLabel}-${errorType}`);
        });

        // Build rows
        const rows = allTimestamps.map(ts => {
          const row: (string | number)[] = [formatCsvTimestamp(ts)];
          labelsToExport.forEach(label => {
            const values = byTimestamp[ts]?.[label]?.[param] || [];
            if (values.length > 0) {
              // Calculate mean
              const mean = values.reduce((a, b) => a + b, 0) / values.length;
              row.push(mean);

              // Calculate errorType if we have more than 1 value
              if (values.length > 1) {
                const meanVal = mean;
                const variance = values.reduce((a, b) => a + (b - meanVal) ** 2, 0) / values.length;
                const std = Math.sqrt(variance);
                if (errorType === 'SE') {
                  row.push(std / Math.sqrt(values.length));
                } else {
                  row.push(std);
                }
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
        const csvContent = [
          columns.map(csvCell).join(','),
          ...rows.map(row => row.map(csvCell).join(',')),
        ].join('\n');

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
      // Handle NaN, null, and undefined as empty cells
      const value = curr.value;
      if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
        dataByParameter[param][timestamp][sensor] = '';
      } else {
        dataByParameter[param][timestamp][sensor] = value;
      }
    });

    // Create and download a file for each parameter
    selectedParameters.forEach(param => {
      const paramData = dataByParameter[param];
      const timestamps = Object.keys(paramData).sort();
      const sensors = [...visualizedSensors].sort(compareSensorNames);
      const rowsForParameter = processedSensorData.filter((row) => row.parameter === param);
      const sensorHeaderMap = buildReplacementNamesForParameter(rowsForParameter, sensors);

      // Create CSV content
      const rows = timestamps.map(timestamp => {
        const values = paramData[timestamp];
        return [
          formatCsvTimestamp(timestamp),
          ...sensors.map(sensor => (values && sensor in values ? values[sensor] : ''))
        ];
      });

      // Combine header and rows
      const csvContent = [
        ['Timestamp', ...sensors.map(sensor => sensorHeaderMap[sensor])].join(','),
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
                ({selectedDisplayKeys.length}/{sensorOptions.length})
              </span>
            </label>
          </div>

          {showLabelFilter && hasLabelOptions && currentExperiment && (
            <div className="mb-4">
              <LabelFilter
                key={selectedExperiment}
                sensorLabelOptions={currentExperiment.labelOptions ?? []}
                sensorLabelMap={sensorLabelMap}
                allSensors={availableSensors}
                onFilterChange={(filteredSensors, includeLabels, excludeLabels) => {
                  setSensorsAfterLabelFilter(filteredSensors);
                  setIncludedLabels(includeLabels);
                  setExcludeLabels(excludeLabels);
                  // Keep visible selector aligned with label-filtered LLAs.
                  const nextDisplayKeys = Array.from(
                    new Set(
                      filteredSensors
                        .map((sensor) => llaToDisplayKey[sensor])
                        .filter((value): value is string => Boolean(value))
                    )
                  );
                  setSelectedDisplayKeys(nextDisplayKeys);
                  setSelectedSensors(expandDisplayKeysToSensors(nextDisplayKeys));
                }}
              />
            </div>
          )}

          <div className="flex items-center space-x-2 mb-2">
            <button
              onClick={() => {
                if (selectedDisplayKeys.length === sensorOptions.length) {
                  setSelectedDisplayKeys([]);
                  setSelectedSensors([]);
                } else {
                  const nextDisplayKeys = displayOptions.map((option) => option.displayKey);
                  setSelectedDisplayKeys(nextDisplayKeys);
                  setSelectedSensors(expandDisplayKeysToSensors(nextDisplayKeys));
                }
              }}
              className="text-sm text-[#8ac6bb] hover:text-[#7ab6ab]"
            >
              {selectedDisplayKeys.length === sensorOptions.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <Select<SensorOption, true>
            isMulti
            options={sensorOptions}
            value={sensorOptions.filter((option) => selectedDisplayKeys.includes(option.value))}
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
            options={parameterOptions}
            value={parameterOptions.filter(option => selectedParameters.includes(option.value))}
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
            data={sensorData as any}
            selectedParameters={selectedParameters}
            selectedSensors={visualizedSensors}
            experimentName={selectedExperiment}
            getSensorColor={getSensorColor}
            getSensorDisplayName={getSensorDisplayName}
            outlierConfig={outlierConfig}
            setOutlierConfig={setOutlierConfig}
            artifactFiltering={artifactFiltering}
            setArtifactFiltering={setArtifactFiltering}
              sensorLabelMap={sensorLabelMap}
            includedLabels={selectedIncludeLabels}
            excludeLabels={excludeLabels}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            errorType={errorType}
            setErrorType={setErrorType}
          />
        </div>
      )}
    </div>
  );
};

export default DataSelector; 