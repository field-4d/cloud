/*
 * Dashboard.tsx
 * Main dashboard page for authenticated users.
 * Handles system/experiment selection, data fetching, and visualization.
 */

import React, { useEffect, useState, useRef } from 'react';
import Plot from 'react-plotly.js';
import { useNavigate } from 'react-router-dom';
import DataSelector from './DataSelector';
import { DateRange, Range, RangeKeyDict } from 'react-date-range';
import { addDays } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { API_ENDPOINTS } from '../config';
import { apiLog, logger } from '../config/logger';
import PermissionDashboard from './PermissionDashboard';

interface Permission {
  email: string;
  owner: string;
  mac_address: string;
  experiment: string;
  role: string;
  valid_from: string;
  valid_until: string;
  created_at: string;
  device_name?: string | null;
  description?: string | null;
}

type DeviceId = 1 | 2 | 3;
interface SensorData {
  timestamp: string;
  [key: string]: string | number;
}

type SensorType = 'temperature' | 'humidity' | 'solar_radiation' | 'wind_speed' | 'co2' | 'pressure' | 'soil_moisture' | 'light_intensity';

const SENSOR_OPTIONS: { value: SensorType; label: string }[] = [
  { value: 'temperature', label: 'Temperature' },
  { value: 'humidity', label: 'relative humidity' },
  { value: 'solar_radiation', label: 'Solar Radiation' },
  { value: 'wind_speed', label: 'Wind Speed' },
  { value: 'co2', label: 'CO2 Concentration' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'soil_moisture', label: 'Soil Moisture' },
  { value: 'light_intensity', label: 'Light Intensity' },
];

const DEVICE_OPTIONS: DeviceId[] = [1, 2, 3];

const Y_AXIS_COLORS = ['#8ac6bb', '#b2b27a', '#e6a157'];
type MainModule = 'data_viewer' | 'management';
type ManagementTab = 'users' | 'permissions' | 'devices';

const normalizeDashboardRole = (value: unknown): 'read' | 'admin' | 'system_admin' => {
  if (typeof value !== 'string') return 'read';
  const cleaned = value.trim().toLowerCase();
  if (cleaned === 'system_admin') return 'system_admin';
  if (cleaned === 'admin') return 'admin';
  return 'read';
};

interface ExperimentSummary {
  experimentName: string;
  experimentId?: number | null;
  firstTimestamp: string | { value: string };
  lastTimestamp: string | { value: string };
  sensorTypes?: string[];
  sensors?: string[];
  parameters?: string[];
  labelOptions?: string[];
  locationOptions?: string[];
  sensorLabelMap?: Record<string, string[]>;
  labelCounts?: Record<string, number>;
  sensorLocationMap?: Record<string, string>;
}

const parseSummaryTimestamp = (
  value: string | { value: string } | null | undefined
): Date | null => {
  const timestamp = typeof value === 'string' ? value : value?.value;
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Keep date picker aligned to UTC calendar days from backend timestamps.
const parseUtcCalendarDayFromSummary = (
  value: string | { value: string } | null | undefined
): { year: number; month: number; day: number } | null => {
  const timestamp = typeof value === 'string' ? value : value?.value;
  if (!timestamp) return null;
  const m = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]) - 1,
    day: Number(m[3]),
  };
};

const utcCalendarDayStartFromSummary = (
  value: string | { value: string } | null | undefined
): Date | null => {
  const p = parseUtcCalendarDayFromSummary(value);
  if (!p) return null;
  return new Date(p.year, p.month, p.day, 0, 0, 0, 0);
};

const utcCalendarDayEndFromSummary = (
  value: string | { value: string } | null | undefined
): Date | null => {
  const p = parseUtcCalendarDayFromSummary(value);
  if (!p) return null;
  return new Date(p.year, p.month, p.day, 23, 59, 59, 999);
};

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Dashboard
 * Main dashboard component. Handles:
 * - Fetching user permissions and experiment summaries
 * - System and experiment selection
 * - Data download and visualization
 * @returns JSX.Element
 */
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const userData = JSON.parse(localStorage.getItem('userData') || '{}');
  const actorEmail = typeof userData.email === 'string' ? userData.email : '';
  const actorRole = normalizeDashboardRole(userData.role);
  const canCreateUsers = actorRole === 'system_admin';
  const [activeMainModule, setActiveMainModule] = useState<MainModule>('data_viewer');
  const [activeManagementPage, setActiveManagementPage] = useState<ManagementTab>('permissions');
  const [isDataViewerOpen, setIsDataViewerOpen] = useState(true);
  const [isManagementOpen, setIsManagementOpen] = useState(false);

  useEffect(() => {
    if (!canCreateUsers && activeManagementPage === 'users') {
      setActiveManagementPage('permissions');
    }
  }, [canCreateUsers, activeManagementPage]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [selectedSensors, setSelectedSensors] = useState<SensorType[]>(['temperature']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sidebarWidth] = useState(420); // Increased from 192 to 320
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tablePreview, setTablePreview] = useState<any[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [experimentSummaries, setExperimentSummaries] = useState<ExperimentSummary[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedExperiment, setSelectedExperiment] = useState('');
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [minDate, setMinDate] = useState<Date | null>(null);
  const [maxDate, setMaxDate] = useState<Date | null>(null);
  const [dateState, setDateState] = useState<Range[]>([
    {
      startDate: new Date(),
      endDate: addDays(new Date(), 7),
      key: 'selection'
    }
  ]);
  const [selectedOwner, setSelectedOwner] = useState<string>('');
  const experimentSelectRef = useRef<HTMLSelectElement>(null);
  const [isExperimentSelectOpen, setIsExperimentSelectOpen] = useState(false);

  useEffect(() => {
    fetchPermissions();
  }, []);

  /**
   * fetchPermissions
   * Fetches user permissions from backend using email from localStorage.
   * Sets permissions state and handles errors.
   * Side effect: may set selectedPermission and generate mock data.
   */
  const fetchPermissions = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      if (!userData.email) {
        throw new Error('No user email found');
      }

      const response = await fetch(`${API_ENDPOINTS.PERMISSIONS}?email=${encodeURIComponent(userData.email)}`);
      if (!response.ok) {
        throw new Error('Unable to access your account permissions. Please contact your system administrator to ensure your account has been properly configured.');
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error('Unable to access your account permissions. Please contact your system administrator to ensure your account has been properly configured.');
      }

      const permissionsForFront: Permission[] = Array.isArray(data.permissions) ? data.permissions : [];
      const uniqueOwnersForFront = Array.from(
        new Set(permissionsForFront.map((permission: Permission) => permission.owner))
      ).sort();
      const uniqueSystemsForFront = Array.from(
        new Map<string, Permission>(
          permissionsForFront.map((permission) => [permission.mac_address, permission])
        ).values()
      ).map((permission) => ({
        mac_address: permission.mac_address,
        owner: permission.owner,
        label: getSystemDropdownLabel(permission),
        experiment: permission.experiment,
      }));

      apiLog('[API] permissions response', data);
      apiLog('[API] permissions sorted for front', {
        uniqueOwners: uniqueOwnersForFront,
        uniqueSystems: uniqueSystemsForFront,
      });

      setPermissions(data.permissions);
      if (data.permissions.length > 0) {
        setSelectedPermission(data.permissions[0]);
        generateMockData();
      }
      setLoading(false);
      logger.info('Systems for Select a system:', data.permissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  /**
   * generateMockData
   * Generates mock sensor data for UI preview/demo purposes.
   * Populates sensorData state.
   */
  const generateMockData = () => {
    const now = new Date();
    const data: SensorData[] = [];
    for (let i = 0; i < 480; i++) {
      const timestamp = new Date(now.getTime() - (i * 3 * 60 * 1000));
      const row: SensorData = { timestamp: timestamp.toISOString() };
      SENSOR_OPTIONS.forEach(opt => {
        DEVICE_OPTIONS.forEach(device => {
          row[`${opt.value}_device${device}`] =
            opt.value === 'temperature' ? 20 + Math.random() * 10 :
            opt.value === 'humidity' ? 40 + Math.random() * 30 :
            opt.value === 'solar_radiation' ? 100 + Math.random() * 900 :
            opt.value === 'wind_speed' ? 1 + Math.random() * 10 :
            opt.value === 'co2' ? 400 + Math.random() * 600 :
            opt.value === 'pressure' ? 950 + Math.random() * 50 :
            opt.value === 'soil_moisture' ? 10 + Math.random() * 40 :
            opt.value === 'light_intensity' ? 100 + Math.random() * 900 :
            0;
        });
      });
      data.push(row);
    }
    setSensorData(data.reverse());
  };

  /**
   * fetchExperimentSummary
   * Fetches experiment summary for a given owner and mac address.
   * Updates experimentSummaries state.
   * @param owner - string
   * @param macAddress - string (system MAC address)
   */
  const fetchExperimentSummary = async (owner: string, macAddress: string) => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      // Gather all permitted experiments for this mac_address
      const permitted = permissions.filter(p => p.mac_address === macAddress && p.owner === owner);
      let experiments: string[] = permitted.map(p => p.experiment);
      // If admin (has '*'), only send ['*']
      if (experiments.includes('*')) experiments = ['*'];

      const response = await fetch(API_ENDPOINTS.EXPERIMENT_SUMMARY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          owner,
          mac_address: macAddress,
          experiments
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch experiment summary');
      }

      const data = await response.json();
      const activeExperimentsForFront = data
        .filter((exp: ExperimentSummary) => isExperimentActive(exp))
        .slice()
        .sort(sortExperimentsDescending)
        .map((exp: ExperimentSummary) => exp.experimentName);
      const inactiveExperimentsForFront = data
        .filter((exp: ExperimentSummary) => !isExperimentActive(exp))
        .slice()
        .sort(sortExperimentsDescending)
        .map((exp: ExperimentSummary) => exp.experimentName);

      apiLog('[API] experiment-summary response', data);
      apiLog('[API] experiment-summary sorted for front', {
        activeExperiments: activeExperimentsForFront,
        inactiveExperiments: inactiveExperimentsForFront,
      });

      logger.info('Experiment summaries:', data);
      setExperimentSummaries(data);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to fetch experiment summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  /**
   * handlePermissionSelect
   * Handles user selection of a system (permission).
   * Fetches experiment summary for the selected system.
   * @param permission - Permission object
   */
  const handlePermissionSelect = async (permission: Permission) => {
    setSelectedPermission(permission);
    generateMockData();
    setPreviewLoading(false);
    setPreviewError(null);
    try {
      await fetchExperimentSummary(permission.owner, permission.mac_address);
    } catch (err: any) {
      setPreviewError(err.message || 'Failed to fetch preview');
    }
  };

  /**
   * handleSensorToggle
   * Toggles sensor selection for visualization.
   * @param sensor - SensorType
   */
  const handleSensorToggle = (sensor: SensorType) => {
    setSelectedSensors((prev) => {
      if (prev.includes(sensor)) {
        return prev.filter((s) => s !== sensor);
      } else if (prev.length < 3) {
        return [...prev, sensor];
      } else {
        return prev;
      }
    });
  };

  /**
   * getSensorUnit
   * Returns the unit for a given sensor type.
   * @param sensor - SensorType
   * @returns string (unit)
   */
  const getSensorUnit = (sensor: SensorType): string => {
    switch (sensor) {
      case 'temperature': return '°C';
      case 'humidity': return '%';
      case 'solar_radiation': return 'W/m²';
      case 'wind_speed': return 'm/s';
      case 'co2': return 'ppm';
      case 'pressure': return 'hPa';
      case 'soil_moisture': return '%';
      case 'light_intensity': return 'lux';
      default: return '';
    }
  };

  /**
   * getSensorLabel
   * Returns the display label for a given sensor type.
   * @param sensor - SensorType
   * @returns string (label)
   */
  const getSensorLabel = (sensor: SensorType): string => {
    switch (sensor) {
      case 'temperature': return 'Temperature';
      case 'humidity': return 'relative humidity';
      case 'solar_radiation': return 'Solar Radiation';
      case 'wind_speed': return 'Wind Speed';
      case 'co2': return 'CO2 Concentration';
      case 'pressure': return 'Pressure';
      case 'soil_moisture': return 'Soil Moisture';
      case 'light_intensity': return 'Light Intensity';
      default: return '';
    }
  };

  /**
   * getSensorRange
   * Returns the expected value range for a given sensor type.
   * @param sensor - SensorType
   * @returns string (range)
   */
  const getSensorRange = (sensor: SensorType): string => {
    switch (sensor) {
      case 'temperature': return '(20-30°C)';
      case 'humidity': return '(40-70%)';
      case 'solar_radiation': return '(100-1000 W/m²)';
      case 'wind_speed': return '(1-11 m/s)';
      case 'co2': return '(400-1000 ppm)';
      case 'pressure': return '(950-1000 hPa)';
      case 'soil_moisture': return '(10-50%)';
      case 'light_intensity': return '(100-1000 lux)';
      default: return '';
    }
  };

  /**
   * removeMacFromDisplayName
   * Removes MAC address pattern (in parentheses) from the end of a display name.
   * @param name - string (the display name that may contain MAC address)
   * @returns string (cleaned display name without MAC address)
   */
  const removeMacFromDisplayName = (name: string): string => {
    if (!name) return name;
    // Remove MAC address pattern in parentheses at the end: " (hexchars)"
    return name.replace(/\s*\([a-f0-9]+\)$/i, '').trim();
  };

  /**
   * getSystemDropdownLabel
   * Label for the system/device dropdown from /api/permissions.
   * Fallback: device_name → description → mac_address → owner
   */
  const getSystemDropdownLabel = (p: Permission): string => {
    const deviceName = p.device_name?.trim();
    if (deviceName) return removeMacFromDisplayName(deviceName);
    const description = p.description?.trim();
    if (description) return description;
    const mac = p.mac_address?.trim();
    if (mac) return mac;
    return p.owner;
  };

  /**
   * isExperimentActive
   * Checks if an experiment has reported data in the last hour.
   * @param exp - ExperimentSummary object
   * @returns boolean - true if lastTimestamp is within one hour from now
   */
  const isExperimentActive = (exp: ExperimentSummary): boolean => {
    const lastDate = parseSummaryTimestamp(exp.lastTimestamp);
    if (!lastDate) return false;
    return Date.now() - lastDate.getTime() <= ONE_HOUR_MS;
  };

  const getExperimentOptionLabel = (exp: ExperimentSummary): string => {
    const idPrefix = typeof exp.experimentId === 'number' ? `#${exp.experimentId} - ` : '';
    return `${idPrefix}${exp.experimentName}`;
  };

  /**
   * sortExperimentsDescending
   * Sorts experiments by backend id first, then recency, then name fallback.
   * @param a - ExperimentSummary
   * @param b - ExperimentSummary
   * @returns number - comparison result for sorting
   */
  const sortExperimentsDescending = (a: ExperimentSummary, b: ExperimentSummary): number => {
    // Primary sort: explicit backend experiment id (latest first).
    const idA = typeof a.experimentId === 'number' ? a.experimentId : null;
    const idB = typeof b.experimentId === 'number' ? b.experimentId : null;
    if (idA !== null && idB !== null && idA !== idB) {
      return idB - idA;
    }

    // Secondary sort: newest lastTimestamp first (handles equal/missing ids).
    const tsA = parseSummaryTimestamp(a.lastTimestamp)?.getTime() ?? Number.NEGATIVE_INFINITY;
    const tsB = parseSummaryTimestamp(b.lastTimestamp)?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (tsA !== tsB) {
      return tsB - tsA;
    }

    // Tertiary fallback: parse number from experimentName for legacy naming patterns.
    const numA = parseInt(a.experimentName.match(/\d+/)?.[0] || '0', 10);
    const numB = parseInt(b.experimentName.match(/\d+/)?.[0] || '0', 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
      return numB - numA;
    }

    // Final deterministic fallback.
    return a.experimentName.localeCompare(b.experimentName);
  };

  /**
   * handleExperimentSelectFocus
   * Scrolls the select element into view with space below to ensure dropdown opens downward.
   */
  const handleExperimentSelectFocus = () => {
    if (experimentSelectRef.current) {
      // Scroll the select into view with space below (block: 'nearest' ensures it only scrolls if needed)
      experimentSelectRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest',
        inline: 'nearest'
      });
      
      // Additional scroll to ensure space below for dropdown
      setTimeout(() => {
        const selectElement = experimentSelectRef.current;
        if (selectElement) {
          const rect = selectElement.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const spaceBelow = viewportHeight - rect.bottom;
          
          // If there's less than 300px below, scroll down a bit more
          if (spaceBelow < 300) {
            const scrollAmount = 300 - spaceBelow;
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
          }
        }
      }, 100);
    }
  };

  /**
   * handleLogout
   * Opens the logout confirmation modal.
   */
  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  /**
   * confirmLogout
   * Handles user logout by clearing authentication data from localStorage
   * and redirecting the user to the login page.
   */
  const confirmLogout = () => {
    localStorage.removeItem('userData');
    navigate('/');
  };

  /**
   * cancelLogout
   * Closes the logout confirmation modal.
   */
  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  /**
   * downloadCSV
   * Downloads the currently loaded sensor data as a CSV file.
   * Side effect: triggers file download in browser.
   */
  const downloadCSV = () => {
    if (!selectedPermission || sensorData.length === 0) return;
    const header = [
      'Timestamp',
      ...selectedSensors.flatMap(sensor =>
        DEVICE_OPTIONS.map(device => `${getSensorLabel(sensor)} Device ${device} [${getSensorUnit(sensor)}]`)
      )
    ];
    const rows = sensorData.map(d => [
      d.timestamp,
      ...selectedSensors.flatMap(sensor =>
        DEVICE_OPTIONS.map(device => d[`${sensor}_device${device}`])
      )
    ]);
    const csvContent = [header, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPermission.owner}_${selectedPermission.experiment}_data.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  /**
   * handlePreviewClick
   * Toggles the preview panel open/closed.
   */
  const handlePreviewClick = () => {
    setPreviewOpen((prev) => !prev);
  };

  /**
   * handleDateChange
   * Handles changes to the selected date range.
   * @param item - RangeKeyDict (from react-date-range)
   */
  const handleDateChange = (item: RangeKeyDict) => {
    if (item.selection.startDate && item.selection.endDate) {
      setDateState([item.selection]);
      setDateRange([item.selection.startDate, item.selection.endDate]);
    }
  };

  useEffect(() => {
    if (selectedExperiment) {
      const experimentData = experimentSummaries.find(
        exp => exp.experimentName === selectedExperiment
      );
      if (experimentData) {
        let startDate = utcCalendarDayStartFromSummary(experimentData.firstTimestamp);
        let endDate = utcCalendarDayEndFromSummary(experimentData.lastTimestamp);

        if (!startDate || !endDate) {
          // Fallback for older payload shapes.
          const firstParsed = parseSummaryTimestamp(experimentData.firstTimestamp);
          const lastParsed = parseSummaryTimestamp(experimentData.lastTimestamp);
          if (firstParsed && lastParsed) {
            startDate = new Date(
              firstParsed.getUTCFullYear(),
              firstParsed.getUTCMonth(),
              firstParsed.getUTCDate(),
              0, 0, 0, 0
            );
            endDate = new Date(
              lastParsed.getUTCFullYear(),
              lastParsed.getUTCMonth(),
              lastParsed.getUTCDate(),
              23, 59, 59, 999
            );
          }
        }

        if (!startDate || !endDate) {
          setDateRange([null, null]);
          setMinDate(null);
          setMaxDate(null);
          return;
        }

        if (startDate > endDate) {
          [startDate, endDate] = [endDate, startDate];
        }

        // Calendar selection should operate on whole UTC calendar days in the widget.
        setMinDate(startDate);
        setMaxDate(endDate);
        setDateState([
          {
            startDate,
            endDate,
            key: 'selection'
          }
        ]);
        setDateRange([startDate, endDate]);
      }
    } else {
      setDateRange([null, null]);
      setMinDate(null);
      setMaxDate(null);
    }
  }, [selectedExperiment, experimentSummaries]);

  // Helper to get unique owners
  const uniqueOwners = Array.from(new Set(permissions.map(p => p.owner))).sort();

  // Helper to get unique systems by mac_address, filtered by selected owner
  const uniqueSystems = Array.from(
    new Map(
      permissions
        .filter(p => !selectedOwner || p.owner === selectedOwner)
        .map(p => [p.mac_address, p])
    ).values()
  );

  if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;

  return (
    <div className="flex h-screen w-screen bg-[#f7f8f3]">
      {/* Sidebar */}
      {isSidebarCollapsed ? (
        <div className="w-full h-16 bg-[#f7f8f3] flex items-center border-b border-[#b2b27a] px-4 z-20 fixed top-0 left-0">
          <div className="flex items-center">
            <img src="/logo.png" alt="Field4F Logo" className="w-10 h-10 mr-4" />
            <button
              className="bg-[#b2b27a] text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-[#8ac6bb] transition-colors"
              onClick={() => setIsSidebarCollapsed(false)}
              title="Expand sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{ width: sidebarWidth, minWidth: 320 }}
          className="bg-[#f7f8f3] p-4 flex flex-col border-r border-[#b2b27a] relative z-10 h-screen overflow-y-auto"
        >
          {/* Logo and collapse button container */}
          <div className="flex-shrink-0 flex flex-col items-center mb-6">
            <img src="/logo.png" alt="Field4F Logo" className="w-12 h-12 mb-2" />
            <button
              className="absolute top-4 right-2 bg-[#b2b27a] text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-[#8ac6bb] transition-colors"
              style={{ left: sidebarWidth - 24, zIndex: 20 }}
              onClick={() => setIsSidebarCollapsed(true)}
              title="Collapse sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Selection container with flex-shrink-0 */}
          <div className="flex-shrink-0">
            <div className="mb-5 rounded-xl border border-[#c7ddd6] bg-[#eef7f4] p-3">
              <button
                type="button"
                onClick={() => {
                  setIsDataViewerOpen((prev) => !prev);
                  setActiveMainModule('data_viewer');
                }}
                className={`mb-2 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-base font-semibold transition-colors ${
                  activeMainModule === 'data_viewer'
                    ? 'bg-[#d8ece6] text-[#405f57]'
                    : 'text-[#4b5f59] hover:bg-[#e6f2ee]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`inline-block h-5 w-1.5 rounded ${activeMainModule === 'data_viewer' ? 'bg-[#7bb8ac]' : 'bg-transparent'}`} />
                  Data Viewer
                </span>
                <span className="text-[11px] text-[#6b7e78]">{isDataViewerOpen ? '▾' : '▸'}</span>
              </button>

            {isDataViewerOpen && activeMainModule === 'data_viewer' && (
              <div className="rounded-lg bg-white/60 p-2">
            {/* Owner Selection - only show if user has more than one owner */}
            {uniqueOwners.length > 1 && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-[#8ac6bb] mb-2">
                  Select Owner
                </label>
                <select 
                  className="w-full p-2 border border-[#b2b27a] rounded text-[#8ac6bb] focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
                  value={selectedOwner}
                  onChange={(e) => {
                    setSelectedOwner(e.target.value);
                    setSelectedPermission(null);
                    setSelectedExperiment('');
                    setExperimentSummaries([]);
                  }}
                >
                  <option value="">All Owners</option>
                  {uniqueOwners.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* System Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#8ac6bb] mb-2">
                Select System
              </label>
              <select 
                className="w-full p-2 border border-[#b2b27a] rounded text-[#8ac6bb] focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
                onChange={(e) => {
                  const permission = permissions.find(p => p.mac_address === e.target.value);
                  if (permission) handlePermissionSelect(permission);
                }}
              >
                <option value="">Select a system</option>
                {uniqueSystems.map((p) => (
                  <option key={p.mac_address} value={p.mac_address}>
                    {getSystemDropdownLabel(p)}
                  </option>
                ))}
              </select>
            </div>

            {/* Experiment Selection */}
            {selectedPermission && experimentSummaries.length > 0 && (
              <div className="mb-6 experiment-select-wrapper">
                <label className="block text-sm font-medium text-[#8ac6bb] mb-2">
                  Select Experiment
                </label>
                <div className="relative">
                  {(() => {
                    const activeExperiments = experimentSummaries
                      .filter(isExperimentActive)
                      .slice()
                      .sort(sortExperimentsDescending);
                    const inactiveExperiments = experimentSummaries
                      .filter(exp => !isExperimentActive(exp))
                      .slice()
                      .sort(sortExperimentsDescending);
                    const baseSize = activeExperiments.length + 
                                     (inactiveExperiments.length > 0 && activeExperiments.length > 0 ? 1 : 0) + 
                                     5 + 
                                     1; 
                    const calculatedSize = Math.min(baseSize, 8);
                    const shouldUseSize = inactiveExperiments.length > 5 && isExperimentSelectOpen;
                    return (
                      <select
                        ref={experimentSelectRef}
                        value={selectedExperiment}
                        onChange={(e) => {
                          setSelectedExperiment(e.target.value);
                          setIsExperimentSelectOpen(false);
                          if (experimentSelectRef.current) {
                            experimentSelectRef.current.blur();
                          }
                        }}
                        onFocus={() => {
                          setIsExperimentSelectOpen(true);
                          handleExperimentSelectFocus();
                        }}
                        onBlur={() => {
                          setTimeout(() => setIsExperimentSelectOpen(false), 200);
                        }}
                        size={shouldUseSize ? calculatedSize : undefined}
                        className="w-full p-2 border border-[#b2b27a] rounded text-[#8ac6bb] focus:ring-[#8ac6bb] focus:border-[#8ac6bb] experiment-select"
                      >
                        <option value="">Choose an experiment</option>
                        {activeExperiments.length > 0 && (
                          <optgroup label="Active Experiments">
                            {activeExperiments.map(exp => (
                              <option key={exp.experimentName} value={exp.experimentName}>
                                {getExperimentOptionLabel(exp)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {inactiveExperiments.length > 0 && activeExperiments.length > 0 && (
                          <option disabled>─────────────────────</option>
                        )}
                        {inactiveExperiments.length > 0 && (
                          activeExperiments.length > 0 ? (
                            <optgroup label="Inactive Experiments">
                              {inactiveExperiments.map(exp => (
                                <option key={exp.experimentName} value={exp.experimentName}>
                                  {getExperimentOptionLabel(exp)}
                                </option>
                              ))}
                            </optgroup>
                          ) : (
                            <>
                              {inactiveExperiments.map(exp => (
                                <option key={exp.experimentName} value={exp.experimentName}>
                                  {getExperimentOptionLabel(exp)}
                                </option>
                              ))}
                            </>
                          )
                        )}
                      </select>
                    );
                  })()}
                </div>
              </div>
            )}

            {selectedExperiment && experimentSummaries.length > 0 && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-[#8ac6bb] mb-2">
                  Select Date Range
                </label>
                <div className="border border-[#b2b27a] rounded-lg overflow-hidden">
                  <DateRange
                    editableDateInputs={true}
                    onChange={handleDateChange}
                    moveRangeOnFirstSelection={false}
                    ranges={dateState}
                    minDate={minDate || undefined}
                    maxDate={maxDate || undefined}
                    rangeColors={['#8ac6bb']}
                    className="text-[#8ac6bb]"
                  />
                </div>
              </div>
            )}
              </div>
            )}
            </div>

            <div className="mb-6 rounded-xl border border-[#d7d3c7] bg-[#f7f5ef] p-3">
              <button
                type="button"
                onClick={() => {
                  setIsManagementOpen((prev) => !prev);
                  setActiveMainModule('management');
                }}
                className={`mb-2 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-base font-semibold transition-colors ${
                  activeMainModule === 'management'
                    ? 'bg-[#ece7d8] text-[#5e5a4b]'
                    : 'text-[#5c5d53] hover:bg-[#efecdf]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`inline-block h-5 w-1.5 rounded ${activeMainModule === 'management' ? 'bg-[#b8b08f]' : 'bg-transparent'}`} />
                  Management
                </span>
                <span className="text-[11px] text-[#7a7567]">{isManagementOpen ? '▾' : '▸'}</span>
              </button>

            {isManagementOpen && (
              <div className="mb-2 rounded-lg bg-white/70 p-2">
                {((canCreateUsers ? ['users', 'permissions', 'devices'] : ['permissions', 'devices']) as ManagementTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveMainModule('management');
                      setActiveManagementPage(tab);
                    }}
                    className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm capitalize transition-colors ${
                      activeManagementPage === tab && activeMainModule === 'management'
                        ? 'border-l-4 border-[#b8b08f] bg-[#f0ecdf] pl-2 text-[#5d584b] font-medium'
                        : 'text-[#5d5f55] hover:bg-[#f3efe4]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-1 p-4 bg-[#f7f8f3] ${isSidebarCollapsed ? 'pt-20' : ''} relative`}>
        <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="bg-[#b2b27a] text-white py-2 px-4 rounded hover:bg-[#8ac6bb] transition-colors"
          >
            Log Out
          </button>
        </div>

        {activeMainModule === 'data_viewer' && selectedPermission && (
          <div className="space-y-4">
            <DataSelector 
              experimentSummaries={experimentSummaries}
              selectedExperiment={selectedExperiment}
              onExperimentChange={setSelectedExperiment}
              dateRange={dateRange}
              onDateChange={handleDateChange}
              dateState={dateState}
              minDate={minDate}
              maxDate={maxDate}
              owner={selectedPermission.owner}
              mac_address={selectedPermission.mac_address}
            />
          </div>
        )}
        {activeMainModule === 'management' && (
          <div className="pt-14">
            {activeManagementPage === 'devices' ? (
              <div className="rounded-xl border border-[#b2b27a] bg-white p-6 text-[#5f6b45] shadow">
                <h3 className="mb-2 text-lg font-semibold">Devices</h3>
                <p>Device management is coming soon.</p>
              </div>
            ) : activeManagementPage === 'users' && canCreateUsers ? (
              <PermissionDashboard actorEmail={actorEmail} actorRole={actorRole} mode="embedded" permissionMode="new_user" />
            ) : (
              <PermissionDashboard actorEmail={actorEmail} actorRole={actorRole} mode="embedded" permissionMode="permission_assignment" />
            )} 
          </div>
        )}
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-4">Confirm Logout</h3>
            <p className="mb-4">Are you sure you want to log out?</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelLogout}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard; 