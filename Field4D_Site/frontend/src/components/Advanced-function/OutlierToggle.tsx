/*
 * OutlierToggle.tsx
 * Enhanced toggle switch for outlier filtering with method selection and threshold controls.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  getSupportedOutlierMethods,
  type OutlierMethod,
  type VisualizationType,
} from '../../utils/outlierFiltering';

interface OutlierMethodOption {
  id: OutlierMethod;
  label: string;
  description: string;
  defaultThreshold: number;
  presets: number[];
}

const OUTLIER_METHODS: OutlierMethodOption[] = [
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
  method?: OutlierMethod;
  /**
   * Current threshold value
   */
  threshold?: number;
  /**
   * Callback when method changes
   */
  onMethodChange?: (method: OutlierMethod) => void;
  /**
   * Callback when threshold changes
   */
  onThresholdChange?: (threshold: number) => void;
  disabled?: boolean;
  visualizationType: 'scatter' | 'boxplot' | 'histogram';
  /**
   * Whether hint styling should be considered active.
   * The pulse itself is controlled by pulseHintToken changes.
   */
  showPulseHint?: boolean;
  /**
   * Incrementing token from parent to trigger a new hint cycle.
   */
  pulseHintToken?: number;
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
  visualizationType,
  showPulseHint = false,
  pulseHintToken = 0,
}) => {
  const [showMethodTooltip, setShowMethodTooltip] = useState(false);
  const [showThresholdTooltip, setShowThresholdTooltip] = useState(false);
  const [showToggleTooltip, setShowToggleTooltip] = useState(false);
  const [customThreshold, setCustomThreshold] = useState('');
  const [isCustomThreshold, setIsCustomThreshold] = useState(false);
  const [isHintAnimating, setIsHintAnimating] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [showStaticHint, setShowStaticHint] = useState(false);

  const internalVizType: VisualizationType =
    visualizationType === 'boxplot' ? 'box' : visualizationType;
  const supportedMethodIds = useMemo(
    () => getSupportedOutlierMethods(internalVizType),
    [internalVizType]
  );
  const availableMethods = OUTLIER_METHODS.filter((m) => supportedMethodIds.includes(m.id));
  const currentMethod = availableMethods.find(m => m.id === method) || availableMethods[0];
  const currentThreshold = threshold ?? currentMethod.defaultThreshold;
  const hintDurationMs = 2400; // 3 pulses x 800ms
  const pulseBaseColor = enabled ? '#A8AB58' : '#E67E80';
  const pulsePeakColor = '#74CFBE';
  const staticHintFillColor = '#7ED4C4';

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyPreference = () => setIsReducedMotion(mediaQuery.matches);
    applyPreference();
    mediaQuery.addEventListener?.('change', applyPreference);
    return () => mediaQuery.removeEventListener?.('change', applyPreference);
  }, []);

  useEffect(() => {
    if (!showPulseHint || enabled) {
      setIsHintAnimating(false);
      setShowStaticHint(false);
      return;
    }

    if (isReducedMotion) {
      setIsHintAnimating(false);
      setShowStaticHint(true);
      const timeout = window.setTimeout(() => setShowStaticHint(false), hintDurationMs);
      return () => window.clearTimeout(timeout);
    }

    setShowStaticHint(false);
    setIsHintAnimating(true);
    const timeout = window.setTimeout(() => setIsHintAnimating(false), hintDurationMs);
    return () => window.clearTimeout(timeout);
  }, [pulseHintToken, showPulseHint, enabled, isReducedMotion]);

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

  return (
    <div className="rounded-lg bg-white/95 p-3 ring-1 ring-gray-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700">Outlier filtering</span>
          {enabled && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
              Active
            </span>
          )}
        </div>
        
        {/* Toggle Switch with Tooltip */}
        <div className="relative overflow-visible">
          <style>{`
            @keyframes outlier-toggle-soft-pulse {
              0% {
                transform: scale(1);
                background-color: var(--pulse-base-color);
                box-shadow: 0 0 0 0 rgba(116, 207, 190, 0), inset 0 0 0 0 rgba(255, 255, 255, 0);
              }
              40% {
                transform: scale(1.06);
                background-color: var(--pulse-peak-color);
                box-shadow: 0 0 0 4px rgba(116, 207, 190, 0.32), 0 0 22px rgba(116, 207, 190, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.3);
              }
              100% {
                transform: scale(1);
                background-color: var(--pulse-base-color);
                box-shadow: 0 0 0 0 rgba(116, 207, 190, 0), inset 0 0 0 0 rgba(255, 255, 255, 0);
              }
            }

            @keyframes outlier-hint-arrow {
              0% {
                opacity: 0.35;
                transform: translateX(4px);
              }
              40% {
                opacity: 1;
                transform: translateX(0);
              }
              100% {
                opacity: 0.35;
                transform: translateX(4px);
              }
            }
          `}</style>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-offset-1 ${
              enabled ? 'bg-[#A8AB58]' : 'bg-[#E67E80]'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
              isHintAnimating ? 'animate-[outlier-toggle-soft-pulse_800ms_ease-in-out_3]' : ''
            } ${
              showStaticHint ? 'ring-2 ring-[#8ac6bb]/80 ring-offset-1 shadow-[0_0_18px_rgba(116,207,190,0.5)]' : ''
            }`}
            style={{
              ...(showStaticHint
                ? {
                    backgroundColor: staticHintFillColor,
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.3) inset, 0 0 18px rgba(116, 207, 190, 0.5)',
                  }
                : null),
              ...(isHintAnimating
                ? ({
                    ['--pulse-base-color' as string]: pulseBaseColor,
                    ['--pulse-peak-color' as string]: pulsePeakColor,
                  } as React.CSSProperties)
                : null),
            }}
            onClick={() => !disabled && onChange(!enabled)}
            aria-pressed={enabled}
            aria-label="Toggle outlier filtering"
            disabled={disabled}
            onMouseEnter={() => setShowToggleTooltip(true)}
            onMouseLeave={() => setShowToggleTooltip(false)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-all ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              } ${isHintAnimating || showStaticHint ? 'shadow-[0_0_0_1px_rgba(79,118,111,0.28),0_1px_5px_rgba(79,118,111,0.35)]' : ''}`}
            />
          </button>
          {(isHintAnimating || showStaticHint) && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-full top-1/2 z-20 ml-[7px] -translate-y-[24px] text-[#67b9a9]"
            >
              <div className={`relative rounded-full bg-[#e8f6f2] px-1.5 py-0.5 shadow-[0_0_10px_rgba(103,185,169,0.35)] ring-1 ring-[#8ac6bb]/55 ${
                isHintAnimating && !isReducedMotion ? 'animate-[outlier-hint-arrow_800ms_ease-in-out_3]' : ''
              }`}>
                <svg
                  className="h-8 w-8"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ transform: 'translateX(-1px)' }}
                >
                  <path
                    d="M15 6L9 12L15 18"
                    stroke="currentColor"
                    strokeWidth="2.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          )}
          {showToggleTooltip && (
            <div className="absolute z-10 bottom-full right-0 mb-2 w-48 bg-gray-800 text-white text-sm rounded py-1 px-2">
              Press to {enabled ? 'disable' : 'enable'} outlier filtering
              <div className="w-2 h-2 bg-gray-800 transform rotate-45 absolute right-4 -bottom-1"></div>
            </div>
          )}
        </div>
      </div>

      {enabled && (
        <div className="mt-3 grid gap-2.5 md:grid-cols-2 md:items-start">
          <div className="relative flex min-h-[44px] items-center gap-2 rounded-md bg-gray-50 px-2.5 py-2">
            <label className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Method
            </label>
            <select
              value={currentMethod.id}
              onChange={(e) => onMethodChange?.(e.target.value as OutlierMethod)}
              className="h-8 w-full max-w-[320px] border border-gray-300 rounded-md px-3 text-sm focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
              disabled={disabled}
            >
              {availableMethods.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <div className="relative">
              <button
                type="button"
                className="text-gray-400 transition-colors duration-150 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-offset-1 rounded"
                onMouseEnter={() => setShowMethodTooltip(true)}
                onMouseLeave={() => setShowMethodTooltip(false)}
                aria-label="Outlier method details"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {showMethodTooltip && (
                <div className="absolute z-10 left-full ml-2 top-1/2 -translate-y-1/2 w-64 bg-gray-800 text-white text-sm rounded py-1 px-2">
                  {currentMethod.description}
                  <div className="w-2 h-2 bg-gray-800 transform rotate-45 absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1"></div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-md bg-gray-50 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <label className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Sensitivity
              </label>
              <div className="relative">
                <button
                  type="button"
                className="ml-1 text-gray-400 transition-colors duration-150 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb] focus-visible:ring-offset-1 rounded"
                  onMouseEnter={() => setShowThresholdTooltip(true)}
                  onMouseLeave={() => setShowThresholdTooltip(false)}
                  aria-label="Outlier sensitivity details"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {showThresholdTooltip && (
                  <div className="absolute z-10 bottom-full left-0 mb-2 w-52 bg-gray-800 text-white text-sm rounded py-1 px-2">
                    {currentMethod.id === 'IQR' 
                      ? 'Multiplier for IQR range (Q1-k×IQR to Q3+k×IQR)'
                      : 'Number of standard deviations from the mean'}
                    <div className="w-2 h-2 bg-gray-800 transform rotate-45 absolute left-4 -bottom-1"></div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {currentMethod.presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleThresholdChange(preset)}
                  className={`min-h-[28px] px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150 ${
                    !isCustomThreshold && currentThreshold === preset
                      ? 'bg-[#8ac6bb] text-white'
                      : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100'
                  }`}
                  disabled={disabled}
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsCustomThreshold(true)}
                className={`min-h-[28px] px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150 ${
                  isCustomThreshold
                    ? 'bg-[#8ac6bb] text-white'
                    : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100'
                }`}
                disabled={disabled}
              >
                Custom
              </button>
            </div>

            {isCustomThreshold && (
              <form onSubmit={handleCustomThresholdSubmit} className="flex items-center space-x-2">
                <input
                  type="number"
                  value={customThreshold}
                  onChange={(e) => setCustomThreshold(e.target.value)}
                  placeholder="Enter value..."
                  step="0.1"
                  min="0.1"
                  className="h-8 w-28 px-2 text-sm border border-gray-300 rounded-md focus:ring-[#8ac6bb] focus:border-[#8ac6bb]"
                  disabled={disabled}
                />
                <button
                  type="submit"
                  className="h-8 px-2.5 text-xs font-semibold text-white bg-[#8ac6bb] rounded-md hover:bg-[#7ab6ab] transition-colors duration-150"
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