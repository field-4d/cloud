// Logger configuration
export const LOGGER_CONFIG = {
  // Set to false to disable all console logs
  ENABLE_LOGGING: false,
  
  // Log levels that are enabled
  LOG_LEVELS: {
    ERROR: true,
    WARN: true,
    INFO: true,
    DEBUG: false
  }
};

// Logger utility functions
export const logger = {
  error: (...args: any[]) => {
    if (LOGGER_CONFIG.ENABLE_LOGGING && LOGGER_CONFIG.LOG_LEVELS.ERROR) {
      console.error(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (LOGGER_CONFIG.ENABLE_LOGGING && LOGGER_CONFIG.LOG_LEVELS.WARN) {
      console.warn(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (LOGGER_CONFIG.ENABLE_LOGGING && LOGGER_CONFIG.LOG_LEVELS.INFO) {
      console.info(...args);
    }
  },
  
  debug: (...args: any[]) => {
    if (LOGGER_CONFIG.ENABLE_LOGGING && LOGGER_CONFIG.LOG_LEVELS.DEBUG) {
      console.debug(...args);
    }
  }
}; 