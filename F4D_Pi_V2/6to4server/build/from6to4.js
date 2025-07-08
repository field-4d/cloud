"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const express_1 = __importDefault(require("express"));
const ip_1 = __importDefault(require("ip"));
const http_1 = require("http");
const Serial_1 = require("./modules/Serial");
const pkgHandler_1 = require("./modules/pkgHandler");
const Functions_1 = require("./modules/Functions");
const Models_1 = require("./modules/Models");
const LocalMongoHandler_1 = require("./modules/LocalMongoHandler");
const notify_1 = require("./modules/notify");
const ClientFunctions_1 = require("./modules/ClientFunctions");
const fs_1 = __importDefault(require("fs"));
const auth_1 = __importDefault(require("./modules/auth"));
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
const localPort = 3111;
const clientPort = 3000;
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
let serverRunning = false;
// checking the ttyACM0 connectio
let usbConnected = true; // initially assume connected
let lastUsbErrorSent = 0;
const USB_ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown for USB error alerts
// Convert server start to use Promise
const startServerPromise = () => {
    return new Promise((resolve) => {
        httpServer.listen(localPort, () => {
            console.log(`[FieldArr@y] listening on http://${ip_1.default.address()}:${localPort}`);
            serverRunning = true;
            resolve();
        });
    });
};
// Async server start function
async function StartServer() {
    if (serverRunning) {
        return; // server is already running
    }
    const currentMinute = new Date().getMinutes();
    if (currentMinute % 3 == 0) {
        await startServerPromise();
    }
    else {
        console.log('Waiting for the current minute to be divisible by 3...');
        // Use Promise-based timeout instead of setTimeout callback
        await new Promise(resolve => setTimeout(resolve, 10 * 1000));
        await StartServer(); // Recursive call with await
    }
}
// Function that checks if the string is a valid JSON
function isJsonString(str) {
    try {
        JSON.parse(str);
        return true;
    }
    catch (e) {
        return false;
    }
}
// Initialize cors middleware for fetch API communication
const corsOptions = {
    origin: `http://${ip_1.default.address()}:${clientPort}`,
};
app.use(require('cors')(corsOptions));
app.use(express_1.default.json());
// registred the auth route
app.use('/api', auth_1.default);
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
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'ProcessingStatus', status: 'enabled' }));
            }
        });
    });
    try {
        const clientSensors = await (0, LocalMongoHandler_1.getClientSensors)();
        // Send response - JSON processing remains disabled while sending
        res.send(clientSensors);
    }
    catch (error) {
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
    }
    catch (error) {
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
wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        if (message.toString() === 'undefined')
            return;
        try {
            const received = JSON.parse(message);
            switch (received.type) {
                case 'setSensor':
                    await (0, ClientFunctions_1.handleSetSensor)(received);
                    break;
                case 'startNewExperiment':
                    await (0, ClientFunctions_1.handleStartNewExperiment)(received, ws);
                    break;
                case 'endExperiment':
                    await (0, ClientFunctions_1.handleEndExperiment)(received, ws);
                    break;
                case 'SwitchSensor':
                    await (0, ClientFunctions_1.handleSwitchSensorsList)(received, ws);
                    break;
                case 'EmailAlert':
                    console.log("Got command to send email alert");
                    await (0, ClientFunctions_1.handleUpdateAlertedMail)(received, ws);
                    break;
                /////////////////////////////////////
                case 'UpdateDataArray':
                    console.log("Starting CSV update - temporarily disabling JSON processing");
                    // Disable JSON processing during CSV update
                    jsonProcessingEnabled = false;
                    try {
                        await (0, ClientFunctions_1.handleUpdateByCSV)(received, ws);
                    }
                    finally {
                        // Re-enable JSON processing when done, even if there was an error
                        jsonProcessingEnabled = true;
                        console.log("CSV update complete - JSON processing re-enabled");
                        ws.send(JSON.stringify({ type: 'ProcessingStatus', status: 'enabled' }));
                    }
                    break;
                ////////////////////////////////////
                case 'experimentSelection':
                    await (0, ClientFunctions_1.handleGetExperimentsInfo)(received, ws);
                    break;
                case 'InfluxPull':
                    await (0, ClientFunctions_1.handleInfluxPull)(received, ws);
                    break;
                case 'addCordinates':
                    await (0, ClientFunctions_1.handleAddCordinates)(received, ws);
                    break;
                case 'removeSensorBoot':
                    console.log("Got command to remove sensor from boot");
                    await (0, ClientFunctions_1.handleRemoveBootSensor)(received, ws);
                    break;
                case 'AddExperimentInfo':
                    console.log("Got command to add AddExperimentInfo to sensor");
                    await (0, ClientFunctions_1.handleAddExperiment)(received, ws);
                    break;
                case 'UpdateLabel':
                    console.log("Got command to update label");
                    await (0, ClientFunctions_1.handleUpdateLabel)(received, ws);
                    break;
            }
        }
        catch (err) {
            console.error('Error processing WebSocket message:', err.message);
        }
    });
});
// Async function to check for DeadMan alerts
async function checkTimeForDeadManAlerts() {
    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour === 9 && !DeadManAlertsSent) {
        await (0, notify_1.DeadManAlerts)();
        DeadManAlertsSent = true;
    }
    else if (currentHour !== 9) {
        DeadManAlertsSent = false;
    }
}
let logBuffer = ''; // Buffer to store incoming log messages
let panId = ''; // To store PANID
let randomQuote = ''; // To store Random Quote
function checkAndPrintStartupLog(raw) {
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
    }
    catch (error) {
        console.error('Error checking for DeadMan alerts:', error);
    }
}, minuteInterval * 60 * 1000);
// Process data from sensors asynchronously
Serial_1.Port.on('data', async (raw) => {
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
    }
    catch (err) {
        jsonValid = false;
    }
    try {
        // Check both jsonProcessingEnabled AND jsonValid before processing
        if (jsonProcessingEnabled && jsonValid) {
            let Packet = (0, Models_1.Package)(packetBuffer);
            console.log('New packet from: ' + Packet.ADDR + ' at: ' + Packet.TIME);
            // Process alerts asynchronously
            await (0, notify_1.alerter_2)(packetBuffer);
            // Check for scheduled alert sending
            const currentMinute = new Date().getMinutes();
            if (currentMinute % 16 === 0 && !alertsSentInCurrentPeriod) {
                await (0, notify_1.sendAccumulatedAlerts)();
                alertsSentInCurrentPeriod = true;
            }
            else if (currentMinute % 16 !== 0) {
                alertsSentInCurrentPeriod = false;
            }
            // Process sensor data asynchronously
            if ((0, pkgHandler_1.isNewSP)(Packet.ADDR)) {
                await (0, pkgHandler_1.addNewSP)(Packet);
            }
            else if ((0, pkgHandler_1.isNewPackage)(Packet.ADDR, Packet.NUM)) {
                await (0, pkgHandler_1.updateNewPackage)(Packet);
            }
            // Update sensor last seen time
            await (0, LocalMongoHandler_1.updateSensorLastSeen)(Packet.ADDR.toString(), Packet.TIME.toString());
            // Send data to all WebSocket clients
            const sendPromises = Array.from(wss.clients).map((ws) => (0, ClientFunctions_1.sendLaaToClient)(Packet.ADDR, Packet.TIME.toString(), ws));
            await Promise.all(sendPromises);
        }
        else if ((0, Functions_1.isPing)(raw)) {
            const ipv6 = (0, Functions_1.getIpv6byPing)(raw);
            console.log("Ping From:" + ipv6);
            // Send ping to all WebSocket clients
            const pingPromises = Array.from(wss.clients).map((ws) => (0, ClientFunctions_1.sendPingToClient)(ipv6, ws));
            await Promise.all(pingPromises);
        }
    }
    catch (err) {
        console.error('Error processing data:', err.message);
    }
});
Serial_1.Port.on('error', (err) => {
    console.error('SerialPort error:', err.message);
    const now = Date.now();
    const cooldownPassed = now - lastUsbErrorSent > USB_ALERT_COOLDOWN_MS;
    // Only send email if USB was previously connected and cooldown passed
    if (usbConnected && cooldownPassed) {
        usbConnected = false; // Mark USB as disconnected
        lastUsbErrorSent = now; // Record time of this alert
        (0, notify_1.sendSerialPortErrorAlert)(err); // Send email alert
    }
});
// Check if the serial port is connected at startup
const SERIAL_DEVICE_PATH = '/dev/ttyACM0';
function checkSerialPortConnected() {
    try {
        return fs_1.default.existsSync(SERIAL_DEVICE_PATH);
    }
    catch (e) {
        return false;
    }
}
if (!checkSerialPortConnected()) {
    console.error(`Serial device (LaunchPad) (LaunchPad) ${SERIAL_DEVICE_PATH} is not connected at startup.`);
    (0, notify_1.sendSerialPortErrorAlert)({ message: `Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} is not connected at startup.` });
    usbConnected = false;
    lastUsbErrorSent = Date.now();
}
else {
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
        (0, notify_1.sendSerialPortErrorAlert)({ message: `Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} became disconnected.` });
        usbConnected = false;
        lastUsbErrorSent = now;
        disconnectedAlertCount = 1;
        // Check if device is still disconnected, alert count not exceeded, and cooldown has passed
    }
    else if (!connected && !usbConnected && disconnectedAlertCount < MAX_DISCONNECTED_ALERTS && cooldownPassed) {
        // Still disconnected, send up to 3 alerts
        console.warn(`Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} is still disconnected. Alert #${disconnectedAlertCount + 1}`);
        (0, notify_1.sendSerialPortErrorAlert)({ message: `Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} is still disconnected. Alert #${disconnectedAlertCount + 1}` });
        lastUsbErrorSent = now;
        disconnectedAlertCount++;
        // Check if device has reconnected after being disconnected
    }
    else if (connected && !usbConnected) {
        console.log(`Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} reconnected.`);
        usbConnected = true;
        disconnectedAlertCount = 0; // Reset counter on reconnection
        // Check if device is still connected
    }
    // Flag to Debug still connected state
    // else if (connected && usbConnected) {
    //   console.log(`Serial device (LaunchPad) ${SERIAL_DEVICE_PATH} is still connected.`);
    // }
}, 3 * 60 * 1000); // 3 minutes
