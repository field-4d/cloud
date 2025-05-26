"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.syncPackets = exports.showList = exports.isNewPackage = exports.updateNewPackage = exports.addNewSP = exports.isNewSP = exports.uploadToInflux = void 0;
var Models_1 = require("./Models");
var DB_1 = require("./DB");
var LocalMongoHandler_1 = require("./LocalMongoHandler");
// const SYNC_INTERVAL = 180000;
exports.uploadToInflux = { value: false };
var SYNC_INTERVAL = 180000; // this is in milliseconds
// const spList: PkgElement = {}; // nir changed 06.09.2023
var spList = {}; // also change this in order to prevent repetition (instad of const is let)
var lastBuffer;
var SPcount;
var BufferCount = 0;
/*******************************************/
var isNewSP = function (sp) {
    if (sp in spList) {
        return false;
    }
    else {
        return true;
    }
};
exports.isNewSP = isNewSP;
/* nir eddtion 2025-04-14 */
// Utility function to merge package data
function mergePackages(existingPackage, newPackage) {
    return __assign(__assign({}, existingPackage), newPackage);
}
function addNewSP(sp) {
    spList[sp.ADDR] = {
        lastPackageID: sp.NUM,
        lastPackage: sp.DB,
        isFirstPackage: true,
        timeReceived: sp.TIME,
    };
    SPcount = Object.keys(spList).length;
}
exports.addNewSP = addNewSP;
function updateNewPackage(sp) {
    // spList[sp.ADDR] = {
    //   lastPackageID: sp.NUM,
    //   lastPackage: sp.DB,
    //   isFirstPackage: false,
    //   timeReceived: sp.TIME,
    // };
    var existingSP = spList[sp.ADDR];
    if (existingSP) {
        // Merge the new package data with the existing lastPackage
        var mergedPackage = mergePackages(existingSP.lastPackage, sp.DB);
        spList[sp.ADDR] = {
            lastPackageID: sp.NUM,
            lastPackage: mergedPackage,
            isFirstPackage: false,
            timeReceived: sp.TIME,
        };
    }
    // console.log("spList after updateNewPackage:", spList);
}
exports.updateNewPackage = updateNewPackage;
// ipv6 - the sensor ipv6, pkg - the current package number
var isNewPackage = function (ipv6, pkg) {
    if (pkg == spList[ipv6].lastPackageID) {
        return false;
    }
    else {
        return true;
    }
};
exports.isNewPackage = isNewPackage;
var wasSent = function (thisPackage, sentPackage) {
    if (!thisPackage ||
        !sentPackage ||
        thisPackage.length !== sentPackage.length) {
        return false;
    }
    for (var _i = 0, thisPackage_1 = thisPackage; _i < thisPackage_1.length; _i++) {
        var pkg = thisPackage_1[_i];
        if (sentPackage.includes(pkg)) {
            console.log("Package #".concat(pkg.packet_number, " was sent"));
            return true;
        }
    }
    console.log("this package number ".concat(sentPackage
        .map(function (pkg) { return pkg.packet_number; })
        .toString(), " \u2260 last package number ").concat(thisPackage
        .map(function (pkg) { return pkg.packet_number; })
        .toString()));
    return false;
};
function prepareBuffer(ts) {
    return __awaiter(this, void 0, void 0, function () {
        var pkgBuffer, _loop_1, _a, _b, _c, _i, sp, sp;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    pkgBuffer = [];
                    BufferCount++;
                    _loop_1 = function (sp) {
                        var spData, spIPv6, activeSensorEntry, exp_name, pkg;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    spData = spList[sp];
                                    spIPv6 = spData.lastPackage.ipv6;
                                    activeSensorEntry = LocalMongoHandler_1.activeSensorsInfo.find(function (info) { return info.LLA === spIPv6; });
                                    exp_name = activeSensorEntry ? activeSensorEntry.collectionName : null;
                                    if (!exp_name) return [3 /*break*/, 2];
                                    pkg = (0, Models_1.PackageToSend)(spList[sp].lastPackage, ts, BufferCount, exp_name).Ready;
                                    pkgBuffer.push(pkg); // insert the package to the buffer and influxdb 
                                    // Insert data into MongoDB
                                    return [4 /*yield*/, (0, LocalMongoHandler_1.PackageToSendMongo)(spList[sp].lastPackage, ts, BufferCount, exp_name)];
                                case 1:
                                    // Insert data into MongoDB
                                    _e.sent();
                                    _e.label = 2;
                                case 2: return [2 /*return*/];
                            }
                        });
                    };
                    _a = spList;
                    _b = [];
                    for (_c in _a)
                        _b.push(_c);
                    _i = 0;
                    _d.label = 1;
                case 1:
                    if (!(_i < _b.length)) return [3 /*break*/, 4];
                    _c = _b[_i];
                    if (!(_c in _a)) return [3 /*break*/, 3];
                    sp = _c;
                    return [5 /*yield**/, _loop_1(sp)];
                case 2:
                    _d.sent();
                    _d.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    // Empty the spList parameter after sending the data to the DB
                    for (sp in spList) {
                        delete spList[sp];
                    }
                    // console.log(pkgBuffer);
                    console.log("wiped splist after sending to DB:", spList);
                    return [2 /*return*/, pkgBuffer];
            }
        });
    });
}
function addToBuffer() {
    var pkgBuffer = [];
    for (var sp in spList) {
        pkgBuffer.push(spList[sp].lastPackage);
    }
    return pkgBuffer;
}
function showList() {
    console.log("Showing ".concat(SPcount, " SPs:\n"));
    console.log(spList);
}
exports.showList = showList;
function syncPackets() {
    return __awaiter(this, void 0, void 0, function () {
        var now, timeStamp, PkgBuffer, Packed, Upload_To_Influx;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Trying to sync packets:\n');
                    now = new Date();
                    timeStamp = now.setSeconds(0, 0) / 1000;
                    PkgBuffer = addToBuffer();
                    // if (!wasSent(PkgBuffer, lastBuffer)) {
                    console.log('Syncing Packets:\n');
                    return [4 /*yield*/, prepareBuffer(timeStamp)];
                case 1:
                    Packed = _a.sent();
                    Upload_To_Influx = true;
                    if (!Upload_To_Influx) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, DB_1.saveToBlackBox)(Packed)];
                case 2:
                    _a.sent(); // in here we save the data to the influxDB
                    _a.label = 3;
                case 3:
                    // await saveToBlackBox(Packed); // in here we save the data to the influxDB
                    // saveToCloud(Packed);
                    lastBuffer = PkgBuffer;
                    return [2 /*return*/];
            }
        });
    });
}
exports.syncPackets = syncPackets;
// an interval function that checks if the uploadToInflux variable switched to true every 30s
function isUploadTime() {
    if (exports.uploadToInflux.value == true) {
        console.log("From PkgHandel SYNC IS ON!");
        clearInterval(checkInterval);
        // If so - start uploading to InfluxDB
        var syncInterval = setInterval(syncPackets, SYNC_INTERVAL); // sync the packets every 3 minutes
    }
}
var mongoInfoInterval = setInterval(LocalMongoHandler_1.updateActiveSensorsInfo, 30000); // update the active sensors info every 30s
var checkInterval = setInterval(isUploadTime, 5000); // check if the uploadToInflux variable switched to true every 5s
