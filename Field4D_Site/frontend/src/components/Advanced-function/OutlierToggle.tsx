/*
 * OutlierToggle.tsx
 * Toggle switch for enabling/disabling outlier filtering in visualizations.
 * Designed for future extensibility (e.g., more outlier detection methods).
 */

import React from 'react';

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
   * (Optional) Current outlier detection method (for future extensibility).
   */
  method?: string;
  disabled?: boolean;
}

/**
 * OutlierToggle
 * Renders a labeled toggle switch for outlier filtering.
 * @param enabled - boolean, current toggle state
 * @param onChange - function, called with new state
 * @param method - string, outlier detection method (default: 'IQR')
 * @returns JSX.Element
 */
const OutlierToggle: React.FC<OutlierToggleProps> = ({ enabled, onChange, method = 'IQR', disabled = false }) => {
  return (
    <div className="flex items-center space-x-2">
      <label className="text-sm font-medium text-gray-700" htmlFor="outlier-toggle">
        Outlier Filtering
        <span className="ml-1 text-xs text-gray-400" title={`Method: ${method}`}>
          (method: {method})
        </span>
      </label>
      <button
        id="outlier-toggle"
        type="button"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-[#A8AB58]' : 'bg-[#E67E80]'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && onChange(!enabled)}
        aria-pressed={enabled}
        aria-label="Toggle outlier filtering"
        disabled={disabled}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
};

export default OutlierToggle; 