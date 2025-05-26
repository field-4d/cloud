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
exports.DeadManAlerts = exports.sendAccumulatedAlerts = exports.alerter_2 = exports.alerter = exports.batteryAlerter = void 0;
var LocalMongoHandler_1 = require("./LocalMongoHandler");
var nodemailer = require("nodemailer");
var tempSentMail = new Map();
var lightSentMail = new Map();
var sentBatteryEmailMap = new Map();
var tempAlert = new Object();
tempAlert["sp_mac_address"] = { maxTemp: null, emailSent: false, spName: '' };
var mailList = ['mosheliongreenhouse@gmail.com', '', '', '', ''];
var defaultParm = {
    minBattery: 2750,
};
var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: "mosheliongreenhouse@gmail.com",
        pass: "eojevzaqemkqstic",
    },
});
// functino which find active sensors which didn't upload data for more than 30 minutes
function batteryAlerter(obj) {
    var activeSensorEntry = LocalMongoHandler_1.activeSensorsInfo.find(function (info) { return info.LLA === obj.ipv6; });
    if (!activeSensorEntry) {
        return;
    }
    var alerts = activeSensorEntry ? activeSensorEntry.Alerts : null;
    var location = activeSensorEntry ? activeSensorEntry.Location : null;
    var receiverMail = alerts.Email;
    // If user did not enter mail
    if (!receiverMail) {
        return;
    }
    if (obj.battery < defaultParm.minBattery) {
        if (sentBatteryEmailMap.get("".concat(obj["ipv6"])) == true) {
            return;
            // console.log(`BATTERY ALERT - SP: '${obj["ipv6"]}' (battery = ${obj["battery"]}) -> EMAIL HAS BEEN SENT ALREADY`);
        }
        else {
            console.log("BATTERY ALERT - SP: '".concat(obj["ipv6"], "' (battery = ").concat(obj["battery"], ") -> Sending EMAIL..."));
            var mailOptions = {
                from: 'mosheliongreenhouse@gmail.com',
                to: receiverMail,
                subject: "BATTERY ALERT - SP: '".concat(obj["ipv6"], "' | sp Location = \"").concat(location, "\""),
                html: "battery = ".concat(obj["battery"]),
            };
            transporter.sendMail(mailOptions, function (err, info) {
                if (err) {
                    console.log(JSON.parse(err));
                }
                else {
                    console.log(JSON.parse(info));
                }
            });
            sentBatteryEmailMap.set("".concat(obj["ipv6"]), true);
        }
    }
    else {
        sentBatteryEmailMap.set("".concat(obj["ipv6"]), false);
    }
}
exports.batteryAlerter = batteryAlerter;
function getCurrentTime() {
    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();
    // Formatting the hours and minutes to have leading zeros if needed
    var formattedHours = hours.toString().padStart(2, '0');
    var formattedMinutes = minutes.toString().padStart(2, '0');
    // Returning the time as a string in the format "HH:mm"
    return "".concat(formattedHours, ":").concat(formattedMinutes);
}
function isCurrentTimeInRange(startTime, endTime) {
    // Check if either startTime & endTime is set to '00:00:00'
    if (startTime === '00:00:00' && endTime === '00:00:00') {
        return false;
    }
    var now = getCurrentTime();
    // Extract hours and minutes from the time strings
    var nowHours = parseInt(now.split(':')[0], 10);
    var nowMinutes = parseInt(now.split(':')[1], 10);
    var startHours = parseInt(startTime.split(':')[0], 10);
    var startMinutes = parseInt(startTime.split(':')[1], 10);
    var endHours = parseInt(endTime.split(':')[0], 10);
    var endMinutes = parseInt(endTime.split(':')[1], 10);
    // Compare the time components directly as integers
    if (endHours < startHours || (endHours === startHours && endMinutes < startMinutes)) {
        // Check if the current time is either after the start time or before the end time
        // This condition accounts for the time range that spans across two days
        return (nowHours > startHours || (nowHours === startHours && nowMinutes >= startMinutes)) ||
            (nowHours < endHours || (nowHours === endHours && nowMinutes <= endMinutes));
    }
    // If the current time is between the start and end times, then it's within the range
    return (nowHours > startHours || (nowHours === startHours && nowMinutes >= startMinutes)) &&
        (nowHours < endHours || (nowHours === endHours && nowMinutes <= endMinutes));
}
// This function checks the sensor data against alert conditions and sends emails if necessary.
function alerter(obj) {
    (0, LocalMongoHandler_1.updateActiveSensorsInfo)();
}
exports.alerter = alerter;
// Function to get the current date and time in YYYY-MM-DDTHH:MM format
function getCurrentFormattedTime() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    var day = String(now.getDate()).padStart(2, '0');
    var hours = String(now.getHours()).padStart(2, '0');
    var minutes = String(now.getMinutes()).padStart(2, '0');
    return "".concat(year, "-").concat(month, "-").concat(day, "T").concat(hours, ":").concat(minutes);
}
///////////////////////////////////////////////////////////////////
// function to check if the sensor is in the alert range
var sensorSendCounts = new Map();
function updateAlertCount(sensorId, alertType, shouldSendAlert) {
    var sensorKey = "".concat(sensorId, "-").concat(alertType);
    if (shouldSendAlert) {
        var count = sensorSendCounts.get(sensorKey) || 0;
        sensorSendCounts.set(sensorKey, count + 1);
    }
    else {
        sensorSendCounts.set(sensorKey, 0); // Reset the count if the alert type is not being added
    }
    // console.log("The sensorSendCounts",sensorKey, sensorSendCounts.get(sensorKey));
}
// sensoAlert is a map of the sensor ipv6 address to the alerts for that sensor
var sensorAlerts = new Map();
function alerter_2(obj) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, SensorData, SensorAlerted, SensorExperiment, alertMessage, sendAlert, receiverMail, currentTime, shouldsSendTempAlert, shouldsSendLightAlert, _b, maxTemp, minTemp, tempStartTime, tempEndTime, isTempTimeInRange, currentTime_1, _c, maxLight, minLight, lightStartTime, lightEndTime, isLightTimeInRange, experimentKey, existingEntry;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, LocalMongoHandler_1.getSensorInfoByIpv6)(obj.ipv6)];
                case 1:
                    _a = _d.sent(), SensorData = _a.SensorData, SensorAlerted = _a.SensorAlerted, SensorExperiment = _a.SensorExperiment;
                    // Check if there are any keys in SensorData
                    if (Object.keys(SensorData).length !== 0 && SensorData.isValid === true) {
                        // do nothing   
                        // console.log("LLA: ", obj.ipv6, 
                        // ",SensorLocation: ", SensorData.Location, 
                        // ",SensorAlerted: ", SensorAlerted.Alerted,
                        // ",SensorExperiment: ", SensorExperiment.Exp_name);
                    }
                    else {
                        console.log(obj.ipv6, " - No sensor data found for LLA or sensor is Invalid");
                        return [2 /*return*/];
                    }
                    alertMessage = '';
                    sendAlert = false;
                    // check if the sensor is set for alert or the alert message is not empty
                    if (SensorAlerted.Alerted == true && SensorData.isValid === true) {
                        receiverMail = SensorAlerted.Email;
                        if (!receiverMail)
                            return [2 /*return*/];
                        currentTime = getCurrentFormattedTime();
                        shouldsSendTempAlert = false;
                        shouldsSendLightAlert = false;
                        _b = SensorAlerted.Temperature, maxTemp = _b.Max_Temp, minTemp = _b.Min_Temp, tempStartTime = _b.Start_Time, tempEndTime = _b.End_Time;
                        isTempTimeInRange = isCurrentTimeInRange(tempStartTime, tempEndTime);
                        if ((obj.hdc_temp > maxTemp || obj.hdc_temp < minTemp) && isTempTimeInRange) { // && isTempTimeInRange
                            //alertMessage += `${obj.ipv6}-Temperature Alert: Current - ${obj.bmp_temp}, Max - ${maxTemp}, Min - ${minTemp}\n`;
                            alertMessage += "".concat(currentTime, ",").concat(SensorExperiment.Exp_name, ",").concat(SensorData.Location, ",").concat(obj.ipv6, ",Temperature,").concat(obj.hdc_temp, ",").concat(minTemp, "-").concat(maxTemp, "\n");
                            // alertMessage += `${currentTime},${SensorExperiment.Exp_name},${SensorData.Location},${obj.ipv6},${obj.hdc_temp},${maxTemp},${minTemp}\n`;
                            sendAlert = true;
                            updateAlertCount(obj.ipv6, 'Temperature', true); // Update the alert count for this sensor
                        }
                        else {
                            updateAlertCount(obj.ipv6, 'Temperature', false); // Reset the alert count for this sensor
                        }
                        // battery Alert check (moved outside the other alerts check )
                        if (obj.battery < defaultParm.minBattery) { // the default value is 2750 and setup in the top of the file
                            currentTime_1 = getCurrentFormattedTime();
                            alertMessage += "".concat(currentTime_1, ",").concat(SensorExperiment.Exp_name, ",").concat(SensorData.Location, ",").concat(obj.ipv6, ",Battery,").concat(obj.battery, ",").concat(defaultParm.minBattery, "\n");
                            sendAlert = true;
                            updateAlertCount(obj.ipv6, 'Battery', true); // Update the alert count for this sensor
                        }
                        else {
                            updateAlertCount(obj.ipv6, 'Battery', false); // Reset the alert count for this sensor
                        }
                        _c = SensorAlerted.Light, maxLight = _c.Max_Light, minLight = _c.Min_Light, lightStartTime = _c.Start_Time, lightEndTime = _c.End_Time;
                        isLightTimeInRange = isCurrentTimeInRange(lightStartTime, lightEndTime);
                        if ((obj.light > maxLight || obj.light < minLight) && isLightTimeInRange) { // && isLightTimeInRange
                            //alertMessage += `${obj.ipv6}-Light Alert: Current - ${obj.light}, Max - ${maxLight}, Min - ${minLight}\n`;
                            alertMessage += "".concat(currentTime, ",").concat(SensorExperiment.Exp_name, ",").concat(SensorData.Location, ",").concat(obj.ipv6, ",Light,").concat(obj.light, ",").concat(minLight, "-").concat(maxLight, "\n");
                            sendAlert = true;
                            updateAlertCount(obj.ipv6, 'Light', true); // Update the alert count for this sensor
                        }
                        else {
                            updateAlertCount(obj.ipv6, 'Light', false); // Reset the alert count for this sensor
                        }
                        experimentKey = SensorExperiment.Exp_name;
                        if (sendAlert) {
                            existingEntry = sensorAlerts.get(experimentKey) || { message: '', email: receiverMail };
                            //existingEntry.message += `${currentTime},${SensorExperiment.Exp_name},${SensorData.Location},${obj.ipv6},${alertMessage}\n`;
                            existingEntry.message += "".concat(alertMessage, "\n");
                            sensorAlerts.set(experimentKey, existingEntry);
                            // console.log("Added Alerts for Experiment:", experimentKey);
                            console.log("The combined alert message is:\n", alertMessage);
                        }
                    }
                    return [2 /*return*/];
            }
        });
    });
}
exports.alerter_2 = alerter_2;
// nir- add aggregation of alerts and send them all at once
// the code intergrates the alerts from the same experiment and sends them all at once
// furthermore, it filter the messege on their count, and send only the last message within the last 3 minutes
function sendAccumulatedAlerts() {
    var currentTime = new Date();
    var currentMinute = currentTime.getMinutes();
    var intervalStartMinute = currentMinute - (currentMinute % 3); // Get the start minute of the current interval
    var intervalStartTime = new Date(currentTime); // Copy the current time
    intervalStartTime.setMinutes(intervalStartMinute, 0, 0); // Set the minutes, seconds and milliseconds to 0
    sensorAlerts.forEach(function (_a, experimentKey) {
        var message = _a.message, email = _a.email;
        if (message) {
            var latestMessagesMap_1 = new Map();
            // process each line to keep onlythe latest messege per sensor type within the interval
            message.split('\n').forEach(function (line) {
                var part = line.split(',');
                var TimeStamp = new Date(part[0]);
                if (TimeStamp >= intervalStartTime) {
                    var sensorId = part[3];
                    var alertType = part[4];
                    var sensorKey = "".concat(sensorId, "-").concat(alertType);
                    latestMessagesMap_1.set(sensorKey, line);
                }
            });
            // Filter the latest messages based on the alert count limit
            var filteredMessage = Array.from(latestMessagesMap_1.values()).filter(function (line) {
                var parts = line.split(',');
                var sensorId = parts[3];
                var alertType = parts[4];
                var sensorKey = "".concat(sensorId, "-").concat(alertType);
                var count = sensorSendCounts.get(sensorKey) || 0;
                // in 3-minute each sensor send 2 message,so the count should be 2
                // for each growth in the mutiply of 3 minute, the count should be mutiply by 2
                // for example, in 6 minute, each sensor should send 4 message, so the count should be 4
                // for example, in 9 minute, each sensor should send 6 message, so the count should be 6
                // for example, in 12 minute, each sensor should send 8 message, so the count should be 8
                // for example, in 15 minute, each sensor should send 10 message, so the count should be 10
                // for eample , in 60 minute, each sensor should send 40 message, so the count should be 40
                // so the formula should be count <= 2 * (currentTime/3)
                // return if count is maller or equal to 6
                return count <= 30;
            }).join('\n');
            // If there are no alerts that have exceeded the send limit, then send the entire message
            if (filteredMessage) {
                // Define the headers for the HTML table
                var headers = "Current Time,Experiment Name,Location,IPv6 Address,Type,Value,Range"
                    .split(',')
                    .map(function (header) { return "<th>".concat(header.trim(), "</th>"); })
                    .join('');
                var rows = filteredMessage.split('\n').map(function (line) {
                    return "<tr>".concat(line.split(',').map(function (cell) { return "<td>".concat(cell.trim(), "</td>"); }).join(''), "</tr>");
                }).join('');
                // Build the complete HTML table
                var htmlTable = "<table border=\"1\"><thead><tr>".concat(headers, "</tr></thead><tbody>").concat(rows, "</tbody></table>");
                console.log("Sending EMAIL to", email, "with alerts for experiment", experimentKey);
                var mailOptions = {
                    from: 'mosheliongreenhouse@gmail.com',
                    to: email,
                    subject: "ALERT for Experiment ".concat(experimentKey, " - Consolidated Report"),
                    html: htmlTable,
                };
                transporter.sendMail(mailOptions, function (err, info) {
                    if (err)
                        console.log(err);
                    else
                        console.log(info);
                });
                // Clear the alerts for this experiment after sending the email
                sensorAlerts.set(experimentKey, { message: '', email: email });
            }
        }
    });
}
exports.sendAccumulatedAlerts = sendAccumulatedAlerts;
function DeadManAlerts() {
    return __awaiter(this, void 0, void 0, function () {
        var currentTime, currentTimeStamp, DeltaMinutes, timeLimit, alertsByExperiment;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // Update the active sensors info before processing alerts
                return [4 /*yield*/, (0, LocalMongoHandler_1.updateActiveSensorsInfo)()];
                case 1:
                    // Update the active sensors info before processing alerts
                    _a.sent();
                    currentTime = new Date();
                    currentTimeStamp = currentTime.getTime();
                    DeltaMinutes = 30;
                    timeLimit = DeltaMinutes * 60 * 1000;
                    alertsByExperiment = {};
                    LocalMongoHandler_1.activeSensorsInfo.forEach(function (sensor) {
                        // skip sensors with "(faulty)" in their name
                        if (sensor.Location.includes("(faulty)")) {
                            return;
                        }
                        if (sensor.latestTimeStamp) {
                            var sensorTimeString = "".concat(sensor.latestTimeStamp.date, "T").concat(sensor.latestTimeStamp.time);
                            var sensorTime = new Date(sensorTimeString).getTime();
                            var timeDifference = currentTimeStamp - sensorTime;
                            if (timeDifference > timeLimit) {
                                var deltaTimestampMinutes = Math.round(timeDifference / (60 * 1000)); // Convert to minutes
                                var csvLine = "".concat(sensor.collectionName, ",").concat(sensor.LLA, ",").concat(sensor.Location, ",").concat(sensorTimeString, ",").concat(deltaTimestampMinutes, "\n");
                                if (!alertsByExperiment[sensor.collectionName]) {
                                    alertsByExperiment[sensor.collectionName] = {
                                        email: Array.isArray(sensor.Alerts.Email) ? sensor.Alerts.Email : [sensor.Alerts.Email],
                                        csv: "Experiment,LLA,Sensor,Last Timestamp,Delta Time (minutes)\n"
                                    };
                                }
                                alertsByExperiment[sensor.collectionName].csv += csvLine;
                            }
                        }
                    });
                    sendEmailAlerts(alertsByExperiment);
                    return [2 /*return*/];
            }
        });
    });
}
exports.DeadManAlerts = DeadManAlerts;
function sendEmailAlerts(alertsByExperiment) {
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: "mosheliongreenhouse@gmail.com",
            pass: "eojevzaqemkqstic",
        },
    });
    Object.keys(alertsByExperiment).forEach(function (experimentKey) {
        var experimentData = alertsByExperiment[experimentKey];
        var emails = experimentData.email.join(',');
        // Build the headers (this is static as you defined earlier)
        var headers = "<th>Experiment</th><th>LLA</th><th>Sensor</th><th>Last Timestamp</th><th>(Min) Last seen before (minutes)</th>";
        // Build the rows
        var rows = '';
        experimentData.csv.split('\n').slice(1).forEach(function (line) {
            if (line) {
                var columns = line.split(',');
                rows += "<tr>".concat(columns.map(function (col) { return "<td>".concat(col, "</td>"); }).join(''), "</tr>");
            }
        });
        // Build the complete HTML table
        var htmlTable = "<table border=\"1\"><thead><tr>".concat(headers, "</tr></thead><tbody>").concat(rows, "</tbody></table>");
        console.log("Sending EMAIL to", emails, "with alerts for experiment", experimentKey);
        var mailOptions = {
            from: 'mosheliongreenhouse@gmail.com',
            to: emails,
            subject: "Inactive Sensor Daily Report ".concat(experimentKey),
            html: htmlTable,
        };
        transporter.sendMail(mailOptions, function (err, info) {
            if (err)
                console.log(err);
            else
                console.log(info);
        });
        // Clear the alertsByExperiment after sending the email
        delete alertsByExperiment[experimentKey]; // Remove the entry from the alertsByExperiment object
    });
}
