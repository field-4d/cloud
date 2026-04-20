import { API_BASE_URL } from '../../config';
import { apiLog, logger } from '../../config/logger';

export interface HealthCheckResponse {
  status: string;
  version: string;
  batch_validation: {
    max_batch_size: number;
    description: string;
    recommended_batch_sizes: {
      [key: string]: string;
    };
  };
}

export interface HealthCheckResult {
  success: boolean;
  data?: HealthCheckResponse;
  error?: string;
  responseTime?: number;
}

/**
 * Health check utility for the analytics API endpoint
 * Uses backend proxy to avoid CORS issues
 * @returns Promise<HealthCheckResult> - Health check result with response data or error
 */
export const checkAnalyticsHealth = async (): Promise<HealthCheckResult> => {
  const startTime = Date.now();
  
  try {
    logger.info('Checking analytics endpoint health via backend proxy...');
    
    const response = await fetch(`${API_BASE_URL}/api/analytics-health`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Analytics health check failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        responseTime
      });
      
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseTime
      };
    }

    const data: HealthCheckResult = await response.json();
    apiLog('[API] analytics-health response', data);
    
    logger.info('Analytics health check successful:', {
      status: data.data?.status,
      version: data.data?.version,
      responseTime: data.responseTime
    });
    
    return data;
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('Analytics health check error:', {
      error: errorMessage,
      responseTime
    });
    
    return {
      success: false,
      error: errorMessage,
      responseTime
    };
  }
}; 
