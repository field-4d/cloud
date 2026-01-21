/*
 * OutlierToggle.tsx
 * Enhanced toggle switch for outlier filtering with method selection and threshold controls.
 */

import React, { useState } from 'react';

interface OutlierMethod {
  id: string;
  label: string;
  description: string;
  defaultThreshold: number;
  presets: number[];
}

const OUTLIER_METHODS: OutlierMethod[] = [
  {
    id: 'IQR',
    label: 'Interquartile Range (IQR)',
    description: 'Removes points outside Q1–k×IQR and Q3+k×IQR. Robust to skewed data.',
    defaultThreshold: 1.5,
    presets: [1.0, 1.5, 2.0, 2.5, 3.0]
  },
  {
    id: 'ZSCORE',
    label: 'Z-Score',
    description: 'Removes points more than k standard deviations from the mean. Assumes normally distributed data.',
    defaultThreshold: 2.5,
    presets: [1.5, 2.0, 2.5, 3.0, 3.5]
  }
];

interface OutlierToggleProps {
  /**
   * Whether outlier filtering is enabled.
   */
  enabled: boolean;
  /**
   * Callback when the toggle state changes.
   * @param value - new enabled state
   */
  onChange: (value: boolean) => void;
  /**
   * Current outlier detection method
   */
  method?: string;
  /**
   * Current threshold value
   */
  threshold?: number;
  /**
   * Callback when method changes
   */
  onMethodChange?: (method: string) => void;
  /**
   * Callback when threshold changes
   */
  onThresholdChange?: (threshold: number) => void;
  disabled?: boolean;
  visualizationType: 'scatter' | 'boxplot' | 'histogram';
}

/**
 * OutlierToggle
 * Enhanced toggle component for outlier filtering with method selection and threshold controls.
 */
const OutlierToggle: React.FC<OutlierToggleProps> = ({
  enabled,
  onChange,
  method = 'IQR',
  threshold,
  onMethodChange,
  onThresholdChange,
  disabled = false,
  visualizationType
}) => {
  const [showMethodTooltip, setShowMethodTooltip] = useState(false);
  const [showThresholdTooltip, setShowThresholdTooltip] = useState(false);
  const [showToggleTooltip, setShowToggleTooltip] = useState(false);
  const [customThreshold, setCustomThreshold] = useState('');
  const [isCustomThreshold, setIsCustomThreshold] = useState(false);

  // Filter available methods based on visualizationType
  const availableMethods = visualizationType === 'boxplot'
    ? OUTLIER_METHODS.filter(m => m.id === 'IQR')
    : OUTLIER_METHODS;
  const currentMethod = availableMethods.find(m => m.id === method) || availableMethods[0];
  const currentThreshold = threshold ?? currentMethod.defaultThreshold;

  const handleThresholdChange = (value: number) => {
    setIsCustomThreshold(false);
    setCustomThreshold('');
    onThresholdChange?.(value);
  };

  const handleCustomThresholdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(customThreshold);
    if (!isNaN(value) && value > 0) {
      onThresholdChange?.(value);
    }
  };

  const showLabel = visualizationType !== 'scatter';

  return (
    <div className={`flex flex-col space-y-2 ${enabled ? 'border border-gray-300 rounded-lg p-4 shadow-sm' : ''}`}>
      {/* Header with Toggle and Active State */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {showLabel && (
            <span className="text-sm font-medium text-gray-700">Outlier Filtering</span>
          )}
          {enabled && (
            <span className="px-2 py-0.5 text-base font-medium bg-yellow-100 text-yellow-800 rounded-full">
              Active
            </span>
          )}
        </div>
        
        {/* Toggle Switch with Tooltip */}
        <div className="relative">
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              enabled ? 'bg-[#A8AB58]' : 'bg-[#E67E80]'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onChange(!enabled)}
            aria-pressed={enabled}
            aria-label="Toggle outlier filtering"
            disabled={disabled}
            onMouseEnter={() => setShowToggleTooltip(true)}
            onMouseLeave={() => setShowToggleTooltip(false)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          {showToggleTooltip && (
            <div className="absolute z-10 bottom-full right-0 mb-2 w-48 bg-gray-800 text-white text-base rounded py-1 px-2">
              Press to {enabled ? 'disable' : 'enable'} outlier filtering
              <div className="w-2 h-2 bg-gray-800 transform rotate-45 absolute right-4 -bottom-1"></div>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      {enabled && (
        <div className="mt-4 space-y-4">
          {/* Method Selection */}
          <div className="relative flex items-center space-x-2">
            <select
              value={method}
              onChange={(e) => onMethodChange?.(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-base focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
              disabled={disabled}
            >
              {availableMethods.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            {/* Method Tooltip */}
            <div className="relative">
              <button
                className="text-gray-400 hover:text-gray-600"
                onMouseEnter={() => setShowMethodTooltip(true)}
                onMouseLeave={() => setShowMethodTooltip(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {showMethodTooltip && (
                <div className="absolute z-10 left-full ml-2 top-1/2 -translate-y-1/2 w-64 bg-gray-800 text-white text-base rounded py-1 px-2">
                  {currentMethod.description}
                  <div className="w-2 h-2 bg-gray-800 transform rotate-45 absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1"></div>
                </div>
              )}
            </div>
          </div>

          {/* Threshold Control */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Threshold:</label>
              <div className="relative">
                <button
                  className="ml-1 text-gray-400 hover:text-gray-600"
                  onMouseEnter={() => setShowThresholdTooltip(true)}
                  onMouseLeave={() => setShowThresholdTooltip(false)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {showThresholdTooltip && (
                  <div className="absolute z-10 bottom-full left-0 mb-2 w-48 bg-gray-800 text-white text-base rounded py-1 px-2">
                    {method === 'IQR' 
                      ? 'Multiplier for IQR range (Q1-k×IQR to Q3+k×IQR)'
                      : 'Number of standard deviations from the mean'}
                    <div className="w-2 h-2 bg-gray-800 transform rotate-45 absolute left-4 -bottom-1"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Preset Threshold Buttons */}
            <div className="flex flex-wrap gap-2">
              {currentMethod.presets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleThresholdChange(preset)}
                  className={`px-3 py-1 text-sm rounded-full transition-colors ${
                    !isCustomThreshold && currentThreshold === preset
                      ? 'bg-[#8ac6bb] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  disabled={disabled}
                >
                  {preset}
                </button>
              ))}
              <button
                onClick={() => setIsCustomThreshold(true)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  isCustomThreshold
                    ? 'bg-[#8ac6bb] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                disabled={disabled}
              >
                Custom
              </button>
            </div>

            {/* Custom Threshold Input */}
            {isCustomThreshold && (
              <form onSubmit={handleCustomThresholdSubmit} className="flex items-center space-x-2">
                <input
                  type="number"
                  value={customThreshold}
                  onChange={(e) => setCustomThreshold(e.target.value)}
                  placeholder="Enter value..."
                  step="0.1"
                  min="0.1"
                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
                  disabled={disabled}
                />
                <button
                  type="submit"
                  className="px-2 py-1 text-sm text-white bg-[#8ac6bb] rounded hover:bg-[#7ab6ab] transition-colors"
                  disabled={disabled}
                >
                  Apply
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OutlierToggle;