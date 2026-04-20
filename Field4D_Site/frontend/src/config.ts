// Get the base URL from environment variable or default to cloud URL
import { logger } from './config/logger';


const getBaseUrl = () => {
  // Local backend override for dev only.
  if (import.meta.env.DEV && import.meta.env.VITE_USE_LOCAL_BACKEND === 'true') {
    return 'http://localhost:3001';
  }

  // Production/staging: rely on VITE_API_BASE_URL.
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (envBaseUrl && typeof envBaseUrl === 'string' && envBaseUrl.trim().length > 0) {
    return envBaseUrl;
  }

  // Last-resort fallback (should only happen if env var is missing).
  logger.warn('VITE_API_BASE_URL is not set; falling back to http://localhost:3001');
  return 'http://localhost:3001';
};

export const API_BASE_URL = getBaseUrl();

// API endpoints
export const API_ENDPOINTS = {
  AUTH: `${API_BASE_URL}/api/auth`,
  PERMISSIONS: `${API_BASE_URL}/api/permissions`,
  EXPERIMENT_SUMMARY: `${API_BASE_URL}/api/experiment-summary`,
  FETCH_DATA: `${API_BASE_URL}/api/fetch-data`,
};

// Analytics API endpoints
export const API_ENDPOINTS_ANALYTICS = 'https://field4d-analytics-1000435921680.us-central1.run.app'; 