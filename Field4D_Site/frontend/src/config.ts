// Get the base URL from environment variable or default to cloud URL
const getBaseUrl = () => {
  // Debug logging
  console.log('Environment variables:', {
    DEV: import.meta.env.DEV,
    VITE_USE_LOCAL_BACKEND: import.meta.env.VITE_USE_LOCAL_BACKEND
  });

  // Check if we're in development mode and if local backend is enabled
  if (import.meta.env.DEV && import.meta.env.VITE_USE_LOCAL_BACKEND === 'true') {
    // console.log('Running on local backend: http://localhost:3001');
    return 'http://localhost:3001'; // Local backend URL
  }
  // console.log('Running on cloud backend');
  return 'https://field4fd-backend-1000435921680.us-central1.run.app'; // Cloud backend URL
};

export const API_BASE_URL = getBaseUrl();

// API endpoints
export const API_ENDPOINTS = {
  AUTH: `${API_BASE_URL}/api/auth`,
  PERMISSIONS: `${API_BASE_URL}/api/permissions`,
  EXPERIMENT_SUMMARY: `${API_BASE_URL}/api/experiment-summary`,
  FETCH_DATA: `${API_BASE_URL}/api/fetch-data`,
}; 