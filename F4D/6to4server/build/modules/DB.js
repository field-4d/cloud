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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryFromBlackBox = exports.saveToBlackBox = void 0;
var influxdb_client_1 = require("@influxdata/influxdb-client");
var Models_1 = require("./Models");
function saveToBlackBox(packets) {
    var writeApi = Models_1.BlackBox.getWriteApi(Models_1.Conf.BlackBox.org, Models_1.Conf.BlackBox.bucket, 's');
    // writeApi.useDefaultTags({ host: 'wsn1' });
    writeApi.writePoints(packets);
    writeApi
        .close()
        .then(function () {
        console.log('[FieldArr@y-BlackBox] successfully saved .\n');
    })
        .catch(function (e) {
        console.error(e);
        console.log('\\nFinished ERROR');
    });
}
exports.saveToBlackBox = saveToBlackBox;
// function to query data from the influxDB based on the experiment name
function queryFromBlackBox(expName) {
    var _a, e_1, _b, _c;
    return __awaiter(this, void 0, void 0, function () {
        var url, token, org, queryAPI, fluxQuery, csvData, _d, _e, _f, values, tableMeta, o, e_1_1, e_2;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    url = Models_1.Conf.BlackBox.url;
                    token = Models_1.Conf.BlackBox.token;
                    org = Models_1.Conf.BlackBox.org;
                    console.log('queryFromBlackBox - InfluxDB configuration:', url, token, org);
                    queryAPI = new influxdb_client_1.InfluxDB({ url: url, token: token }).getQueryApi(org);
                    console.log('queryFromBlackBox - Querying data from InfluxDB');
                    console.log(Models_1.Conf.BlackBox.bucket, expName);
                    fluxQuery = "\n  from(bucket: \"".concat(Models_1.Conf.BlackBox.bucket, "\")\n    |> range(start: 0) \n    |> filter(fn: (r) => r[\"Exp_Name\"] == \"").concat(expName, "\")\n    |> aggregateWindow(every: 3m, fn: mean, createEmpty: false)\n    |> yield(name: \"mean\")\n");
                    csvData = "date,exp_name,LLA,field,measurements\n";
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 14, , 15]);
                    _g.label = 2;
                case 2:
                    _g.trys.push([2, 7, 8, 13]);
                    _d = true, _e = __asyncValues(queryAPI.iterateRows(fluxQuery));
                    _g.label = 3;
                case 3: return [4 /*yield*/, _e.next()];
                case 4:
                    if (!(_f = _g.sent(), _a = _f.done, !_a)) return [3 /*break*/, 6];
                    _c = _f.value;
                    _d = false;
                    try {
                        values = _c.values, tableMeta = _c.tableMeta;
                        o = tableMeta.toObject(values);
                        csvData += "".concat(o._time, ",").concat(expName, ",").concat(o._measurement, ",").concat(o._field, ",").concat(o._value, "\n");
                    }
                    finally {
                        _d = true;
                    }
                    _g.label = 5;
                case 5: return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 13];
                case 7:
                    e_1_1 = _g.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 13];
                case 8:
                    _g.trys.push([8, , 11, 12]);
                    if (!(!_d && !_a && (_b = _e.return))) return [3 /*break*/, 10];
                    return [4 /*yield*/, _b.call(_e)];
                case 9:
                    _g.sent();
                    _g.label = 10;
                case 10: return [3 /*break*/, 12];
                case 11:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 12: return [7 /*endfinally*/];
                case 13: return [2 /*return*/, csvData];
                case 14:
                    e_2 = _g.sent();
                    console.error(e_2);
                    return [2 /*return*/, '']; // Return an empty string in case of an error
                case 15: return [2 /*return*/];
            }
        });
    });
}
exports.queryFromBlackBox = queryFromBlackBox;
