"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var ip_1 = __importDefault(require("ip"));
var http_1 = require("http");
var Serial_1 = require("./modules/Serial");
var pkgHandler_1 = require("./modules/pkgHandler");
var Functions_1 = require("./modules/Functions");
var Models_1 = require("./modules/Models");
var LocalMongoHandler_1 = require("./modules/LocalMongoHandler");
var notify_1 = require("./modules/notify");
var ClientFunctions_1 = require("./modules/ClientFunctions");
var WebSocket = require('ws');
var wss = new WebSocket.Server({ port: 8080 });
var localPort = 3111;
var clientPort = 3000;
var app = (0, express_1.default)();
var httpServer = (0, http_1.createServer)(app);
var serverRunning = false;
// Convert server start to use Promise
var startServerPromise = function () {
    return new Promise(function (resolve) {
        httpServer.listen(localPort, function () {
            console.log("[FieldArr@y] listening on http://".concat(ip_1.default.address(), ":").concat(localPort));
            serverRunning = true;
            resolve();
        });
    });
};
// Async server start function
function StartServer() {
    return __awaiter(this, void 0, void 0, function () {
        var currentMinute;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (serverRunning) {
                        return [2 /*return*/]; // server is already running
                    }
                    currentMinute = new Date().getMinutes();
                    if (!(currentMinute % 3 == 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, startServerPromise()];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 2:
                    console.log('Waiting for the current minute to be divisible by 3...');
                    // Use Promise-based timeout instead of setTimeout callback
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 10 * 1000); })];
                case 3:
                    // Use Promise-based timeout instead of setTimeout callback
                    _a.sent();
                    return [4 /*yield*/, StartServer()];
                case 4:
                    _a.sent(); // Recursive call with await
                    _a.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    });
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
var corsOptions = {
    origin: "http://".concat(ip_1.default.address(), ":").concat(clientPort),
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
app.get('/getAll', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var clientSensors, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                // Only proceed if JSON processing is enabled
                if (!jsonProcessingEnabled) {
                    console.log("Skipping getAll request - JSON processing is currently disabled");
                    return [2 /*return*/, res.status(503).send({
                            error: 'Service temporarily unavailable',
                            message: 'JSON processing is currently disabled, please try again later'
                        })];
                }
                console.log("Starting getClientSensors - temporarily disabling JSON processing");
                // Disable JSON processing during sensor retrieval
                jsonProcessingEnabled = false;
                // Set up event listener BEFORE sending response
                res.on('finish', function () {
                    // This will execute only after the entire response has been sent
                    jsonProcessingEnabled = true;
                    console.log("getClientSensors response completely sent - JSON processing re-enabled");
                    // Notify any connected WebSocket clients that processing is re-enabled
                    wss.clients.forEach(function (client) {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'ProcessingStatus', status: 'enabled' }));
                        }
                    });
                });
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, (0, LocalMongoHandler_1.getClientSensors)()];
            case 2:
                clientSensors = _a.sent();
                // Send response - JSON processing remains disabled while sending
                res.send(clientSensors);
                return [3 /*break*/, 4];
            case 3:
                error_1 = _a.sent();
                console.error('Error retrieving client sensors:', error_1);
                // Re-enable manually in case of error since 'finish' won't fire
                jsonProcessingEnabled = true;
                console.log("getClientSensors error - JSON processing re-enabled");
                res.status(500).send({ error: 'Failed to get sensors data' });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Start server immediately using async/await
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, startServerPromise()];
            case 1:
                _a.sent();
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                console.error('Failed to start server:', error_2);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); })();
// Global variables for state tracking
var DeadManAlertsSent = false;
var alertsSentInCurrentPeriod = false;
var capture = false;
var jsonValid = false;
var jsonBuffer = '';
var packetBuffer = '';
var jsonProcessingEnabled = true; // New flag to control JSON processing
// Server <-> Sensors with WebSocket - handle messages asynchronously
wss.on('connection', function (ws) {
    ws.on('message', function (message) { return __awaiter(void 0, void 0, void 0, function () {
        var received, _a, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (message.toString() === 'undefined')
                        return [2 /*return*/];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 30, , 31]);
                    received = JSON.parse(message);
                    _a = received.type;
                    switch (_a) {
                        case 'setSensor': return [3 /*break*/, 2];
                        case 'startNewExperiment': return [3 /*break*/, 4];
                        case 'endExperiment': return [3 /*break*/, 6];
                        case 'SwitchSensor': return [3 /*break*/, 8];
                        case 'EmailAlert': return [3 /*break*/, 10];
                        case 'UpdateDataArray': return [3 /*break*/, 12];
                        case 'experimentSelection': return [3 /*break*/, 17];
                        case 'InfluxPull': return [3 /*break*/, 19];
                        case 'addCordinates': return [3 /*break*/, 21];
                        case 'removeSensorBoot': return [3 /*break*/, 23];
                        case 'AddExperimentInfo': return [3 /*break*/, 25];
                        case 'UpdateLabel': return [3 /*break*/, 27];
                    }
                    return [3 /*break*/, 29];
                case 2: return [4 /*yield*/, (0, ClientFunctions_1.handleSetSensor)(received)];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 4: return [4 /*yield*/, (0, ClientFunctions_1.handleStartNewExperiment)(received, ws)];
                case 5:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 6: return [4 /*yield*/, (0, ClientFunctions_1.handleEndExperiment)(received, ws)];
                case 7:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 8: return [4 /*yield*/, (0, ClientFunctions_1.handleSwitchSensorsList)(received, ws)];
                case 9:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 10:
                    console.log("Got command to send email alert");
                    return [4 /*yield*/, (0, ClientFunctions_1.handleUpdateAlertedMail)(received, ws)];
                case 11:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 12:
                    console.log("Starting CSV update - temporarily disabling JSON processing");
                    // Disable JSON processing during CSV update
                    jsonProcessingEnabled = false;
                    _b.label = 13;
                case 13:
                    _b.trys.push([13, , 15, 16]);
                    return [4 /*yield*/, (0, ClientFunctions_1.handleUpdateByCSV)(received, ws)];
                case 14:
                    _b.sent();
                    return [3 /*break*/, 16];
                case 15:
                    // Re-enable JSON processing when done, even if there was an error
                    jsonProcessingEnabled = true;
                    console.log("CSV update complete - JSON processing re-enabled");
                    ws.send(JSON.stringify({ type: 'ProcessingStatus', status: 'enabled' }));
                    return [7 /*endfinally*/];
                case 16: return [3 /*break*/, 29];
                case 17: return [4 /*yield*/, (0, ClientFunctions_1.handleGetExperimentsInfo)(received, ws)];
                case 18:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 19: return [4 /*yield*/, (0, ClientFunctions_1.handleInfluxPull)(received, ws)];
                case 20:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 21: return [4 /*yield*/, (0, ClientFunctions_1.handleAddCordinates)(received, ws)];
                case 22:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 23:
                    console.log("Got command to remove sensor from boot");
                    return [4 /*yield*/, (0, ClientFunctions_1.handleRemoveBootSensor)(received, ws)];
                case 24:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 25:
                    console.log("Got command to add AddExperimentInfo to sensor");
                    return [4 /*yield*/, (0, ClientFunctions_1.handleAddExperiment)(received, ws)];
                case 26:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 27:
                    console.log("Got command to update label");
                    return [4 /*yield*/, (0, ClientFunctions_1.handleUpdateLabel)(received, ws)];
                case 28:
                    _b.sent();
                    return [3 /*break*/, 29];
                case 29: return [3 /*break*/, 31];
                case 30:
                    err_1 = _b.sent();
                    console.error('Error processing WebSocket message:', err_1.message);
                    return [3 /*break*/, 31];
                case 31: return [2 /*return*/];
            }
        });
    }); });
});
// Async function to check for DeadMan alerts
function checkTimeForDeadManAlerts() {
    return __awaiter(this, void 0, void 0, function () {
        var now, currentHour;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = new Date();
                    currentHour = now.getHours();
                    if (!(currentHour === 9 && !DeadManAlertsSent)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, notify_1.DeadManAlerts)()];
                case 1:
                    _a.sent();
                    DeadManAlertsSent = true;
                    return [3 /*break*/, 3];
                case 2:
                    if (currentHour !== 9) {
                        DeadManAlertsSent = false;
                    }
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
var logBuffer = ''; // Buffer to store incoming log messages
var panId = ''; // To store PANID
var randomQuote = ''; // To store Random Quote
function checkAndPrintStartupLog(raw) {
    // Accumulate logs in a buffer
    logBuffer += raw;
    // Check for PANID
    var panIdMatch = logBuffer.match(/PANID 0x[0-9a-fA-F]+/);
    if (panIdMatch) {
        panId = panIdMatch[0]; // Store the PANID information
    }
    // Check for Random Quote
    var quoteMatch = logBuffer.match(/Random Quote: "([^"]+)"/);
    if (quoteMatch) {
        randomQuote = quoteMatch[1]; // Store the Random Quote
    }
    // Define the end of the log message to know when to print
    var logEnd = "Initialization Completed Successfully.";
    if (logBuffer.includes(logEnd)) {
        if (panId && randomQuote) {
            console.log("Detected PANID Information: ".concat(panId));
            console.log("Random Quote: \"".concat(randomQuote, "\""));
        }
        // Reset for the next set of logs
        logBuffer = '';
        panId = '';
        randomQuote = '';
    }
}
// Set interval using async function
var minuteInterval = 15;
setInterval(function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, checkTimeForDeadManAlerts()];
            case 1:
                _a.sent();
                return [3 /*break*/, 3];
            case 2:
                error_3 = _a.sent();
                console.error('Error checking for DeadMan alerts:', error_3);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); }, minuteInterval * 60 * 1000);
// Process data from sensors asynchronously
Serial_1.Port.on('data', function (raw) { return __awaiter(void 0, void 0, void 0, function () {
    var Packet_1, currentMinute, sendPromises, ipv6_1, pingPromises, err_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                checkAndPrintStartupLog(raw);
                console.log(raw);
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
                _a.label = 1;
            case 1:
                _a.trys.push([1, 15, , 16]);
                if (!(jsonProcessingEnabled && jsonValid)) return [3 /*break*/, 12];
                Packet_1 = (0, Models_1.Package)(packetBuffer);
                console.log('New packet from: ' + Packet_1.ADDR + ' at: ' + Packet_1.TIME);
                // Process alerts asynchronously
                return [4 /*yield*/, (0, notify_1.alerter_2)(packetBuffer)];
            case 2:
                // Process alerts asynchronously
                _a.sent();
                currentMinute = new Date().getMinutes();
                if (!(currentMinute % 16 === 0 && !alertsSentInCurrentPeriod)) return [3 /*break*/, 4];
                return [4 /*yield*/, (0, notify_1.sendAccumulatedAlerts)()];
            case 3:
                _a.sent();
                alertsSentInCurrentPeriod = true;
                return [3 /*break*/, 5];
            case 4:
                if (currentMinute % 16 !== 0) {
                    alertsSentInCurrentPeriod = false;
                }
                _a.label = 5;
            case 5:
                if (!(0, pkgHandler_1.isNewSP)(Packet_1.ADDR)) return [3 /*break*/, 7];
                return [4 /*yield*/, (0, pkgHandler_1.addNewSP)(Packet_1)];
            case 6:
                _a.sent();
                return [3 /*break*/, 9];
            case 7:
                if (!(0, pkgHandler_1.isNewPackage)(Packet_1.ADDR, Packet_1.NUM)) return [3 /*break*/, 9];
                return [4 /*yield*/, (0, pkgHandler_1.updateNewPackage)(Packet_1)];
            case 8:
                _a.sent();
                _a.label = 9;
            case 9: 
            // Update sensor last seen time
            return [4 /*yield*/, (0, LocalMongoHandler_1.updateSensorLastSeen)(Packet_1.ADDR.toString(), Packet_1.TIME.toString())];
            case 10:
                // Update sensor last seen time
                _a.sent();
                sendPromises = Array.from(wss.clients).map(function (ws) {
                    return (0, ClientFunctions_1.sendLaaToClient)(Packet_1.ADDR, Packet_1.TIME.toString(), ws);
                });
                return [4 /*yield*/, Promise.all(sendPromises)];
            case 11:
                _a.sent();
                return [3 /*break*/, 14];
            case 12:
                if (!(0, Functions_1.isPing)(raw)) return [3 /*break*/, 14];
                ipv6_1 = (0, Functions_1.getIpv6byPing)(raw);
                console.log("Ping From:" + ipv6_1);
                pingPromises = Array.from(wss.clients).map(function (ws) {
                    return (0, ClientFunctions_1.sendPingToClient)(ipv6_1, ws);
                });
                return [4 /*yield*/, Promise.all(pingPromises)];
            case 13:
                _a.sent();
                _a.label = 14;
            case 14: return [3 /*break*/, 16];
            case 15:
                err_2 = _a.sent();
                console.error('Error processing data:', err_2.message);
                return [3 /*break*/, 16];
            case 16: return [2 /*return*/];
        }
    });
}); });
