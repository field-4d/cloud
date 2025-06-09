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
 * Authenticates a user.
 * @body { email: string, password: string }
 * @returns { success: boolean, message: string, userData?: object }
 * Side effect: queries BigQuery for user credentials.
 */
app.post('/api/auth', async (req, res) => {
  try {
    const { email, password } = req.body;
    logStructured('INFO', 'Auth request received', { email });

    // Query to check user credentials
    const query = `
      SELECT email, hashed_password, created_at, last_login
      FROM \`${process.env.GCP_USER_TABLE}\`
      WHERE email = @email
      LIMIT 1
    `;

    const options = {
      query: query,
      params: { email: email },
    };

    logStructured('DEBUG', 'Executing BigQuery query', { options });
    
    try {
      const [rows] = await bigquery.query(options);
      logStructured('DEBUG', 'Query results', { rowCount: rows.length });

      if (rows.length === 0) {
        logStructured('WARNING', 'No user found', { email });
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const user = rows[0];
      logStructured('DEBUG', 'Found user', {
        email: user.email,
        created_at: user.created_at,
        last_login: user.last_login
      });

      // Check if the password matches
      if (user.hashed_password !== hashPassword(password)) {
        logStructured('WARNING', 'Password mismatch', { email });
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      logStructured('INFO', 'Authentication successful', { email });
      res.json({
        success: true,
        message: 'Authentication successful',
        userData: {
          email: user.email,
          created_at: user.created_at,
          last_login: user.last_login
        }
      });
    } catch (queryError) {
      logStructured('ERROR', 'BigQuery query error', {
        error: queryError.message,
        code: queryError.code,
        errors: queryError.errors
      });
      throw queryError;
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

// Start server
app.listen(port, () => {
  logStructured('INFO', 'Server started', {
    port,
    projectId: process.env.GCP_PROJECT_ID
  });
}); 