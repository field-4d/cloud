/*
 * Dashboard.tsx
 * Main dashboard page for authenticated users.
 * Handles system/experiment selection, data fetching, and visualization.
 */

import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { useNavigate } from 'react-router-dom';
import DataSelector from './DataSelector';
import { DateRange, Range, RangeKeyDict } from 'react-date-range';
import { addDays } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { API_ENDPOINTS } from '../config';
import { logger } from '../config/logger';

interface Permission {
  email: string;
  owner: string;
  mac_address: string;
  experiment: string;
  role: string;
  valid_from: string;
  valid_until: string;
  created_at: string;
  table_id: string;
  table_name?: string;
}

type DeviceId = 1 | 2 | 3;
interface SensorData {
  timestamp: string;
  [key: string]: string | number;
}

type SensorType = 'temperature' | 'humidity' | 'solar_radiation' | 'wind_speed' | 'co2' | 'pressure' | 'soil_moisture' | 'light_intensity';

const SENSOR_OPTIONS: { value: SensorType; label: string }[] = [
  { value: 'temperature', label: 'Temperature' },
  { value: 'humidity', label: 'Humidity' },
  { value: 'solar_radiation', label: 'Solar Radiation' },
  { value: 'wind_speed', label: 'Wind Speed' },
  { value: 'co2', label: 'CO2 Concentration' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'soil_moisture', label: 'Soil Moisture' },
  { value: 'light_intensity', label: 'Light Intensity' },
];

const DEVICE_OPTIONS: DeviceId[] = [1, 2, 3];

const Y_AXIS_COLORS = ['#8ac6bb', '#b2b27a', '#e6a157'];

interface ExperimentSummary {
  experimentName: string;
  firstTimestamp: { value: string };
  lastTimestamp: { value: string };
  sensorTypes: string[];
}

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
  const [showSystemDetails, setShowSystemDetails] = useState(false);
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
   * Fetches experiment summary for a given table and mac address.
   * Updates experimentSummaries state.
   * @param tableId - string (BigQuery table ID)
   * @param macAddress - string (system MAC address)
   */
  const fetchExperimentSummary = async (tableId: string, macAddress: string) => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      // Gather all permitted experiments for this mac_address
      const permitted = permissions.filter(p => p.mac_address === macAddress);
      let experiments: string[] = permitted.map(p => p.experiment);
      // If admin (has '*'), only send ['*']
      if (experiments.includes('*')) experiments = ['*'];

      const response = await fetch(API_ENDPOINTS.EXPERIMENT_SUMMARY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          table_id: tableId,
          experiments
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch experiment summary');
      }

      const data = await response.json();
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
    if (permission.table_id) {
      setPreviewLoading(false);
      setPreviewError(null);
      try {
        await fetchExperimentSummary(permission.table_id, permission.mac_address);
      } catch (err: any) {
        setPreviewError(err.message || 'Failed to fetch preview');
      }
    } else {
      setPreviewError(null);
      setPreviewLoading(false);
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
      case 'humidity': return 'Humidity';
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
        const startDate = new Date(experimentData.firstTimestamp.value);
        const endDate = new Date(experimentData.lastTimestamp.value);
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

  // Helper to get unique systems by mac_address
  const uniqueSystems = Array.from(
    new Map(permissions.map(p => [p.mac_address, p])).values()
  );

  if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;

  return (
    <div className="flex h-screen w-screen bg-[#f7f8f3]">
      {/* Fixed top-right buttons */}
      <div className="fixed top-4 right-4 flex items-center space-x-2 z-50">
        <button
          onClick={() => setShowSystemDetails(!showSystemDetails)}
          className="bg-[#b2b27a] text-white p-2 rounded-full hover:bg-[#8ac6bb] transition-colors"
          title="System Details"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          onClick={handleLogout}
          className="bg-[#b2b27a] text-white py-2 px-4 rounded hover:bg-[#8ac6bb] transition-colors"
        >
          Log Out
        </button>
      </div>

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
                    {p.table_name ? p.table_name : `${p.owner} (${p.mac_address})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Experiment Selection */}
            {selectedPermission && experimentSummaries.length > 0 && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-[#8ac6bb] mb-2">
                  Select Experiment
                </label>
                <select
                  value={selectedExperiment}
                  onChange={(e) => setSelectedExperiment(e.target.value)}
                  className="w-full p-2 border border-[#b2b27a] rounded text-[#8ac6bb] focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
                >
                  <option value="">Choose an experiment</option>
                  {experimentSummaries
                    .slice() // copy array to avoid mutating state
                    .sort((a, b) => {
                      // Extract numbers from experimentName, fallback to string compare
                      const numA = parseInt(a.experimentName.match(/\d+/)?.[0] || '0', 10);
                      const numB = parseInt(b.experimentName.match(/\d+/)?.[0] || '0', 10);
                      if (!isNaN(numA) && !isNaN(numB)) {
                        return numA - numB;
                      }
                      return a.experimentName.localeCompare(b.experimentName);
                    })
                    .map(exp => (
                      <option key={exp.experimentName} value={exp.experimentName}>
                        {exp.experimentName}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Date Range Selection */}
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
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-1 p-4 bg-[#f7f8f3] ${isSidebarCollapsed ? 'pt-20' : ''} relative`}>
        {selectedPermission && (
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
              table_id={selectedPermission.table_id}
            />
          </div>
        )}
      </div>

      {/* System Details Drawer */}
      {showSystemDetails && selectedPermission && (
        <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-30 overflow-y-auto">
          <div className="p-4 pt-16"> {/* Added pt-16 to account for the fixed top buttons */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-[#8ac6bb]">System Details</h2>
              <button
                onClick={() => setShowSystemDetails(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold">Owner</h3>
                <p className="text-sm">{selectedPermission.owner}</p>
              </div>
              <div>
                <h3 className="font-semibold">Experiment</h3>
                <p className="text-sm">{selectedPermission.experiment}</p>
              </div>
              <div>
                <h3 className="font-semibold">MAC Address</h3>
                <p className="text-sm">{selectedPermission.mac_address}</p>
              </div>
              <div>
                <h3 className="font-semibold">Role</h3>
                <p className="text-sm">{selectedPermission.role}</p>
              </div>
              <div>
                <h3 className="font-semibold">Valid From</h3>
                <p className="text-sm">{new Date(selectedPermission.valid_from).toLocaleString()}</p>
              </div>
              <div>
                <h3 className="font-semibold">Valid Until</h3>
                <p className="text-sm">{selectedPermission.valid_until ? new Date(selectedPermission.valid_until).toLocaleString() : 'No expiration'}</p>
              </div>
              <div>
                <h3 className="font-semibold">Table ID</h3>
                <p className="text-sm">{selectedPermission.table_id}</p>
              </div>
            </div>
          </div>
        </div>
      )}

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