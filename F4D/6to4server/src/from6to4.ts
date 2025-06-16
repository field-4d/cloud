/**
 * @file from6to4.ts
 * @description
 * Main server file for the 6to4server project. Handles communication between sensors (via serial port),
 * WebSocket clients, and HTTP clients. Implements alerting, experiment management, and sensor data handling.
 * 
 * Features:
 * - Express HTTP server for REST API endpoints.
 * - WebSocket server for real-time communication with clients.
 * - Serial port data processing for sensor packets.
 * - Alerting system for battery and DeadMan notifications.
 * - Experiment and sensor management functions.
 * - JSON processing control to avoid race conditions during critical operations.
 * 
 * Key Modules Imported:
 * - Serial port communication (`Port`)
 * - Package and sensor management (`pkgHandler`, `LocalMongoHandler`)
 * - Notification and alerting (`notify`)
 * - Client-side experiment and sensor operations (`ClientFunctions`)
 * 
 * Global State:
 * - Tracks server running state, USB connection, alert cooldowns, and JSON processing status.
 * 
 * Main Event Flows:
 * - HTTP GET `/getAll`: Returns all client sensors, disables JSON processing during operation.
 * - WebSocket: Handles various client commands for experiments, sensor management, and alerts.
 * - Serial Port: Processes incoming sensor data, triggers alerts, updates sensor state, and notifies clients.
 * 
 * Error Handling:
 * - Serial port errors trigger alert notifications with cooldown.
 * - All async operations are wrapped with try/catch for robust error logging.
 * 
 * Scheduling:
 * - Periodic DeadMan alert checks.
 * - Scheduled sending of accumulated alerts.
 * 
 * @author
 * FieldArr@y Team
 * 
 * @remarks
 * This file is intended to be run on a server with access to both the serial port and network interfaces.
 * Ensure all required modules and hardware are available before running.
 */
import express from 'express';
import ip from 'ip';
import { createServer } from 'http';
import { Port } from './modules/Serial';
import { isNewSP, addNewSP, isNewPackage, updateNewPackage} from './modules/pkgHandler';
import { checkPkg, getIpv6byPing, isPing } from './modules/Functions';
import { Package } from './modules/Models';
import { getClientSensors, updateSensorLastSeen } from './modules/LocalMongoHandler';
import { batteryAlerter, alerter, alerter_2, sendAccumulatedAlerts, DeadManAlerts, sendSerialPortErrorAlert } from './modules/notify';
import { 
  handleStartNewExperiment, handleSetSensor, 
  sendLaaToClient, sendPingToClient, handleEndExperiment, 
  handleSwitchSensorsList, handleUpdateAlertedMail, handleUpdateByCSV,
  handleGetExperimentsInfo, handleInfluxPull, 
  handleAddCordinates, handleRemoveBootSensor, handleAddExperiment, handleUpdateLabel
} from './modules/ClientFunctions';
import fs from 'fs';

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const localPort: number = 3111;
const clientPort: number = 3000;
const app = express();
const httpServer = createServer(app);

let serverRunning = false;


// checking the ttyACM0 connectio
let usbConnected = true; // initially assume connected
let lastUsbErrorSent: number = 0;
const USB_ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown for USB error alerts

// Convert server start to use Promise
const startServerPromise = (): Promise<void> => {
  return new Promise((resolve) => {
    httpServer.listen(localPort, () => {
      console.log(`[FieldArr@y] listening on http://${ip.address()}:${localPort}`);
      serverRunning = true;
      resolve();
    });
  });
};

// Async server start function
async function StartServer(): Promise<void> {
  if (serverRunning) {
    return; // server is already running
  }
  const currentMinute = new Date().getMinutes();
  if (currentMinute % 3 == 0) {
    await startServerPromise();
  } else {
    console.log('Waiting for the current minute to be divisible by 3...');
    // Use Promise-based timeout instead of setTimeout callback
    await new Promise(resolve => setTimeout(resolve, 10 * 1000));
    await StartServer(); // Recursive call with await
  }
}

// Function that checks if the string is a valid JSON
function isJsonString(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

// Initialize cors middleware for fetch API communication
const corsOptions = {
  origin: `http://${ip.address()}:${clientPort}`,
};
app.use(require('cors')(corsOptions));

// Handle fetch API - already using async/await
// app.get('/getAll', async (req, res) => {
//   try {
//     const clientSensors = await getClientSensors();
//     res.send(clientSensors);
//   } catch (error) {
//     console.error('Error retrieving client sensors:', error);
//     res.status(500).send({ error: 'Failed to get sensors data' });
//   }
// });

// Handle fetch API - check if JSON processing is enabled before proceeding
// Handle fetch API - with improved completion detection
app.get('/getAll', async (req, res) => {
  // Only proceed if JSON processing is enabled
  if (!jsonProcessingEnabled) {
    console.log("Skipping getAll request - JSON processing is currently disabled");
    return res.status(503).send({ 
      error: 'Service temporarily unavailable', 
      message: 'JSON processing is currently disabled, please try again later' 
    });
  }

  console.log("Starting getClientSensors - temporarily disabling JSON processing");
  // Disable JSON processing during sensor retrieval
  jsonProcessingEnabled = false;
  
  // Set up event listener BEFORE sending response
  res.on('finish', () => {
    // This will execute only after the entire response has been sent
    jsonProcessingEnabled = true;
    console.log("getClientSensors response completely sent - JSON processing re-enabled");
    
    // Notify any connected WebSocket clients that processing is re-enabled
    wss.clients.forEach((client: any) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'ProcessingStatus', status: 'enabled' }));
      }
    });
  });
  
  try {
    const clientSensors = await getClientSensors();
    // Send response - JSON processing remains disabled while sending
    res.send(clientSensors);
  } catch (error) {
    console.error('Error retrieving client sensors:', error);
    // Re-enable manually in case of error since 'finish' won't fire
    jsonProcessingEnabled = true;
    console.log("getClientSensors error - JSON processing re-enabled");
    res.status(500).send({ error: 'Failed to get sensors data' });
  }
  // No finally block - we're using the 'finish' event instead
});

// Start server immediately using async/await
(async () => {
  try {
    await startServerPromise();
  } catch (error) {
    console.error('Failed to start server:', error);
  }
})();


// Global variables for state tracking
let DeadManAlertsSent = false;
let alertsSentInCurrentPeriod = false;
let capture = false;
let jsonValid = false;
let jsonBuffer = '';
let packetBuffer = '';
let jsonProcessingEnabled = true; // New flag to control JSON processing

// Server <-> Sensors with WebSocket - handle messages asynchronously
wss.on('connection', (ws: any) => {
  ws.on('message', async (message: any) => {
    if (message.toString() === 'undefined') return;
    
    try {
      const received = JSON.parse(message);
      
      switch (received.type) {
        case 'setSensor':
          await handleSetSensor(received);
          break;
        case 'startNewExperiment':
          await handleStartNewExperiment(received, ws);
          break;
        case 'endExperiment':
          await handleEndExperiment(received, ws);
          break;
        case 'SwitchSensor':
          await handleSwitchSensorsList(received, ws);
          break;
        case 'EmailAlert':
          console.log("Got command to send email alert");
          await handleUpdateAlertedMail(received, ws);
          break;
         /////////////////////////////////////
        case 'UpdateDataArray':
          console.log("Starting CSV update - temporarily disabling JSON processing");
          // Disable JSON processing during CSV update
          jsonProcessingEnabled = false;
          try {
            await handleUpdateByCSV(received, ws);
          } finally {
            // Re-enable JSON processing when done, even if there was an error
            jsonProcessingEnabled = true;
            console.log("CSV update complete - JSON processing re-enabled");
            ws.send(JSON.stringify({ type: 'ProcessingStatus', status: 'enabled' }));
          }
          break;
          ////////////////////////////////////
        case 'experimentSelection':
          await handleGetExperimentsInfo(received, ws);
          break;
        case 'InfluxPull':
          await handleInfluxPull(received, ws);
          break;
        case 'addCordinates':
          await handleAddCordinates(received, ws);
          break;
        case 'removeSensorBoot':
          console.log("Got command to remove sensor from boot");
          await handleRemoveBootSensor(received, ws);
          break;
        case 'AddExperimentInfo':
          console.log("Got command to add AddExperimentInfo to sensor");
          await handleAddExperiment(received, ws);
          break;
        case 'UpdateLabel':
          console.log("Got command to update label");
          await handleUpdateLabel(received, ws);
          break;
      }
    } catch (err: any) {
      console.error('Error processing WebSocket message:', err.message);
    }
  });
});



// Async function to check for DeadMan alerts
async function checkTimeForDeadManAlerts(): Promise<void> {
  const now = new Date();
  const currentHour = now.getHours();

  if (currentHour === 9 && !DeadManAlertsSent) {
    await DeadManAlerts();
    DeadManAlertsSent = true;
  } else if (currentHour !== 9) {
    DeadManAlertsSent = false;
  }
}
let logBuffer = ''; // Buffer to store incoming log messages
let panId = ''; // To store PANID
let randomQuote = ''; // To store Random Quote

function checkAndPrintStartupLog(raw: string): void {
  // Accumulate logs in a buffer
  logBuffer += raw;

  // Check for PANID
  const panIdMatch = logBuffer.match(/PANID 0x[0-9a-fA-F]+/);
  if (panIdMatch) {
    panId = panIdMatch[0]; // Store the PANID information
  }

  // Check for Random Quote
  const quoteMatch = logBuffer.match(/Random Quote: "([^"]+)"/);
  if (quoteMatch) {
    randomQuote = quoteMatch[1]; // Store the Random Quote
  }

  // Define the end of the log message to know when to print
  const logEnd = "Initialization Completed Successfully.";
  if (logBuffer.includes(logEnd)) {
    if (panId && randomQuote) {
      console.log(`Detected PANID Information: ${panId}`);
      console.log(`Random Quote: "${randomQuote}"`);
    }

    // Reset for the next set of logs
    logBuffer = '';
    panId = '';
    randomQuote = '';
  }
}

// Set interval using async function
const minuteInterval = 15;
setInterval(async () => {
  try {
    await checkTimeForDeadManAlerts();
  } catch (error) {
    console.error('Error checking for DeadMan alerts:', error);
  }
}, minuteInterval * 60 * 1000);
// Process data from sensors asynchronously
Port.on('data', async (raw: string) => {
  checkAndPrintStartupLog(raw);
  // console.log(raw);
  
  if (raw.trim().startsWith('{')) {
    capture = true;
    jsonBuffer = '';
  }
  
  if (capture) {
    jsonBuffer += raw;
  }
  
  if (capture && raw.includes('}')) {
    capture = false;
  }
  
  // Try to parse the JSON
  try {
    packetBuffer = JSON.parse(jsonBuffer);
    jsonBuffer = '';
    jsonValid = true;
  } catch (err: any) {
    jsonValid = false;
  }

  try {
    // Check both jsonProcessingEnabled AND jsonValid before processing
    if (jsonProcessingEnabled && jsonValid) {
      let Packet = Package(packetBuffer);
      console.log('New packet from: ' + Packet.ADDR + ' at: ' + Packet.TIME);
      
      // Process alerts asynchronously
      await alerter_2(packetBuffer);
      
      // Check for scheduled alert sending
      const currentMinute = new Date().getMinutes();
      if (currentMinute % 16 === 0 && !alertsSentInCurrentPeriod) {
        await sendAccumulatedAlerts();
        alertsSentInCurrentPeriod = true;
      } else if (currentMinute % 16 !== 0) {
        alertsSentInCurrentPeriod = false;
      }
      
      // Process sensor data asynchronously
      if (isNewSP(Packet.ADDR)) {
        await addNewSP(Packet);
      } else if (isNewPackage(Packet.ADDR, Packet.NUM)) {
        await updateNewPackage(Packet);
      }
      
      // Update sensor last seen time
      await updateSensorLastSeen(Packet.ADDR.toString(), Packet.TIME.toString());
      
      // Send data to all WebSocket clients
      const sendPromises = Array.from(wss.clients).map((ws: any) => 
        sendLaaToClient(Packet.ADDR, Packet.TIME.toString(), ws)
      );
      await Promise.all(sendPromises);
      
    } else if (isPing(raw)) {
      const ipv6 = getIpv6byPing(raw);
      console.log("Ping From:" + ipv6);
      
      // Send ping to all WebSocket clients
      const pingPromises = Array.from(wss.clients).map((ws: any) => 
        sendPingToClient(ipv6, ws)
      );
      await Promise.all(pingPromises);
    }
  } catch (err: any) {
    console.error('Error processing data:', err.message);
  }
});

Port.on('error', (err: any) => {
  console.error('SerialPort error:', err.message);

  const now = Date.now();
  const cooldownPassed = now - lastUsbErrorSent > USB_ALERT_COOLDOWN_MS;

  // Only send email if USB was previously connected and cooldown passed
  if (usbConnected && cooldownPassed) {
    usbConnected = false; // Mark USB as disconnected
    lastUsbErrorSent = now; // Record time of this alert
    sendSerialPortErrorAlert(err); // Send email alert
  }
});

// Check if the serial port is connected at startup
const SERIAL_DEVICE_PATH = '/dev/ttyACM0';


function checkSerialPortConnected(): boolean {
  try {
    return fs.existsSync(SERIAL_DEVICE_PATH);
  } catch (e) {
    return false;
  }
}

if (!checkSerialPortConnected()) {
  console.error(`Serial device (LaunchPad) (LaunchPad) ${SERIAL_DEVICE_PATH} is not connected at startup.`);
  sendSerialPortErrorAlert({ message: `Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} is not connected at startup.` });
  usbConnected = false;
  lastUsbErrorSent = Date.now();
} else {
  console.log(`Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} is connected at startup.`);
}

// Periodically check every 5 minutes if the serial port is still connected
let disconnectedAlertCount = 0;
const MAX_DISCONNECTED_ALERTS = 2;

setInterval(() => {
  const connected = checkSerialPortConnected();
  const now = Date.now();
  const cooldownPassed = now - lastUsbErrorSent > USB_ALERT_COOLDOWN_MS;

  // Check if device just became disconnected and cooldown has passed
  if (!connected && usbConnected && cooldownPassed) {
    console.error(`Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} became disconnected.`);
    sendSerialPortErrorAlert({ message: `Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} became disconnected.` });
    usbConnected = false;
    lastUsbErrorSent = now;
    disconnectedAlertCount = 1;
  // Check if device is still disconnected, alert count not exceeded, and cooldown has passed
  } else if (!connected && !usbConnected && disconnectedAlertCount < MAX_DISCONNECTED_ALERTS && cooldownPassed) {
    // Still disconnected, send up to 3 alerts
    console.warn(`Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} is still disconnected. Alert #${disconnectedAlertCount + 1}`);
    sendSerialPortErrorAlert({ message: `Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} is still disconnected. Alert #${disconnectedAlertCount + 1}` });
    lastUsbErrorSent = now;
    disconnectedAlertCount++;
  // Check if device has reconnected after being disconnected
  } else if (connected && !usbConnected) {
    console.log(`Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} reconnected.`);
    usbConnected = true;
    disconnectedAlertCount = 0; // Reset counter on reconnection
  // Check if device is still connected
  } else if (connected && usbConnected) {
    console.log(`Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} is still connected.`);
  }
}, 1 * 60 * 1000); // 60 minutes
