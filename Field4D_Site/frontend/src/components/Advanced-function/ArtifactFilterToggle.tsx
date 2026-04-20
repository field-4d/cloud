/*
 * ArtifactFilterToggle.tsx
 * Toggle switch for filtering artifact measurements (e.g., -40°C for temperature sensors).
 */

import React, { useState } from 'react';

interface PulseConfig {
  color: string;
  blinkCount: number;
  blinkDuration: number;
  spread?: number;        // Glow spread in pixels
  pulsing?: number;       // Pulse intensity/opacity (0.0 to 1.0)
  scale?: number;        // Scale multiplier during pulse
  borderWidth?: number;  // Border width in pixels
}

interface ArtifactFilterToggleProps {
  /**
   * Whether artifact filtering is enabled.
   */
  enabled: boolean;
  /**
   * Callback when the toggle state changes.
   * @param value - new enabled state
   */
  onChange: (value: boolean) => void;
  /**
   * Whether the toggle is disabled
   */
  disabled?: boolean;
  /**
   * Visualization type (for conditional label display)
   */
  visualizationType: 'scatter' | 'boxplot' | 'histogram';
  /**
   * Whether to show blink animation
   */
  shouldBlink?: boolean;
  /**
   * Pulse animation configuration
   */
  pulseConfig?: PulseConfig;
  /**
   * Callback to stop blinking (called on user interaction)
   */
  onStopBlink?: () => void;
}

/**
 * ArtifactFilterToggle
 * Simple toggle component for artifact filtering.
 */
const ArtifactFilterToggle: React.FC<ArtifactFilterToggleProps> = ({
  enabled,
  onChange,
  disabled = false,
  visualizationType,
  shouldBlink = false,
  pulseConfig,
  onStopBlink
}) => {
  const [showToggleTooltip, setShowToggleTooltip] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  const showLabel = visualizationType !== 'scatter';

  // Default pulse config
  const defaultPulseConfig: PulseConfig = {
    color: 'rgba(255, 193, 7, 0.7)',
    blinkCount: 3,
    blinkDuration: 400,
    spread: 8,
    pulsing: 0.8,
    scale: 1.05,
    borderWidth: 2
  };
  const config: PulseConfig = {
    ...defaultPulseConfig,
    ...pulseConfig
  };

  // Update blinking state when shouldBlink changes
  React.useEffect(() => {
    setIsBlinking(shouldBlink);
  }, [shouldBlink]);

  // Generate CSS animation keyframes dynamically
  const animationStyle = React.useMemo(() => {
    if (!isBlinking) return {};
    
    const totalDuration = config.blinkCount * config.blinkDuration;
    
    return {
      animation: `artifact-pulse ${totalDuration}ms ease-in-out`,
      animationFillMode: 'forwards',
      transformOrigin: 'center'
    };
  }, [isBlinking, config]);

  // Stop blinking on user interaction
  const handleMouseEnter = () => {
    setShowToggleTooltip(true);
    if (isBlinking && onStopBlink) {
      setIsBlinking(false);
      onStopBlink();
    }
  };

  const handleClick = () => {
    onChange(!enabled);
    if (isBlinking && onStopBlink) {
      setIsBlinking(false);
      onStopBlink();
    }
  };

  return (
    <div className={`flex flex-col space-y-2 ${enabled ? 'border border-gray-300 rounded-lg p-4 shadow-sm' : ''}`}>
      {/* Header with Toggle and Active State */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {showLabel && (
            <span className="text-sm font-medium text-gray-700">Filter Artifacts</span>
          )}
          {enabled && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
              Active
            </span>
          )}
        </div>
        
        {/* Toggle Switch with Tooltip */}
        <div className="relative">
          <style>{`
            @keyframes artifact-pulse {
              ${Array.from({ length: config.blinkCount }, (_, i) => {
                const keyframePercent = 100 / config.blinkCount;
                const startPercent = i * keyframePercent;
                const midPercent = startPercent + (keyframePercent / 2);
                const endPercent = (i + 1) * keyframePercent;
                const spread = config.spread || 8;
                const pulsing = config.pulsing || 0.8;
                const scale = config.scale || 1.05;
                const borderWidth = config.borderWidth || 2;
                
                // Convert hex color to rgba if needed
                const getColorWithOpacity = (opacity: number) => {
                  if (config.color.includes('rgba') || config.color.includes('rgb')) {
                    return config.color;
                  }
                  // Hex color - convert to rgba
                  const hex = config.color.replace('#', '');
                  const r = parseInt(hex.substring(0, 2), 16);
                  const g = parseInt(hex.substring(2, 4), 16);
                  const b = parseInt(hex.substring(4, 6), 16);
                  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
                };
                
                const colorFull = getColorWithOpacity(pulsing);
                const colorHalf = getColorWithOpacity(pulsing * 0.5);
                const colorTransparent = getColorWithOpacity(0);
                
                return `
                  ${startPercent}% { 
                    box-shadow: 0 0 0 0 ${colorTransparent}, 0 0 0 0 ${colorTransparent};
                    border: ${borderWidth}px solid transparent;
                    transform: scale(1);
                  }
                  ${midPercent}% { 
                    box-shadow: 0 0 0 ${spread}px ${colorFull}, 0 0 0 ${spread * 1.5}px ${colorHalf};
                    border: ${borderWidth}px solid ${config.color};
                    transform: scale(${scale});
                  }
                  ${endPercent}% { 
                    box-shadow: 0 0 0 0 ${colorTransparent}, 0 0 0 0 ${colorTransparent};
                    border: ${borderWidth}px solid transparent;
                    transform: scale(1);
                  }
                `;
              }).join('')}
            }
          `}</style>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              enabled ? 'bg-[#A8AB58]' : 'bg-[#E67E80]'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleClick}
            aria-pressed={enabled}
            aria-label="Toggle artifact filtering"
            disabled={disabled}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setShowToggleTooltip(false)}
            style={isBlinking ? animationStyle : {}}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          {showToggleTooltip && (
            <div className="absolute z-10 bottom-full right-0 mb-2 w-64 bg-gray-800 text-white text-base rounded py-1 px-2">
              {enabled 
                ? 'Disable artifact filtering (e.g., -40°C for temperature, -999 for humidity)'
                : 'Enable artifact filtering (e.g., -40°C for temperature, -999 for humidity)'}
              <div className="w-2 h-2 bg-gray-800 transform rotate-45 absolute right-4 -bottom-1"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArtifactFilterToggle;

