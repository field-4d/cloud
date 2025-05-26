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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPingToClient = exports.sendLaaToClient = exports.handleUpdateLabel = exports.handleUpdateByCSV = exports.handleUpdateAlertedMail = exports.handleSwitchSensorsList = exports.handleGetExperimentsInfo = exports.handleRemoveSensor = exports.handleSetSensor = exports.handleEndExperiment = exports.handleStartNewExperiment = exports.handleRemoveBootSensor = exports.handleAddCordinates = exports.handleAddExperiment = exports.handleInfluxPull = void 0;
var pkgHandler_1 = require("./pkgHandler");
var Functions_1 = require("./Functions");
var LocalMongoHandler_1 = require("./LocalMongoHandler");
var DB_1 = require("./DB");
// dssdssdfdf
function handleInfluxPull(recieved, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var expName, data, event;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    expName = recieved.data;
                    console.log("handleInfluxPull - i'll pull from influx: ", expName);
                    return [4 /*yield*/, (0, DB_1.queryFromBlackBox)(expName)];
                case 1:
                    data = _a.sent();
                    event = {
                        type: 'influx_pull_success',
                        data: data,
                    };
                    ws.send(JSON.stringify(event));
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleInfluxPull = handleInfluxPull;
function handleAddExperiment(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var experimentData, expName, expLocation;
        return __generator(this, function (_a) {
            console.log('addExperiment received from client');
            experimentData = received.data[1];
            expName = experimentData.Exp_name;
            expLocation = experimentData.Exp_location;
            // print the data
            console.log("expName: ", expName);
            console.log("expLocation: ", expLocation);
            return [2 /*return*/];
        });
    });
}
exports.handleAddExperiment = handleAddExperiment;
function handleAddCordinates(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var recvied_sensor, cordinates_dict, Res, event;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    recvied_sensor = received.data[0][0];
                    cordinates_dict = received.data[1];
                    return [4 /*yield*/, (0, LocalMongoHandler_1.addSensorCoordinates)(recvied_sensor, cordinates_dict)];
                case 1:
                    Res = _a.sent();
                    console.log("Res: ", Res);
                    event = {
                        type: 'cordinates_added',
                        data: Res,
                    };
                    ws.send(JSON.stringify(event));
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleAddCordinates = handleAddCordinates;
// function that handle the async request to remove sensor from the exp_0_BOOT collection
function handleRemoveBootSensor(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var recvied_sensor, res, event;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    recvied_sensor = received.data[0].SensorData.LLA;
                    console.log("recvied_sensor: ", recvied_sensor);
                    return [4 /*yield*/, (0, LocalMongoHandler_1.removeSensorFromBoot)(recvied_sensor)];
                case 1:
                    res = _a.sent();
                    event = {
                        type: 'sensor_removed_from_boot',
                        data: res,
                    };
                    ws.send(JSON.stringify(event));
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleRemoveBootSensor = handleRemoveBootSensor;
function handleStartNewExperiment(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var expName, expId, newList, _i, newList_1, sensorData, event;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('startNewExperiment received from client');
                    expName = received.data[0].ExperimentData.Exp_name;
                    return [4 /*yield*/, (0, LocalMongoHandler_1.createNewCollection)(expName)];
                case 1:
                    expId = _a.sent();
                    newList = (0, Functions_1.updateExpId)(received.data, expId);
                    pkgHandler_1.uploadToInflux.value = true; // Update the value property
                    _i = 0, newList_1 = newList;
                    _a.label = 2;
                case 2:
                    if (!(_i < newList_1.length)) return [3 /*break*/, 5];
                    sensorData = newList_1[_i];
                    return [4 /*yield*/, (0, LocalMongoHandler_1.addSensorData)(sensorData, "exp_".concat(expId, "_").concat(expName))];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    event = {
                        type: 'sensors_list_update',
                        data: newList,
                    };
                    ws.send(JSON.stringify(event));
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleStartNewExperiment = handleStartNewExperiment;
function handleEndExperiment(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var expName, expId, _i, _a, sensorData, event;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('End_Experiment received from client');
                    expName = received.data[0].ExperimentData.Exp_name;
                    expId = received.data[0].ExperimentData.Exp_id;
                    _i = 0, _a = received.data;
                    _b.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 4];
                    sensorData = _a[_i];
                    return [4 /*yield*/, (0, LocalMongoHandler_1.addSensorData)(sensorData, "exp_".concat(expId, "_").concat(expName))];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    event = {
                        type: 'force_refresh'
                    };
                    ws.send(JSON.stringify(event));
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleEndExperiment = handleEndExperiment;
function handleSetSensor(received) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(received.data.ExperimentData.Exp_id == '')) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, LocalMongoHandler_1.addSensorData)(received.data, 'exp_0_BOOT')];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, (0, LocalMongoHandler_1.addSensorData)(received.data, "exp_".concat(received.data.ExperimentData.Exp_id, "_").concat(received.data.ExperimentData.Exp_name))];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
exports.handleSetSensor = handleSetSensor;
function handleRemoveSensor(received) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, LocalMongoHandler_1.addSensorData)(received.data, 'exp_0_BOOT')];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleRemoveSensor = handleRemoveSensor;
// nir adition 16.01.23
// function that handles the getExperimentsInfo request from the client
function handleGetExperimentsInfo(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var experimentsInfo, event;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, LocalMongoHandler_1.getExperimentsInfo)()];
                case 1:
                    experimentsInfo = _a.sent();
                    event = {
                        type: 'experiments_info',
                        data: experimentsInfo,
                    };
                    ws.send(JSON.stringify(event));
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleGetExperimentsInfo = handleGetExperimentsInfo;
/// nir adition 26.11.2023 //
// data[0],data[1] - the ipv6 of the sensor and the ipv6 of the new sensor
// data[2] - the mongodb dict of sensors list
// function which get the Switch sensors list from  the client, and prints the sensr info
function handleSwitchSensorsList(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var sensorList, ipv6ofCurrentSensor, ipv6ofNewSensor, sensorsList, event_update;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sensorList = received.data;
                    ipv6ofCurrentSensor = sensorList[0];
                    ipv6ofNewSensor = sensorList[1];
                    sensorsList = sensorList[2];
                    return [4 /*yield*/, (0, LocalMongoHandler_1.MongoSwitchSensorsList)(ipv6ofCurrentSensor, ipv6ofNewSensor, sensorsList)];
                case 1:
                    _a.sent();
                    event_update = {
                        type: 'sensor_repalced'
                    };
                    ws.send(JSON.stringify(event_update));
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleSwitchSensorsList = handleSwitchSensorsList;
/// function that get's the Experiment name and the wanted alerted mail and update the DB
// the function get [list,expName,alertedMail]
function handleUpdateAlertedMail(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var expName, alertedMail, even_update;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    expName = received.data[1];
                    alertedMail = received.data[2];
                    // Replace ',\n' '\n' or ',' or ' ' with ', '
                    alertedMail = alertedMail.replace(/,?\n|,(?!\s)|\s+/g, ',');
                    console.log("alertedMail: ", alertedMail);
                    return [4 /*yield*/, (0, LocalMongoHandler_1.updateSensorAlertedMail)(expName, alertedMail)];
                case 1:
                    _a.sent();
                    even_update = {
                        type: 'alerted_mail_updated'
                    };
                    ws.send(JSON.stringify(even_update));
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleUpdateAlertedMail = handleUpdateAlertedMail;
// function thaty handle the csv file from the client and update the DB
function handleUpdateByCSV(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var csv, event_update;
        return __generator(this, function (_a) {
            csv = received.data;
            (0, LocalMongoHandler_1.UpdateByCSV)(csv); // send the csv to the function that update the DB
            event_update = {
                type: 'Csv_Updated'
            };
            ws.send(JSON.stringify(event_update));
            return [2 /*return*/];
        });
    });
}
exports.handleUpdateByCSV = handleUpdateByCSV;
// function that handle the sensor label data uodate from the client and update the DB
function handleUpdateLabel(received, ws) {
    return __awaiter(this, void 0, void 0, function () {
        var sensorData, event_update;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sensorData = received.data;
                    return [4 /*yield*/, (0, LocalMongoHandler_1.updateLabel)(sensorData)];
                case 1:
                    _a.sent(); // Send the sensor data to the function that updates the DB
                    event_update = {
                        type: 'label_updated'
                    };
                    // send the event update object to the client
                    ws.send(JSON.stringify(event_update));
                    return [2 /*return*/];
            }
        });
    });
}
exports.handleUpdateLabel = handleUpdateLabel;
function sendLaaToClient(ipv6, timestamp, ws) {
    // const timestamp = new Date().toISOString();
    // console.log(`sendLaaToClient called for ${ipv6} at ${timestamp}`);
    var event = {
        type: "sp_ipv6",
        data: { ipv6: ipv6, timestamp: timestamp }
    };
    ws.send(JSON.stringify(event));
}
exports.sendLaaToClient = sendLaaToClient;
function sendPingToClient(ipv6, ws) {
    var timestamp = new Date().toString();
    var event = {
        type: "sp_ping",
        data: {
            ipv6: ipv6,
            timestamp: timestamp
        }
    };
    ws.send(JSON.stringify(event));
}
exports.sendPingToClient = sendPingToClient;
// // function that recive LLA and Time and send it to the client called LastPackageSent
// export function sendLastPackageToClient(LastPackageSent:any,ws:any): void {
//   console.log("The amazing LastPackageSent: ",LastPackageSent);
//   const event = {
//     type : "LastPackageSent",
//     data : LastPackageSent
//   }
//   ws.send(JSON.stringify(event));
// }
