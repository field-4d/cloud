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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExperimentsInfo = exports.UpdateByCSV = exports.MongoSwitchSensorsList = exports.updateSensorAlertedMail = exports.getSensorInfoByIpv6 = exports.removeAllCollections = exports.createNewCollection = exports.updateLabel = exports.addSensorData = exports.addSensorCoordinates = exports.isExistsByIpv6 = exports.getValids = exports.deleteFromBoot = exports.getExpNameByLLA = exports.removeSensorFromBoot = exports.getBootSensors = exports.getActiveSensors = exports.updateActiveSensorsInfo = exports.getClientSensors = exports.getAll = exports.PackageToSendMongo = exports.updateSensorLastSeen = exports.activeSensorsInfo = void 0;
var MongoClient = require('mongodb').MongoClient;
var pkgHandler_1 = require("./pkgHandler");
var Models_1 = require("./Models");
var LOCAL_URL = "mongodb://127.0.0.1:27017/";
var Device_Owner = Models_1.Conf.Device_Owner.Owner;
// const Device_OWNER = "developer_room";
var client = new MongoClient(LOCAL_URL, { useNewUrlParser: true, useUnifiedTopology: true });
exports.activeSensorsInfo = [];
var mac_add = Models_1.Conf.BlackBox.bucket;
var dbPromise = client.connect().then(function () { return client.db(mac_add); });
function updateSensorLastSeen(ipv6, timestamp) {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, _i, collections_1, collection, sensor_1, sensor;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    _i = 0, collections_1 = collections;
                    _a.label = 3;
                case 3:
                    if (!(_i < collections_1.length)) return [3 /*break*/, 10];
                    collection = collections_1[_i];
                    // Skip collections ending with "_DATA"
                    if (collection.name.endsWith("_DATA"))
                        return [3 /*break*/, 9];
                    if (!(collection.name === "exp_0_BOOT")) return [3 /*break*/, 6];
                    return [4 /*yield*/, db.collection(collection.name).findOne({ 'SensorData.LLA': ipv6 })];
                case 4:
                    sensor_1 = _a.sent();
                    if (!sensor_1) return [3 /*break*/, 6];
                    return [4 /*yield*/, db.collection(collection.name).updateOne({ 'SensorData.LLA': ipv6 }, { $set: { 'SensorData.LastSeen': timestamp } })];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [4 /*yield*/, db.collection(collection.name).findOne({
                        'SensorData.LLA': ipv6,
                        "SensorData.isActive": true
                    })];
                case 7:
                    sensor = _a.sent();
                    if (!sensor) return [3 /*break*/, 9];
                    return [4 /*yield*/, db.collection(collection.name).updateOne({ 'SensorData.LLA': ipv6 }, { $set: { 'SensorData.LastSeen': timestamp } })];
                case 8:
                    _a.sent();
                    return [2 /*return*/]; // Exit function after update
                case 9:
                    _i++;
                    return [3 /*break*/, 3];
                case 10: return [2 /*return*/];
            }
        });
    });
}
exports.updateSensorLastSeen = updateSensorLastSeen;
// Function to convert a Unix timestamp to local machine time in seconds
function LocalMachineTimeConvert(timestamp) {
    // Convert Unix timestamp to Date object
    var date = new Date(timestamp * 1000); // Multiply by 1000 to convert from seconds to milliseconds
    // Get local date components
    var year = date.getFullYear(); // Retrieves the year in local time
    var month = String(date.getMonth() + 1).padStart(2, '0'); // Retrieves the month in local time (Month is 0-indexed, so +1)
    var day = String(date.getDate()).padStart(2, '0'); // Retrieves the day in local time
    var hours = String(date.getHours()).padStart(2, '0'); // Retrieves the hours in local time
    var minutes = String(date.getMinutes()).padStart(2, '0'); // Retrieves the minutes in local time
    var seconds = String(date.getSeconds()).padStart(2, '0'); // Retrieves the seconds in local time
    // const milliseconds = String(date.getMilliseconds()).padStart(3, '0'); // Optional: Retrieves milliseconds in local time (currently commented out)
    // Construct local ISO string
    var utcIsoString = "".concat(year, "-").concat(month, "-").concat(day, "T").concat(hours, ":").concat(minutes, ":").concat(seconds, "Z");
    // NOTE: This string construction is incorrectly appending 'Z' which indicates UTC time. 
    // However, the components (year, month, etc.) are based on local time, not UTC.
    return utcIsoString; // Returns the constructed string
}
// Function to insert data into the MongoDB database based on packet data - IDans version
function PackageToSendMongo(pkg, timeStamp, buffer, exp_name) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18;
    return __awaiter(this, void 0, void 0, function () {
        var db, experimentCollection, additionalExperimentData, targetCollectionName, targetCollection, localTimeString, bsonData;
        return __generator(this, function (_19) {
            switch (_19.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _19.sent();
                    experimentCollection = db.collection(exp_name);
                    return [4 /*yield*/, experimentCollection.findOne({ 'SensorData.LLA': pkg.ipv6 })];
                case 2:
                    additionalExperimentData = _19.sent();
                    // Check if the additional data is found and not empty
                    if (!additionalExperimentData) {
                        throw new Error("Experiment data not found for experiment ".concat(exp_name));
                    }
                    // check if the location contain the word "faulty" and if so, skip the sensor
                    if (additionalExperimentData.SensorData.Location.includes("faulty")) {
                        console.log("Skipping upload due to faulty location:", additionalExperimentData.SensorData.Location);
                        return [2 /*return*/];
                    }
                    targetCollectionName = "".concat(exp_name, "_DATA");
                    targetCollection = db.collection(targetCollectionName);
                    // Update all previous documents with the most updated Labels based on the LLA
                    return [4 /*yield*/, targetCollection.updateMany({ "MetaData.LLA": additionalExperimentData.SensorData.LLA }, {
                            $set: {
                                "SensorData.Labels": additionalExperimentData.SensorData.Label,
                                "SensorData.LabelOptions": additionalExperimentData.SensorData.LabelOptions
                            }
                        })];
                case 3:
                    // Update all previous documents with the most updated Labels based on the LLA
                    _19.sent();
                    localTimeString = LocalMachineTimeConvert(timeStamp);
                    bsonData = {
                        UniqueID: "exp_g".concat(additionalExperimentData.ExperimentData.Exp_id, "_").concat(additionalExperimentData.ExperimentData.Exp_name, "_").concat(additionalExperimentData.SensorData.LLA, "_").concat(new Date(timeStamp * 1000).toISOString(), "_").concat(pkg.ipv6),
                        Owner: Device_Owner,
                        MetaData: {
                            LLA: additionalExperimentData.SensorData.LLA,
                            Location: additionalExperimentData.SensorData.Location,
                            Coordinates: additionalExperimentData.SensorData.coordinates,
                            Version: "V2"
                        },
                        ExperimentData: {
                            MAC_address: mac_add,
                            Exp_id: additionalExperimentData.ExperimentData.Exp_id,
                            Exp_name: "exp_".concat(additionalExperimentData.ExperimentData.Exp_id, "_").concat(additionalExperimentData.ExperimentData.Exp_name),
                        },
                        TimeStamp: {
                            // $date: new Date(localTimeString * 1000).toISOString() // Convert to milliseconds and then to ISO string
                            $date: localTimeString // Convert to milliseconds and then to ISO string
                        },
                        SensorData: {
                            Name: additionalExperimentData.SensorData.Location,
                            battery: pkg.battery,
                            temperature: (_a = pkg.hdc_temp) !== null && _a !== void 0 ? _a : null,
                            humidity: (_b = pkg.hdc_humidity) !== null && _b !== void 0 ? _b : null,
                            light: (_c = pkg.light) !== null && _c !== void 0 ? _c : null,
                            barometric_pressure: (_d = pkg.bmp_press) !== null && _d !== void 0 ? _d : null,
                            barometric_temp: (_e = pkg.bmp_temp) !== null && _e !== void 0 ? _e : null,
                            Coordinates: additionalExperimentData.SensorData.coordinates,
                            Labels: additionalExperimentData.SensorData.Label,
                            LabelOptions: additionalExperimentData.SensorData.LabelOptions,
                            tmp107_amb: (_f = pkg.tmp107_amb) !== null && _f !== void 0 ? _f : null,
                            tmp107_obj: (_g = pkg.tmp107_obj) !== null && _g !== void 0 ? _g : null,
                            rssi: (_h = pkg.rssi) !== null && _h !== void 0 ? _h : null,
                            // Additional fields from the second package type
                            bmp_390_u18_pressure: (_j = pkg.bmp_390_u18_pressure) !== null && _j !== void 0 ? _j : null,
                            bmp_390_u18_temperature: (_k = pkg.bmp_390_u18_temperature) !== null && _k !== void 0 ? _k : null,
                            bmp_390_u19_pressure: (_l = pkg.bmp_390_u19_pressure) !== null && _l !== void 0 ? _l : null,
                            bmp_390_u19_temperature: (_m = pkg.bmp_390_u19_temperature) !== null && _m !== void 0 ? _m : null,
                            hdc_2010_u13_temperature: (_o = pkg.hdc_2010_u13_temperature) !== null && _o !== void 0 ? _o : null,
                            hdc_2010_u13_humidity: (_p = pkg.hdc_2010_u13_humidity) !== null && _p !== void 0 ? _p : null,
                            hdc_2010_u16_temperature: (_q = pkg.hdc_2010_u16_temperature) !== null && _q !== void 0 ? _q : null,
                            hdc_2010_u16_humidity: (_r = pkg.hdc_2010_u16_humidity) !== null && _r !== void 0 ? _r : null,
                            hdc_2010_u17_temperature: (_s = pkg.hdc_2010_u17_temperature) !== null && _s !== void 0 ? _s : null,
                            hdc_2010_u17_humidity: (_t = pkg.hdc_2010_u17_humidity) !== null && _t !== void 0 ? _t : null,
                            opt_3001_u1_light_intensity: (_u = pkg.opt_3001_u1_light_intensity) !== null && _u !== void 0 ? _u : null,
                            opt_3001_u2_light_intensity: (_v = pkg.opt_3001_u2_light_intensity) !== null && _v !== void 0 ? _v : null,
                            opt_3001_u3_light_intensity: (_w = pkg.opt_3001_u3_light_intensity) !== null && _w !== void 0 ? _w : null,
                            opt_3001_u4_light_intensity: (_x = pkg.opt_3001_u4_light_intensity) !== null && _x !== void 0 ? _x : null,
                            opt_3001_u5_light_intensity: (_y = pkg.opt_3001_u5_light_intensity) !== null && _y !== void 0 ? _y : null,
                            batmon_temperature: (_z = pkg.batmon_temperature) !== null && _z !== void 0 ? _z : null,
                            batmon_battery_voltage: (_0 = pkg.batmon_battery_voltage) !== null && _0 !== void 0 ? _0 : null,
                            // aditional fields from the third package type
                            co2_ppm: (_1 = pkg.co2_ppm) !== null && _1 !== void 0 ? _1 : null,
                            air_velocity: (_2 = pkg.air_velocity) !== null && _2 !== void 0 ? _2 : null,
                            // ZTP-315 Thermopile IR sensor fields
                            ztp_315_surface_temperature: (_3 = pkg.ztp_315_surface_temperature) !== null && _3 !== void 0 ? _3 : null,
                            ztp_315_ambient_temperature: (_4 = pkg.ztp_315_ambient_temperature) !== null && _4 !== void 0 ? _4 : null,
                            ztp_315_object_temperature: (_5 = pkg.ztp_315_object_temperature) !== null && _5 !== void 0 ? _5 : null,
                            ztp_315_voltage_output: (_6 = pkg.ztp_315_voltage_output) !== null && _6 !== void 0 ? _6 : null,
                            ztp_315_temperature_offset: (_7 = pkg.ztp_315_temperature_offset) !== null && _7 !== void 0 ? _7 : null,
                            ztp_315_emissivity: (_8 = pkg.ztp_315_emissivity) !== null && _8 !== void 0 ? _8 : null,
                            ztp_315_calibrated_temperature: (_9 = pkg.ztp_315_calibrated_temperature) !== null && _9 !== void 0 ? _9 : null,
                            // Fields for IIS3DHHC accelerometer and inclinometer
                            iis3dhhc_x_acceleration: (_10 = pkg.iis3dhhc_x_acceleration) !== null && _10 !== void 0 ? _10 : null,
                            iis3dhhc_y_acceleration: (_11 = pkg.iis3dhhc_y_acceleration) !== null && _11 !== void 0 ? _11 : null,
                            iis3dhhc_z_acceleration: (_12 = pkg.iis3dhhc_z_acceleration) !== null && _12 !== void 0 ? _12 : null,
                            iis3dhhc_temperature: (_13 = pkg.iis3dhhc_temperature) !== null && _13 !== void 0 ? _13 : null,
                            iis3dhhc_roll_angle: (_14 = pkg.iis3dhhc_roll_angle) !== null && _14 !== void 0 ? _14 : null,
                            iis3dhhc_pitch_angle: (_15 = pkg.iis3dhhc_pitch_angle) !== null && _15 !== void 0 ? _15 : null,
                            iis3dhhc_yaw_angle: (_16 = pkg.iis3dhhc_yaw_angle) !== null && _16 !== void 0 ? _16 : null,
                            iis3dhhc_tilt_angle: (_17 = pkg.iis3dhhc_tilt_angle) !== null && _17 !== void 0 ? _17 : null,
                            iis3dhhc_azimuth_angle: (_18 = pkg.iis3dhhc_azimuth_angle) !== null && _18 !== void 0 ? _18 : null,
                        }
                    };
                    // Insert data into the target collection
                    return [4 /*yield*/, targetCollection.insertOne(bsonData)];
                case 4:
                    // Insert data into the target collection
                    _19.sent();
                    return [2 /*return*/];
            }
        });
    });
}
exports.PackageToSendMongo = PackageToSendMongo;
function getAll() {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, allData, _i, collections_2, collection, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    allData = [];
                    _i = 0, collections_2 = collections;
                    _a.label = 3;
                case 3:
                    if (!(_i < collections_2.length)) return [3 /*break*/, 6];
                    collection = collections_2[_i];
                    return [4 /*yield*/, db.collection(collection.name).find({}).toArray()];
                case 4:
                    data = _a.sent();
                    allData.push.apply(allData, data);
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/, allData];
            }
        });
    });
}
exports.getAll = getAll;
function getClientSensors() {
    return __awaiter(this, void 0, void 0, function () {
        var bootSensors, activeSensors, clientSensors, _loop_1, _i, bootSensors_1, sensor;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getBootSensors()];
                case 1:
                    bootSensors = _a.sent();
                    return [4 /*yield*/, getActiveSensors()];
                case 2:
                    activeSensors = _a.sent();
                    clientSensors = [];
                    clientSensors.push.apply(clientSensors, activeSensors);
                    _loop_1 = function (sensor) {
                        var sensorExists = activeSensors.some(function (activeSensor) { return activeSensor.SensorData.LLA === sensor.SensorData.LLA; });
                        if (!sensorExists) {
                            clientSensors.push(sensor);
                        }
                    };
                    // Getting rid of the active sensors in the boot collection
                    for (_i = 0, bootSensors_1 = bootSensors; _i < bootSensors_1.length; _i++) {
                        sensor = bootSensors_1[_i];
                        _loop_1(sensor);
                    }
                    return [2 /*return*/, clientSensors];
            }
        });
    });
}
exports.getClientSensors = getClientSensors;
function updateActiveSensorsInfo() {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, activeSensors, latestTimeStamps, _i, collections_3, collection, data, _a, data_1, document_1, currentLLA, dataCollectionName, relatedData, currentTimestamp, dateTimeString, _b, date, time;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _c.sent();
                    activeSensors = [];
                    latestTimeStamps = {};
                    _i = 0, collections_3 = collections;
                    _c.label = 3;
                case 3:
                    if (!(_i < collections_3.length)) return [3 /*break*/, 9];
                    collection = collections_3[_i];
                    return [4 /*yield*/, db.collection(collection.name).find({ 'SensorData.isActive': true }).toArray()];
                case 4:
                    data = _c.sent();
                    if (!data[0]) return [3 /*break*/, 8];
                    pkgHandler_1.uploadToInflux.value = true;
                    _a = 0, data_1 = data;
                    _c.label = 5;
                case 5:
                    if (!(_a < data_1.length)) return [3 /*break*/, 8];
                    document_1 = data_1[_a];
                    currentLLA = document_1.SensorData.LLA;
                    dataCollectionName = "".concat(collection.name, "_DATA");
                    return [4 /*yield*/, db.collection(dataCollectionName).find({ 'MetaData.LLA': currentLLA }).sort({ 'TimeStamp': -1 }).limit(1).toArray()];
                case 6:
                    relatedData = _c.sent();
                    currentTimestamp = null;
                    if (relatedData[0] && relatedData[0].TimeStamp && relatedData[0].TimeStamp.$date) {
                        dateTimeString = relatedData[0].TimeStamp.$date;
                        _b = dateTimeString.split('T'), date = _b[0], time = _b[1];
                        currentTimestamp = { date: date, time: time.slice(0, -1) }; // Removing the 'Z' from the time if present
                    }
                    // Update the latest timestamp for the LLA if it's newer
                    if (currentTimestamp && (!latestTimeStamps[currentLLA] || latestTimeStamps[currentLLA].date < currentTimestamp.date ||
                        (latestTimeStamps[currentLLA].date === currentTimestamp.date && latestTimeStamps[currentLLA].time < currentTimestamp.time))) {
                        latestTimeStamps[currentLLA] = currentTimestamp;
                    }
                    activeSensors.push({
                        LLA: currentLLA,
                        collectionName: collection.name,
                        Alerts: document_1.Alerts,
                        Location: document_1.SensorData.Location,
                        latestTimeStamp: latestTimeStamps[currentLLA] || null
                    });
                    _c.label = 7;
                case 7:
                    _a++;
                    return [3 /*break*/, 5];
                case 8:
                    _i++;
                    return [3 /*break*/, 3];
                case 9:
                    exports.activeSensorsInfo = activeSensors;
                    return [2 /*return*/];
            }
        });
    });
}
exports.updateActiveSensorsInfo = updateActiveSensorsInfo;
// export async function updateActiveSensorsInfo(): Promise<void> {
//   const db = await dbPromise;
//   const collections = await db.listCollections().toArray();
//   const activeSensors : any[]= [];
//   for (const collection of collections) {
//     const data = await db.collection(collection.name).find({ 'SensorData.isActive': true }).toArray();
//     if(data[0]){
//       uploadToInflux.value = true;
//     }
//     data.forEach((document:any) => {
//       activeSensors.push({
//         LLA: document.SensorData.LLA,
//         collectionName: collection.name,
//         Alerts: document.Alerts,
//         Location: document.SensorData.Location
//       });
//     });
//   }
//   activeSensorsInfo = activeSensors;
//   // console.log("getActiveSensorsFromAllCollections() ->",activeSensorsInfo)
// }
function getActiveSensors() {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, activeSensors, _i, collections_4, collection, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    activeSensors = [];
                    _i = 0, collections_4 = collections;
                    _a.label = 3;
                case 3:
                    if (!(_i < collections_4.length)) return [3 /*break*/, 6];
                    collection = collections_4[_i];
                    return [4 /*yield*/, db.collection(collection.name).find({ 'SensorData.isActive': true }).toArray()];
                case 4:
                    data = _a.sent();
                    activeSensors.push.apply(activeSensors, data);
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: 
                // console.log("getActiveSensors() ->",activeSensors)
                return [2 /*return*/, activeSensors];
            }
        });
    });
}
exports.getActiveSensors = getActiveSensors;
function getBootSensors() {
    return __awaiter(this, void 0, void 0, function () {
        var db, collection, bootSensors;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    collection = db.collection('exp_0_BOOT');
                    return [4 /*yield*/, collection.find({}).toArray()];
                case 2:
                    bootSensors = _a.sent();
                    // console.log("getBootSensors() ->",bootSensors)
                    return [2 /*return*/, bootSensors];
            }
        });
    });
}
exports.getBootSensors = getBootSensors;
// function that get the LLA and remove the sensor from the exp_0_boot collection
function removeSensorFromBoot(LLA) {
    return __awaiter(this, void 0, void 0, function () {
        var db, collection, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    collection = db.collection('exp_0_BOOT');
                    return [4 /*yield*/, collection.deleteMany({ 'SensorData.LLA': LLA })];
                case 2:
                    result = _a.sent();
                    console.log("".concat(result.deletedCount, " sensors deleted!"));
                    return [2 /*return*/, result];
            }
        });
    });
}
exports.removeSensorFromBoot = removeSensorFromBoot;
function getExpNameByLLA(LLA) {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, found, _i, collections_5, collection, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    found = false;
                    _i = 0, collections_5 = collections;
                    _a.label = 3;
                case 3:
                    if (!(_i < collections_5.length)) return [3 /*break*/, 6];
                    collection = collections_5[_i];
                    return [4 /*yield*/, db.collection(collection.name).find({ LLA: LLA })];
                case 4:
                    data = _a.sent();
                    console.log(collection.name);
                    return [2 /*return*/, collection.name];
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/];
            }
        });
    });
}
exports.getExpNameByLLA = getExpNameByLLA;
function deleteFromBoot(expName) {
    return __awaiter(this, void 0, void 0, function () {
        var db, collection, result, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    collection = db.collection('exp_0_BOOT');
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, collection.deleteMany({ 'ExperimentData.Exp_name': expName })];
                case 3:
                    result = _a.sent();
                    console.log("".concat(result.deletedCount, " sensors deleted!"));
                    return [2 /*return*/, result];
                case 4:
                    err_1 = _a.sent();
                    throw err_1;
                case 5: return [2 /*return*/];
            }
        });
    });
}
exports.deleteFromBoot = deleteFromBoot;
function getValids() {
    return __awaiter(this, void 0, void 0, function () {
        var db, collection, docs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    collection = db.collection("sensors");
                    return [4 /*yield*/, collection.find({ isValid: true }).toArray()];
                case 2:
                    docs = _a.sent();
                    console.log(docs);
                    return [2 /*return*/, docs];
            }
        });
    });
}
exports.getValids = getValids;
function isExistsByIpv6(ipv6, collectionName) {
    return __awaiter(this, void 0, void 0, function () {
        var db, collection, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    collection = db.collection(collectionName);
                    return [4 /*yield*/, collection.findOne({ "SensorData.LLA": ipv6 })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, Boolean(result)];
            }
        });
    });
}
exports.isExistsByIpv6 = isExistsByIpv6;
function delay(milliseconds) {
    return new Promise(function (resolve) { return setTimeout(resolve, milliseconds); });
}
// function that add to the relevent collection the sensor coordinates
function addSensorCoordinates(sensor, coordinates) {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, collectionName, _i, collections_6, collection, SensorInCollection;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    collectionName = '';
                    _i = 0, collections_6 = collections;
                    _a.label = 3;
                case 3:
                    if (!(_i < collections_6.length)) return [3 /*break*/, 7];
                    collection = collections_6[_i];
                    return [4 /*yield*/, db.collection(collection.name).findOne({ 'SensorData.LLA': sensor.SensorData.LLA, 'SensorData.isActive': true })];
                case 4:
                    SensorInCollection = _a.sent();
                    if (!SensorInCollection) return [3 /*break*/, 6];
                    collectionName = collection.name;
                    return [4 /*yield*/, db.collection(collectionName).updateOne({ "SensorData.LLA": sensor.SensorData.LLA }, { $set: { 'SensorData.coordinates': coordinates } } // Update operation
                        )];
                case 5:
                    _a.sent();
                    // console.log("the collection is:",collectionName)
                    return [2 /*return*/, collectionName];
                case 6:
                    _i++;
                    return [3 /*break*/, 3];
                case 7:
                    // if sensor not in any collection, add it to the boot collection exp_0_BOOT
                    collectionName = 'exp_0_BOOT';
                    return [4 /*yield*/, db.collection(collectionName).updateOne({ "SensorData.LLA": sensor.SensorData.LLA }, { $set: { 'SensorData.coordinates': coordinates } } // Update operation
                        )];
                case 8:
                    _a.sent();
                    // console.log("the collection is:",collectionName)
                    return [2 /*return*/, collectionName];
            }
        });
    });
}
exports.addSensorCoordinates = addSensorCoordinates;
function addSensorData(sensor, collectionName) {
    return __awaiter(this, void 0, void 0, function () {
        var db, collection, updateData, res, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    collection = db.collection(collectionName);
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    updateData = {
                        "UserData.Holder": sensor.UserData.Holder,
                        "UserData.Email": sensor.UserData.Email,
                        "UserData.Location": sensor.UserData.Location,
                        "ExperimentData.Start_time": sensor.ExperimentData.Start_time,
                        "ExperimentData.End_time": sensor.ExperimentData.End_time,
                        "ExperimentData.Exp_id": sensor.ExperimentData.Exp_id,
                        "ExperimentData.Exp_location": sensor.ExperimentData.Exp_location,
                        "ExperimentData.Bucket": sensor.ExperimentData.Bucket,
                        "ExperimentData.Exp_name": sensor.ExperimentData.Exp_name,
                        "SensorData.LLA": sensor.SensorData.LLA,
                        "SensorData.RFID": sensor.SensorData.RFID,
                        "SensorData.Location": sensor.SensorData.Location,
                        "SensorData.Label": sensor.SensorData.Label,
                        "SensorData.LabelOptions": sensor.SensorData.LabelOptions,
                        "SensorData.isActive": sensor.SensorData.isActive,
                        "SensorData.isValid": sensor.SensorData.isValid,
                        "SensorData.Frequency": sensor.SensorData.Frequency,
                        "Alerts.Alerted": sensor.Alerts.Alerted,
                        "Alerts.Email": sensor.Alerts.Email,
                        "Alerts.Temperature.Max_Temp": sensor.Alerts.Temperature.Max_Temp,
                        "Alerts.Temperature.Min_Temp": sensor.Alerts.Temperature.Min_Temp,
                        "Alerts.Temperature.Start_Time": sensor.Alerts.Temperature.Start_Time || "00:01:00",
                        "Alerts.Temperature.End_Time": sensor.Alerts.Temperature.End_Time || "23:59:00",
                        "Alerts.Light.Max_Light": sensor.Alerts.Light.Max_Light,
                        "Alerts.Light.Min_Light": sensor.Alerts.Light.Min_Light,
                        "Alerts.Light.Start_Time": sensor.Alerts.Light.Start_Time,
                        "Alerts.Light.End_Time": sensor.Alerts.Light.End_Time,
                        "Alerts.Battery_Percentage": sensor.Alerts.Battery_Percentage,
                        "SensorData.coordinates": sensor.SensorData.coordinates || { x: 0, y: 0, z: 0 },
                    };
                    return [4 /*yield*/, collection.createIndex({ "SensorData.LLA": 1 }, { unique: true })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, collection.updateOne({ "SensorData.LLA": sensor.SensorData.LLA }, { $set: updateData }, // Update the fields
                        { upsert: true } // Insert a new document if no match is found - upsert is true by default
                        )];
                case 4:
                    res = _a.sent();
                    // Log the result
                    if (res.upsertedCount > 0) { // Check if a new document was inserted
                        console.log("Sensor inserted!"); // Log the insertion 
                    }
                    else if (res.modifiedCount > 0) { // Check if an existing document was modified
                        // console.log("Sensor already exists - Updating values..."); // Log the update
                    }
                    return [2 /*return*/, res];
                case 5:
                    err_2 = _a.sent();
                    console.error("Error in addSensorData: ", err_2);
                    throw err_2;
                case 6: return [2 /*return*/];
            }
        });
    });
}
exports.addSensorData = addSensorData;
// function that updates the sensor labelsoptions
function updateLabel(dataArray) {
    return __awaiter(this, void 0, void 0, function () {
        var db, bootCollection, collections, _i, dataArray_1, sensor, updated, _a, collections_7, collection, activeSensor;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _b.sent();
                    bootCollection = db.collection("exp_0_BOOT");
                    return [4 /*yield*/, db.collections()];
                case 2:
                    collections = _b.sent();
                    _i = 0, dataArray_1 = dataArray;
                    _b.label = 3;
                case 3:
                    if (!(_i < dataArray_1.length)) return [3 /*break*/, 11];
                    sensor = dataArray_1[_i];
                    if (!sensor.SensorData.LLA) return [3 /*break*/, 10];
                    console.log("The new sensor LabelOptions are ", sensor.SensorData.LabelOptions);
                    console.log("The new sensor options are ", sensor.SensorData.Label);
                    updated = false;
                    _a = 0, collections_7 = collections;
                    _b.label = 4;
                case 4:
                    if (!(_a < collections_7.length)) return [3 /*break*/, 8];
                    collection = collections_7[_a];
                    // Skip the exp_0_BOOT collection
                    if (collection.collectionName === "exp_0_BOOT")
                        return [3 /*break*/, 7];
                    return [4 /*yield*/, collection.findOne({ "SensorData.LLA": sensor.SensorData.LLA, "SensorData.isActive": true })];
                case 5:
                    activeSensor = _b.sent();
                    if (!activeSensor) return [3 /*break*/, 7];
                    // Update LabelOptions for active sensors with the same LLA in the current collection
                    return [4 /*yield*/, collection.updateMany({ "SensorData.LLA": sensor.SensorData.LLA, "SensorData.isActive": true }, {
                            $set: {
                                "SensorData.Label": sensor.SensorData.Label,
                                "SensorData.LabelOptions": sensor.SensorData.LabelOptions,
                            }
                        })];
                case 6:
                    // Update LabelOptions for active sensors with the same LLA in the current collection
                    _b.sent();
                    updated = true;
                    _b.label = 7;
                case 7:
                    _a++;
                    return [3 /*break*/, 4];
                case 8:
                    if (!!updated) return [3 /*break*/, 10];
                    return [4 /*yield*/, bootCollection.updateMany({ "SensorData.LLA": sensor.SensorData.LLA }, {
                            $set: {
                                "SensorData.Label": sensor.SensorData.Label,
                                "SensorData.LabelOptions": sensor.SensorData.LabelOptions,
                            }
                        })];
                case 9:
                    _b.sent();
                    _b.label = 10;
                case 10:
                    _i++;
                    return [3 /*break*/, 3];
                case 11: return [2 /*return*/];
            }
        });
    });
}
exports.updateLabel = updateLabel;
function createNewCollection(expName) {
    return __awaiter(this, void 0, void 0, function () {
        var db, lastId, expId, collectionName;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, findLastCollectionId()];
                case 2:
                    lastId = _a.sent();
                    expId = lastId + 1;
                    collectionName = "exp_".concat(expId, "_").concat(expName);
                    return [4 /*yield*/, db.createCollection(collectionName)];
                case 3:
                    _a.sent();
                    return [2 /*return*/, expId];
            }
        });
    });
}
exports.createNewCollection = createNewCollection;
function findLastCollectionId() {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, sortedCollections, lastCollectionName, lastId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    if (collections.length > 0) {
                        sortedCollections = collections.sort(function (a, b) {
                            var idA = parseInt(a.name.split('_')[1]);
                            var idB = parseInt(b.name.split('_')[1]);
                            return idB - idA; // Sort in descending order based on the ID
                        });
                        lastCollectionName = sortedCollections[0].name;
                        lastId = parseInt(lastCollectionName.split('_')[1]);
                        return [2 /*return*/, lastId]; // Get the last collection ID
                    }
                    else {
                        return [2 /*return*/, 0]; // Return 0 if no collections found
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// removeAllCollections();
function removeAllCollections() {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, _i, collections_8, collection;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    _i = 0, collections_8 = collections;
                    _a.label = 3;
                case 3:
                    if (!(_i < collections_8.length)) return [3 /*break*/, 6];
                    collection = collections_8[_i];
                    return [4 /*yield*/, db.collection(collection.name).drop()];
                case 4:
                    _a.sent();
                    console.log("Collection '".concat(collection.name, "' dropped!"));
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/];
            }
        });
    });
}
exports.removeAllCollections = removeAllCollections;
/**
 * handle get sensor name by the ipv6, where the SensorData.isActive is true
 * @param ipv6
 */
function getSensorInfoByIpv6(ipv6) {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, SensorData, SensorAlerted, SensorExperiment, _i, collections_9, collection, sensor;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    SensorData = {};
                    SensorAlerted = {};
                    SensorExperiment = {};
                    _i = 0, collections_9 = collections;
                    _a.label = 3;
                case 3:
                    if (!(_i < collections_9.length)) return [3 /*break*/, 6];
                    collection = collections_9[_i];
                    return [4 /*yield*/, db.collection(collection.name).findOne({ 'SensorData.LLA': ipv6, 'SensorData.isActive': true })];
                case 4:
                    sensor = _a.sent();
                    if (sensor) {
                        SensorData = sensor.SensorData;
                        SensorAlerted = sensor.Alerts;
                        SensorExperiment = sensor.ExperimentData;
                        //break;
                        return [2 /*return*/, { SensorData: SensorData, SensorAlerted: SensorAlerted, SensorExperiment: SensorExperiment }];
                    }
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/, { SensorData: {}, SensorAlerted: {}, SensorExperiment: {} }]; // return empty object if no sensor found
            }
        });
    });
}
exports.getSensorInfoByIpv6 = getSensorInfoByIpv6;
/**
 * Updates the email address in the 'Alerts' field for all active sensors associated with a given experiment.
 * This function iterates through all collections in the database, updating each document that matches
 * the specified experiment name and has an active sensor status.
 *
 * @param {string} expName - The name of the experiment to match in the database.
 * @param {string} alertedmail - The new email address to be set in the 'Alerts.Email' field of matched documents.
 * @returns {Promise<any[]>} - A promise that resolves to an array of results from the update operations.
 *                             Each element in the array represents the result from updating a specific collection.
 *                             This includes information on the number of documents modified in each collection.
 *
 * Usage Example:
 * ```
 * updateSensorAlertedMail("ExperimentXYZ", "newemail@example.com")
 *   .then(results => console.log(results))
 *   .catch(error => console.error("Update failed", error));
 * ```
 */
function updateSensorAlertedMail(expName, alertedmail) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, results, _i, collections_10, collection, updateResult, sensors, _d, sensors_1, sensor, emails, updatedEmail, updateResult;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _e.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _e.sent();
                    results = [];
                    _i = 0, collections_10 = collections;
                    _e.label = 3;
                case 3:
                    if (!(_i < collections_10.length)) return [3 /*break*/, 11];
                    collection = collections_10[_i];
                    if (!(alertedmail === '')) return [3 /*break*/, 5];
                    return [4 /*yield*/, db.collection(collection.name).updateMany({ 'ExperimentData.Exp_name': expName, 'SensorData.isActive': true }, { $set: { "Alerts.Email": '' } })];
                case 4:
                    updateResult = _e.sent();
                    // Log and store results of clearing operation
                    if (updateResult.modifiedCount > 0) {
                        console.log("Cleared emails for ".concat(updateResult.modifiedCount, " sensors in collection ").concat(collection.name));
                        results.push(updateResult);
                    }
                    return [3 /*break*/, 10];
                case 5: return [4 /*yield*/, db.collection(collection.name).find({ 'ExperimentData.Exp_name': expName, 'SensorData.isActive': true }).toArray()];
                case 6:
                    sensors = _e.sent();
                    _d = 0, sensors_1 = sensors;
                    _e.label = 7;
                case 7:
                    if (!(_d < sensors_1.length)) return [3 /*break*/, 10];
                    sensor = sensors_1[_d];
                    emails = ((_b = (_a = sensor.Alerts) === null || _a === void 0 ? void 0 : _a.Email) === null || _b === void 0 ? void 0 : _b.split(',').map(function (email) { return email.trim(); })) || [];
                    if (!!emails.includes(alertedmail)) return [3 /*break*/, 9];
                    updatedEmail = ((_c = sensor.Alerts) === null || _c === void 0 ? void 0 : _c.Email) ? "".concat(sensor.Alerts.Email, ", ").concat(alertedmail) : alertedmail;
                    return [4 /*yield*/, db.collection(collection.name).updateOne({ _id: sensor._id }, { $set: { "Alerts.Email": updatedEmail } })];
                case 8:
                    updateResult = _e.sent();
                    // Log and store results of update operation
                    if (updateResult.modifiedCount > 0) {
                        console.log("Updated sensor with ID ".concat(sensor._id, " in collection ").concat(collection.name));
                        results.push(updateResult);
                    }
                    _e.label = 9;
                case 9:
                    _d++;
                    return [3 /*break*/, 7];
                case 10:
                    _i++;
                    return [3 /*break*/, 3];
                case 11: return [2 /*return*/, results];
            }
        });
    });
}
exports.updateSensorAlertedMail = updateSensorAlertedMail;
/**
 * Handles updating sensor data based on the received list.
 * - Finds the first two sensors with different LLA values in the received list.
 * - Copies all data (excluding the _id field) from the first sensor to the second sensor.
 * - Sets the isValid property of the first sensor's SensorData to false.
 *
 */
function MongoSwitchSensorsList(ipv6ofCurrentSensor, ipv6ofNewSensor, sensorList) {
    return __awaiter(this, void 0, void 0, function () {
        var db, currentSensor, newSensor, collections, collectionName, _i, collections_11, collection, sensorInCollection, query_1, documentCurrent, query_2, documentNew, _id, fieldsToUpdate, updatedResult, newLocationName, invalidateCurrentSensor;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('/processing Switch Sensors List');
                    return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    currentSensor = sensorList.find(function (sensor) { return sensor.SensorData.LLA === ipv6ofCurrentSensor; });
                    newSensor = sensorList.find(function (sensor) { return sensor.SensorData.LLA === ipv6ofNewSensor; });
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    collectionName = '';
                    _i = 0, collections_11 = collections;
                    _a.label = 3;
                case 3:
                    if (!(_i < collections_11.length)) return [3 /*break*/, 6];
                    collection = collections_11[_i];
                    return [4 /*yield*/, db.collection(collection.name).findOne({ 'SensorData.LLA': ipv6ofCurrentSensor, 'SensorData.isActive': true })];
                case 4:
                    sensorInCollection = _a.sent();
                    if (sensorInCollection) {
                        collectionName = collection.name;
                        return [3 /*break*/, 6];
                    }
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    // check if the current sensor is in the list
                    if (!collectionName) {
                        throw new Error('Could not find the collection of the current sensor');
                    }
                    query_1 = { 'SensorData.LLA': ipv6ofCurrentSensor };
                    return [4 /*yield*/, db.collection(collectionName).findOne(query_1)];
                case 7:
                    documentCurrent = _a.sent();
                    query_2 = { 'SensorData.LLA': ipv6ofNewSensor };
                    return [4 /*yield*/, db.collection("exp_0_BOOT").findOne(query_2)];
                case 8:
                    documentNew = _a.sent();
                    console.log("documentNew LLA", documentNew.SensorData.LLA);
                    console.log("documentNew ID", documentNew._id);
                    if (!documentCurrent) return [3 /*break*/, 12];
                    _id = documentCurrent._id, fieldsToUpdate = __rest(documentCurrent, ["_id"]);
                    // modify the LLA values in the field to update
                    fieldsToUpdate._id = documentNew._id; // copy the _id of the new sensor
                    fieldsToUpdate.SensorData.LLA = ipv6ofNewSensor; // copy the LLA of the new sensor
                    fieldsToUpdate.SensorData.Location = documentCurrent.SensorData.Location; // copy the location of the current sensor
                    return [4 /*yield*/, db.collection(collectionName).insertOne(fieldsToUpdate)
                        // set SensorData IsValid to false for the current sensor in the current collection
                    ];
                case 9:
                    updatedResult = _a.sent();
                    newLocationName = documentCurrent.SensorData.Location + "-(faulty)";
                    return [4 /*yield*/, db.collection(collectionName).updateOne(query_1, // find the current sensor
                        {
                            $set: {
                                "SensorData.isValid": false,
                                "SensorData.Location": newLocationName
                            }
                        })];
                case 10:
                    invalidateCurrentSensor = _a.sent();
                    return [4 /*yield*/, getClientSensors()];
                case 11:
                    _a.sent();
                    _a.label = 12;
                case 12: return [2 /*return*/];
            }
        });
    });
}
exports.MongoSwitchSensorsList = MongoSwitchSensorsList;
///////////////////////////////////
/// nir adition 15.12.2023
// function that add the exp_0_boot information based on the dataArray
// export async function UpdateByCSV(dataArray: any[]): Promise<any> {
//   const db = await dbPromise;
//   const collection = db.collection("exp_0_BOOT");
//   let counter = 0;
//   for (const sensor of dataArray) {
//     // check if LLA is not empty or LLA: null, and updates the sensor keys
//     if (sensor.LLA) {
//       console.log("The sensor is ", sensor);
//       // print the label data
//       await collection.updateOne(
//         { "SensorData.LLA": sensor.LLA },
//         {
//           $set: {
//             // experiment data
//             "ExperimentData.Exp_name": sensor.Exp_name,
//             "ExperimentData.Exp_location": sensor.Exp_location,
//             // sensor data
//             "SensorData.Location": sensor.Location,
//             "SensorData.Label": sensor.Labels,
//             "SensorData.LabelOptions": sensor.labelOptionsList,
//             // alerts
//             "Alerts.Alerted": true,
//             // temperature
//             "Alerts.Temperature.Max_Temp": parseInt(sensor.Max_Temp, 10), // convert to number
//             "Alerts.Temperature.Min_Temp": parseInt(sensor.Min_Temp, 10), // convert to number
//             "Alerts.Temperature.Start_Time": "00:01:00",
//             "Alerts.Temperature.End_Time": "23:59:00",
//             // light
//             "Alerts.Light.Max_Light": parseInt(sensor.Max_Light, 10), // remove \r and convert to number
//             "Alerts.Light.Min_Light": parseInt(sensor.Min_Light, 10), // remove \r and convert to number
//             "Alerts.Light.Start_Time": "00:00:00",
//             "Alerts.Light.End_Time": "23:59:00",
//             // coordinates
//             "SensorData.coordinates.x": parseFloat(sensor.Cordinate_X) || 0.0, // convert to number
//             "SensorData.coordinates.y": parseFloat(sensor.Cordinate_Y) || 0.0, // convert to number
//             "SensorData.coordinates.z": parseFloat(sensor.Cordinate_Z) || 0.0, // convert to number
//             // Labels format is [ "A","B"] add the label to the sensor
//           }
//         }
//       );
//       counter++;
//       if (counter % 10 === 0) {
//         await delay(1000); // Sleep for 1 second after every 10 sensors
//       }
//     }
//   }
// }
// export async function UpdateByCSV(dataArray: any[]): Promise<any> {
//   const db = await dbPromise;
//   const collection = db.collection("exp_0_BOOT");
//   const bulkOperations = dataArray
//     .filter(sensor => sensor.LLA) // Ensure LLA is not empty or null
//     .map(sensor => ({
//       updateMany: {
//         filter: { "SensorData.LLA": sensor.LLA },
//         update: {
//           $set: {
//             // Experiment data
//             "ExperimentData.Exp_name": sensor.Exp_name,
//             "ExperimentData.Exp_location": sensor.Exp_location,
//             // Sensor data
//             "SensorData.Location": sensor.Location,
//             "SensorData.Label": sensor.Labels,
//             "SensorData.LabelOptions": sensor.labelOptionsList,
//             // Alerts
//             "Alerts.Alerted": true,
//             // Temperature
//             "Alerts.Temperature.Max_Temp": parseInt(sensor.Max_Temp, 10), // Convert to number
//             "Alerts.Temperature.Min_Temp": parseInt(sensor.Min_Temp, 10), // Convert to number
//             "Alerts.Temperature.Start_Time": "00:01:00",
//             "Alerts.Temperature.End_Time": "23:59:00",
//             // Light
//             "Alerts.Light.Max_Light": parseInt(sensor.Max_Light, 10), // Convert to number
//             "Alerts.Light.Min_Light": parseInt(sensor.Min_Light, 10), // Convert to number
//             "Alerts.Light.Start_Time": "00:00:00",
//             "Alerts.Light.End_Time": "23:59:00",
//             // Coordinates
//             "SensorData.coordinates.x": parseFloat(sensor.Cordinate_X) || 0.0,
//             "SensorData.coordinates.y": parseFloat(sensor.Cordinate_Y) || 0.0,
//             "SensorData.coordinates.z": parseFloat(sensor.Cordinate_Z) || 0.0,
//           }
//         },
//         upsert: true // Optionally create a new document if not found
//       }
//     }));
//   if (bulkOperations.length > 0) {
//     await collection.bulkWrite(bulkOperations);
//   }
// }
function UpdateByCSV(dataArray) {
    return __awaiter(this, void 0, void 0, function () {
        var db, collection, batchSize, i, batch, bulkOperations, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    collection = db.collection("exp_0_BOOT");
                    batchSize = 10;
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < dataArray.length)) return [3 /*break*/, 9];
                    batch = dataArray.slice(i, i + batchSize);
                    bulkOperations = batch
                        .filter(function (sensor) { return sensor.LLA; }) // Ensure LLA is not empty or null
                        .map(function (sensor) {
                        return {
                            updateMany: {
                                filter: { "SensorData.LLA": sensor.LLA },
                                update: {
                                    $set: {
                                        // Experiment data
                                        "ExperimentData.Exp_name": sensor.Exp_name,
                                        "ExperimentData.Exp_location": sensor.Exp_location,
                                        // Sensor data
                                        "SensorData.Location": sensor.Location,
                                        "SensorData.Label": sensor.Labels,
                                        "SensorData.LabelOptions": sensor.labelOptionsList,
                                        // Alerts
                                        "Alerts.Alerted": true,
                                        // Temperature
                                        "Alerts.Temperature.Max_Temp": parseInt(sensor.Max_Temp, 10),
                                        "Alerts.Temperature.Min_Temp": parseInt(sensor.Min_Temp, 10),
                                        "Alerts.Temperature.Start_Time": "00:01:00",
                                        "Alerts.Temperature.End_Time": "23:59:00",
                                        // Light
                                        "Alerts.Light.Max_Light": parseInt(sensor.Max_Light, 10),
                                        "Alerts.Light.Min_Light": parseInt(sensor.Min_Light, 10),
                                        "Alerts.Light.Start_Time": "00:00:00",
                                        "Alerts.Light.End_Time": "23:59:00",
                                        // Coordinates
                                        "SensorData.coordinates.x": parseFloat(sensor.Cordinate_X) || 0.0,
                                        "SensorData.coordinates.y": parseFloat(sensor.Cordinate_Y) || 0.0,
                                        "SensorData.coordinates.z": parseFloat(sensor.Cordinate_Z) || 0.0,
                                    }
                                },
                                upsert: true // Optionally create a new document if not found
                            }
                        };
                    });
                    if (!(bulkOperations.length > 0)) return [3 /*break*/, 7];
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, collection.bulkWrite(bulkOperations)];
                case 4:
                    result = _a.sent();
                    console.log("Batch ".concat(Math.floor(i / batchSize) + 1, " - Matched: ").concat(result.matchedCount, ", Modified: ").concat(result.modifiedCount, ", Upserted: ").concat(result.upsertedCount));
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _a.sent();
                    console.error("Error in batch ".concat(Math.floor(i / batchSize) + 1, ":"), error_1);
                    return [3 /*break*/, 6];
                case 6: return [3 /*break*/, 8];
                case 7:
                    console.log("Batch ".concat(Math.floor(i / batchSize) + 1, " - No valid sensors to update."));
                    _a.label = 8;
                case 8:
                    i += batchSize;
                    return [3 /*break*/, 2];
                case 9:
                    console.log("Finished updating sensors.");
                    return [2 /*return*/];
            }
        });
    });
}
exports.UpdateByCSV = UpdateByCSV;
/**
 * Retrieves information about all experiments from the database.
 * Returns an array of unique experiment names along with their start and end times.
 *
 * @returns {Promise<any[]>} - A promise that resolves to an array of experiment information.
 *                            Each element in the array represents a unique experiment and includes
 *                            the experiment name, start time, and end time.
 *
 * Usage Example:
 * ```
 * getExperimentsInfo()
 *   .then(experiments => console.log(experiments))
 *   .catch(error => console.error("Failed to retrieve experiment information", error));
 * ```
 *
 * @remarks
 * This function connects to the MongoDB, retrieves all collections, and extracts experiment information
 * from each collection. It skips the 'exp_0_BOOT' collection and ensures that each experiment name is unique.
 * The result is an array of experiment information, where each element represents a unique experiment
 * and includes the experiment name, start time, and end time.
 *
 * @since 2023-12-15
 * @author Nir
 */
function getExperimentsInfo() {
    return __awaiter(this, void 0, void 0, function () {
        var db, collections, experimentInfo, seenExperiments, _i, collections_12, collection, data, expName;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbPromise];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.listCollections().toArray()];
                case 2:
                    collections = _a.sent();
                    experimentInfo = new Set();
                    seenExperiments = new Set();
                    _i = 0, collections_12 = collections;
                    _a.label = 3;
                case 3:
                    if (!(_i < collections_12.length)) return [3 /*break*/, 6];
                    collection = collections_12[_i];
                    // Skip the 'exp_0_BOOT' collection
                    if (collection.name === 'exp_0_BOOT')
                        return [3 /*break*/, 5];
                    return [4 /*yield*/, db.collection(collection.name).find({}).toArray()];
                case 4:
                    data = _a.sent();
                    expName = data[0].ExperimentData.Exp_name;
                    // Check if the experiment name has already been seen
                    if (!seenExperiments.has(expName)) {
                        seenExperiments.add(expName); // Add to seen experiments
                        experimentInfo.add({
                            exp_name: collection.name,
                            start_time: data[0].ExperimentData.Start_time,
                            end_time: data[0].ExperimentData.End_time,
                            // data of all of the lla in the experiment and their location as dictionary {lla:location}
                            sensor_info: data.reduce(function (acc, curr) {
                                acc[curr.SensorData.LLA] = curr.SensorData.Location;
                                return acc;
                            }, {})
                        });
                    }
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: 
                // Convert Set to Array before returning
                return [2 /*return*/, Array.from(experimentInfo)];
            }
        });
    });
}
exports.getExperimentsInfo = getExperimentsInfo;
