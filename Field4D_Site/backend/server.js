/*
 * server.js
 * Main Express server for backend API.
 * Handles authentication, permissions, experiment summaries, and data queries.
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');
require('dotenv').config({ path: path.join(__dirname, 'auth', '.env') });

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(compression()); // Enable gzip compression
app.use(express.json());

// Helper function for structured logging
const logStructured = (severity, message, data = {}) => {
  console.log(JSON.stringify({
    severity,
    message,
    timestamp: new Date().toISOString(),
    ...data
  }));
};

// Request timing middleware with GCP structured logging
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  
  // Extract user email from request headers or body
  const userEmail = req.headers['x-user-email'] || (req.body && req.body.email) || 'anonymous';
  
  // Log request start
  logStructured('INFO', 'Request started', {
    requestId,
    userEmail,
    httpRequest: {
      requestMethod: req.method,
      requestUrl: req.url,
      requestSize: req.headers['content-length'],
      userAgent: req.headers['user-agent'],
      remoteIp: req.ip,
      protocol: req.protocol
    }
  });

  // Log request body for POST requests with more details
  if (req.method === 'POST') {
    const requestDetails = {
      requestId,
      userEmail,
      timestamp: new Date().toISOString()
    };

    // Add specific details based on the endpoint
    if (req.url === '/api/fetch-data') {
      const { table_id, experiment, selectedSensors, selectedParameters, dateRange } = req.body;
      requestDetails.requestBody = {
        system: table_id,
        experiment,
        dateRange,
        sensors: selectedSensors,
        parameters: selectedParameters
      };
    } else if (req.url === '/api/auth') {
      requestDetails.requestBody = {
        email: req.body.email,
        // Don't log the password
        hasPassword: !!req.body.password
      };
    } else {
      requestDetails.requestBody = req.body;
    }

    logStructured('DEBUG', 'Request body', requestDetails);
  }

  // Add listener for when the response is finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    logStructured('INFO', 'Request completed', {
      requestId,
      userEmail,
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.url,
        status: res.statusCode,
        responseSize: res.getHeader('content-length'),
        latency: {
          seconds: duration / 1000
        }
      }
    });
  });

  next();
});

// Initialize BigQuery client with environment variables
const bigquery = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
  credentials: {
    type: 'service_account',
    project_id: process.env.GCP_PROJECT_ID,
    private_key_id: process.env.GCP_PRIVATE_KEY_ID,
    private_key: process.env.GCP_PRIVATE_KEY?.replace(/\n/g, '\n'),
    client_email: process.env.GCP_CLIENT_EMAIL,
    client_id: process.env.GCP_CLIENT_ID,
    auth_uri: process.env.GCP_AUTH_URI,
    token_uri: process.env.GCP_TOKEN_URI,
    client_x509_cert_url: process.env.GCP_CLIENT_X509_CERT_URL
  }
});

function hashPassword(password) {
  const hash = crypto.createHash('sha256').update(password).digest();
  return Buffer.from(hash).toString('base64');
}

/**
 * POST /api/auth
 * Authenticates a user using cloud function.
 * @body { email: string, password: string }
 * @returns { success: boolean, message: string, userData?: object, jwtToken?: string }
 * Side effect: calls cloud function for authentication.
 */
app.post('/api/auth', async (req, res) => {
  try {
    const { email, password } = req.body;
    logStructured('INFO', 'Auth request received', { email });

    // Hash password using existing method
    const hashedPassword = hashPassword(password);
    logStructured('DEBUG', 'Password hashed', { email });

    // Prepare request to cloud function
    const authRequest = {
      email: email,
      hashed_password: hashedPassword
    };

    logStructured('DEBUG', 'Calling cloud function', { 
      url: process.env.GCP_AUTH_URL,
      email 
    });

    try {
      // Call cloud function
      const response = await fetch(process.env.GCP_AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authRequest),
      });

      const authResult = await response.json();
      logStructured('DEBUG', 'Cloud function response', { 
        success: authResult.success,
        message: authResult.message 
      });

      if (!response.ok || !authResult.success) {
        logStructured('WARNING', 'Authentication failed', { 
          email,
          message: authResult.message 
        });
        return res.status(401).json({
          success: false,
          message: authResult.message || 'Invalid credentials'
        });
      }

      // Authentication successful
      logStructured('INFO', 'Authentication successful', { email });
      
      // Return response with JWT token and user data
      res.json({
        success: true,
        message: 'Authentication successful',
        userData: {
          email: email,
          // Note: created_at and last_login not available from cloud function
          // These will be null/undefined until we get them from another source
        },
        jwtToken: authResult.token
      });

    } catch (cloudFunctionError) {
      logStructured('ERROR', 'Cloud function error', {
        error: cloudFunctionError.message,
        email
      });
      throw cloudFunctionError;
    }

  } catch (error) {
    logStructured('ERROR', 'Authentication error', {
      error: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({
      success: false,
      message: 'An error occurred during authentication. Please try again later.',
      error: error.message
    });
  }
});

/**
 * GET /api/permissions
 * Returns permissions for a given user email.
 * @query { email: string }
 * @returns { success: boolean, permissions: array }
 * Side effect: queries BigQuery for permissions.
 */
app.get('/api/permissions', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required',
        message: 'Please provide an email address'
      });
    }

    const query = `
    SELECT 
      p.email,
      p.owner,
      p.mac_address,
      p.experiment,
      p.role,
      p.valid_from,
      p.valid_until,
      p.created_at,
      p.table_id,
      m.table_name
    FROM \`${process.env.GCP_PERMISSION_TABLE}\` AS p
    LEFT JOIN \`${process.env.GCP_MAC_TO_DEVICE_TABLE}\` AS m
    ON p.mac_address = m.mac_address
    WHERE p.email = @email
  `;

    const options = {
      query: query,
      params: { email }
    };

    const [rows] = await bigquery.query(options);
    console.log('Permissions query results:', rows);
    
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'No permissions found',
        message: 'No permissions found for this email address'
      });
    }

    res.json({
      success: true,
      permissions: rows
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch permissions',
      message: error.message
    });
  }
});

/**
 * POST /api/experiment-summary
 * Returns summary info for experiments in a table.
 * @body { table_id: string, experiments: array }
 * @returns { experimentName, firstTimestamp, lastTimestamp, ... }
 * Side effect: queries BigQuery for experiment summary.
 */
app.post('/api/experiment-summary', async (req, res) => {
  try {
    const { table_id, experiments } = req.body;

    if (!table_id) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'table_id is required'
      });
    }

    let experimentFilter = '';
    let params = {};
    if (Array.isArray(experiments) && experiments.length > 0 && !experiments.includes('*')) {
      experimentFilter = 'WHERE ExperimentData_Exp_name IN UNNEST(@experiments)';
      params = { experiments };
    }
    // If experiments includes '*', do not filter (admin access)

    const query = `
      WITH ExperimentInfo AS (
        SELECT DISTINCT
          ExperimentData_Exp_name,
          MIN(TimeStamp) AS first_timestamp,
          MAX(TimeStamp) AS last_timestamp
        FROM \`${table_id}\`
        ${experimentFilter}
        GROUP BY ExperimentData_Exp_name
      ),

      SensorTypes AS (
        SELECT
          ExperimentData_Exp_name,
          STRING_AGG(DISTINCT SensorData_Name) AS sensor_types
        FROM \`${table_id}\`
        ${experimentFilter}
        GROUP BY ExperimentData_Exp_name
      ),

      SensorLabelOptions AS (
        SELECT
          ExperimentData_Exp_name,
          STRING_AGG(DISTINCT option) AS sensor_label_options
        FROM \`${table_id}\`,
        UNNEST(SensorData_LabelOptions) AS option
        ${experimentFilter}
        GROUP BY ExperimentData_Exp_name
      ),

      SensorLabelMap AS (
        SELECT
          ExperimentData_Exp_name,
          ARRAY_AGG(STRUCT(sensor, label)) AS sensor_label_pairs
        FROM (
          SELECT DISTINCT
            ExperimentData_Exp_name,
            SensorData_Name AS sensor,
            label
          FROM \`${table_id}\`,
          UNNEST(SensorData_Labels) AS label
          WHERE SensorData_Name IS NOT NULL 
            AND SensorData_Labels IS NOT NULL
            ${experimentFilter ? 'AND ExperimentData_Exp_name IN UNNEST(@experiments)' : ''}
        )
        GROUP BY ExperimentData_Exp_name
      )

      SELECT 
        e.ExperimentData_Exp_name AS experimentName,
        e.first_timestamp AS firstTimestamp,
        e.last_timestamp AS lastTimestamp,
        s.sensor_types AS sensorTypes,
        o.sensor_label_options AS sensorLabelOptions,
        m.sensor_label_pairs AS sensorLabelPairs
      FROM ExperimentInfo e
      JOIN SensorTypes s ON e.ExperimentData_Exp_name = s.ExperimentData_Exp_name
      LEFT JOIN SensorLabelOptions o ON e.ExperimentData_Exp_name = o.ExperimentData_Exp_name
      LEFT JOIN SensorLabelMap m ON e.ExperimentData_Exp_name = m.ExperimentData_Exp_name
      ORDER BY e.ExperimentData_Exp_name;
    `;

    const options = {
      query: query,
      params: params
    };

    const [rows] = await bigquery.query(options);

    const formattedResults = rows.map(row => {
      const sensorLabelMap = {};

      if (row.sensorLabelPairs) {
        for (const pair of row.sensorLabelPairs) {
          if (!sensorLabelMap[pair.sensor]) {
            sensorLabelMap[pair.sensor] = [];
          }
          if (!sensorLabelMap[pair.sensor].includes(pair.label)) {
            sensorLabelMap[pair.sensor].push(pair.label);
          }
        }
      }

      return {
        experimentName: row.experimentName,
        firstTimestamp: row.firstTimestamp,
        lastTimestamp: row.lastTimestamp,
        sensorTypes: row.sensorTypes?.split(',') ?? [],
        sensorLabelOptions: row.sensorLabelOptions?.split(',') ?? [],
        sensorLabelMap
      };
    });

    res.json(formattedResults);
  } catch (error) {
    console.error('Error fetching experiment summary:', error);
    res.status(500).json({ error: 'Failed to fetch experiment summary' });
  }
});

/**
 * POST /api/fetch-data
 * Returns sensor data for a given experiment, date range, and parameters.
 * @body { table_id, experiment, selectedSensors, selectedParameters, dateRange }
 * @returns { array of sensor data }
 * Side effect: queries BigQuery for sensor data.
 */
app.post('/api/fetch-data', async (req, res) => {
  const requestStartTime = Date.now();
  try {
    const { table_id, experiment, selectedSensors, selectedParameters, dateRange } = req.body;
    const userEmail = req.headers['x-user-email'] || 'anonymous';
    
    logStructured('INFO', 'Fetch data request received', {
      userEmail,
      requestDetails: {
        system: table_id,
        experiment,
        dateRange,
        sensorCount: selectedSensors?.length || 0,
        parameterCount: selectedParameters?.length || 0,
        sensors: selectedSensors,
        parameters: selectedParameters
      }
    });
    
    // Validate required fields
    if (!table_id || !experiment || !dateRange || (!selectedSensors?.length && !selectedParameters?.length)) {
      logStructured('WARNING', 'Validation failed', {
        hasTableId: !!table_id,
        hasExperiment: !!experiment,
        hasDateRange: !!dateRange,
        sensorCount: selectedSensors?.length || 0,
        parameterCount: selectedParameters?.length || 0
      });
      return res.status(400).json({ 
        error: 'Missing required fields. Need table_id, experiment, dateRange, and at least one sensor or parameter.' 
      });
    }

    // Create the field selection part of the query - always include TimeStamp and SensorData_Name
    const parameterSelections = selectedParameters
      .map(param => `\`${param}\``)
      .join(', ');

    const query = `
      SELECT 
        TimeStamp as timestamp,
        SensorData_Name as sensor_name
        ${parameterSelections ? `, ${parameterSelections}` : ''}
      FROM \`${table_id}\`
      WHERE ExperimentData_Exp_name = @experiment
        AND SensorData_Name IN UNNEST(@selectedSensors)
        AND TimeStamp BETWEEN @startDate AND @endDate
      ORDER BY TimeStamp ASC
    `;

    const options = {
      query: query,
      params: {
        experiment: experiment,
        selectedSensors: selectedSensors,
        startDate: dateRange.start,
        endDate: dateRange.end
      }
    };

    const [rows] = await bigquery.query(options);
    const queryDuration = Date.now() - requestStartTime;
    
    logStructured('INFO', 'Query completed', {
      userEmail,
      performance: {
        totalDuration: queryDuration / 1000, // in seconds
        rowCount: rows.length,
        rowsPerSecond: rows.length / (queryDuration / 1000)
      },
      requestDetails: {
        system: table_id,
        experiment
      }
    });
    
    // Transform timestamps to ISO strings for consistent formatting
    const formattedRows = rows.map(row => ({
      ...row,
      timestamp: row.timestamp.value
    }));

    res.json(formattedRows);
  } catch (error) {
    const errorDuration = Date.now() - requestStartTime;
    logStructured('ERROR', 'Error fetching selected data', {
      userEmail: req.headers['x-user-email'] || 'anonymous',
      error: error.message,
      stack: error.stack,
      code: error.code,
      performance: {
        duration: errorDuration / 1000 // in seconds
      }
    });
    res.status(500).json({
      error: 'Failed to fetch selected data',
      details: error.message
    });
  }
});

/**
 * GET /api/analytics-health
 * Proxy endpoint to check analytics service health.
 * @returns { success: boolean, data?: object, error?: string, responseTime?: number }
 * Side effect: makes HTTP request to analytics service.
 */
app.get('/api/analytics-health', async (req, res) => {
  const startTime = Date.now();
  const analyticsUrl = `${process.env.GCP_ANALYTICS_URL}/health`;
  
  try {
    logStructured('INFO', 'Analytics health check started', {
      userEmail: req.headers['x-user-email'] || 'anonymous',
      targetUrl: analyticsUrl
    });

    const response = await fetch(analyticsUrl, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      logStructured('ERROR', 'Analytics health check failed', {
        userEmail: req.headers['x-user-email'] || 'anonymous',
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        responseTime
      });
      
      return res.status(response.status).json({
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseTime
      });
    }

    const data = await response.json();
    
    logStructured('INFO', 'Analytics health check successful', {
      userEmail: req.headers['x-user-email'] || 'anonymous',
      status: data.status,
      version: data.version,
      responseTime
    });
    
    res.json({
      success: true,
      data,
      responseTime
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error.message || 'Unknown error';
    
    logStructured('ERROR', 'Analytics health check error', {
      userEmail: req.headers['x-user-email'] || 'anonymous',
      error: errorMessage,
      responseTime
    });
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      responseTime
    });
  }
});

// Start server
app.listen(port, () => {
  logStructured('INFO', 'Server started', {
    port,
    projectId: process.env.GCP_PROJECT_ID
  });
}); 