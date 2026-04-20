import React, { useState } from 'react';
import { checkAnalyticsHealth, HealthCheckResult } from './healthCheck';
import { logger } from '../../config/logger';

interface HealthCheckButtonProps {
  className?: string;
}

const HealthCheckButton: React.FC<HealthCheckButtonProps> = ({ className = '' }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleHealthCheck = async () => {
    setIsLoading(true);
    setResult(null);
    
    try {
      const healthResult = await checkAnalyticsHealth();
      setResult(healthResult);
      logger.info('Health check completed:', healthResult);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setResult({
        success: false,
        error: errorMessage
      });
      logger.error('Health check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatResponseTime = (time?: number) => {
    if (!time) return 'N/A';
    return `${time}ms`;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Health Check Button */}
      <div className="flex items-center space-x-4">
        <button
          onClick={handleHealthCheck}
          disabled={isLoading}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#8ac6bb] focus:ring-offset-2 ${
            isLoading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-[#8ac6bb] text-white hover:bg-[#7ab6ab] transform hover:scale-105 shadow-md'
          }`}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Checking Health...
            </>
          ) : (
            '🔍 Test Analytics Endpoint Health'
          )}
        </button>
        
        {result && (
          <div className={`flex items-center space-x-2 text-sm font-medium ${
            result.success ? 'text-green-600' : 'text-red-600'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              result.success ? 'bg-green-500' : 'bg-red-500'
            }`}></span>
            <span>
              {result.success ? 'Healthy' : 'Unhealthy'}
              {result.responseTime && ` (${formatResponseTime(result.responseTime)})`}
            </span>
          </div>
        )}
      </div>

      {/* Collapsible Health Check Results */}
      {result && (
        <div className={`rounded-lg border transition-all duration-300 ${
          result.success 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          {/* Header with Toggle Button */}
          <div 
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-opacity-80 transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <h4 className={`font-semibold ${
              result.success ? 'text-green-800' : 'text-red-800'
            }`}>
              {result.success ? '✅ Analytics Endpoint is Healthy' : '❌ Analytics Endpoint Health Check Failed'}
            </h4>
            <button
              className={`transform transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              <svg 
                className="w-5 h-5 text-gray-600" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M19 9l-7 7-7-7" 
                />
              </svg>
            </button>
          </div>
          
          {/* Collapsible Content */}
          <div className={`overflow-hidden transition-all duration-300 ${
            isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}>
            <div className="px-4 pb-4">
              {result.success && result.data ? (
                <div className="space-y-3">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Status:</span>
                      <span className="ml-2 text-gray-800">{result.data.status}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Version:</span>
                      <span className="ml-2 text-gray-800">{result.data.version}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Response Time:</span>
                      <span className="ml-2 text-gray-800">{formatResponseTime(result.responseTime)}</span>
                    </div>
                  </div>

                  {/* Batch Validation Info */}
                  <div className="border-t border-green-200 pt-3">
                    <h5 className="font-medium text-green-800 mb-2">📊 Batch Validation Rules</h5>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Max Batch Size:</span>
                        <span className="ml-2 text-gray-800">{result.data.batch_validation.max_batch_size.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Description:</span>
                        <span className="ml-2 text-gray-800">{result.data.batch_validation.description}</span>
                      </div>
                      
                      {/* Recommended Batch Sizes */}
                      <div className="mt-3">
                        <span className="font-medium text-gray-600">Recommended Batch Sizes:</span>
                        <div className="mt-1 space-y-1">
                          {Object.entries(result.data.batch_validation.recommended_batch_sizes).map(([range, size]) => (
                            <div key={range} className="ml-4 text-gray-700">
                              <span className="font-medium">{range}:</span> {size}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-red-700">
                  <p className="font-medium">Error Details:</p>
                  <p className="mt-1 text-sm">{result.error}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthCheckButton;
