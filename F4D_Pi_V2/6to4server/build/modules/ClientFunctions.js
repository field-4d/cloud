"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPingToClient = exports.sendLaaToClient = exports.handleUpdateLabel = exports.handleUpdateByCSV = exports.handleUpdateAlertedMail = exports.handleSwitchSensorsList = exports.handleGetExperimentsInfo = exports.handleRemoveSensor = exports.handleSetSensor = exports.handleEndExperiment = exports.handleStartNewExperiment = exports.handleRemoveBootSensor = exports.handleAddCordinates = exports.handleAddExperiment = exports.handleInfluxPull = void 0;
const pkgHandler_1 = require("./pkgHandler");
const Functions_1 = require("./Functions");
const LocalMongoHandler_1 = require("./LocalMongoHandler");
const DB_1 = require("./DB");
// dssdssdfdf
async function handleInfluxPull(recieved, ws) {
    const expName = recieved.data;
    console.log("handleInfluxPull - i'll pull from influx: ", expName);
    // use queryFromBlackBox to get the data from influxaddSensorData
    const data = await (0, DB_1.queryFromBlackBox)(expName);
    const event = {
        type: 'influx_pull_success',
        data: data,
    };
    ws.send(JSON.stringify(event));
}
exports.handleInfluxPull = handleInfluxPull;
async function handleAddExperiment(received, ws) {
    console.log('addExperiment received from client');
    // Assuming received.data is an array with the second element being the experiment data
    const experimentData = received.data[1];
    // assign the data to variables
    const expName = experimentData.Exp_name;
    const expLocation = experimentData.Exp_location;
    // print the data
    console.log("expName: ", expName);
    console.log("expLocation: ", expLocation);
    // send to LocalMongo
}
exports.handleAddExperiment = handleAddExperiment;
async function handleAddCordinates(received, ws) {
    const recvied_sensor = received.data[0][0];
    const cordinates_dict = received.data[1];
    let Res = await (0, LocalMongoHandler_1.addSensorCoordinates)(recvied_sensor, cordinates_dict); // add the cordinates to the DB
    console.log("Res: ", Res);
    const event = {
        type: 'cordinates_added',
        data: Res,
    };
    ws.send(JSON.stringify(event));
}
exports.handleAddCordinates = handleAddCordinates;
// function that handle the async request to remove sensor from the exp_0_BOOT collection
async function handleRemoveBootSensor(received, ws) {
    // console.log('removeBootSensor received from client');
    // console.log("received.data: ",received.data); 
    // reciveing all the list info -> sensor LLA is under data[0][0].SensorData.LLA
    const recvied_sensor = received.data[0].SensorData.LLA;
    console.log("recvied_sensor: ", recvied_sensor);
    let res = await (0, LocalMongoHandler_1.removeSensorFromBoot)(recvied_sensor); // remove the sensor from the DB
    const event = {
        type: 'sensor_removed_from_boot',
        data: res,
    };
    ws.send(JSON.stringify(event));
}
exports.handleRemoveBootSensor = handleRemoveBootSensor;
async function handleStartNewExperiment(received, ws) {
    console.log('startNewExperiment received from client');
    const expName = received.data[0].ExperimentData.Exp_name;
    const expId = await (0, LocalMongoHandler_1.createNewCollection)(expName);
    const newList = (0, Functions_1.updateExpId)(received.data, expId);
    pkgHandler_1.uploadToInflux.value = true; // Update the value property
    for (const sensorData of newList) {
        await (0, LocalMongoHandler_1.addSensorData)(sensorData, `exp_${expId}_${expName}`);
    }
    const event = {
        type: 'sensors_list_update',
        data: newList,
    };
    ws.send(JSON.stringify(event));
}
exports.handleStartNewExperiment = handleStartNewExperiment;
async function handleEndExperiment(received, ws) {
    console.log('End_Experiment received from client');
    const expName = received.data[0].ExperimentData.Exp_name;
    const expId = received.data[0].ExperimentData.Exp_id;
    for (const sensorData of received.data) {
        await (0, LocalMongoHandler_1.addSensorData)(sensorData, `exp_${expId}_${expName}`);
    }
    const event = {
        type: 'force_refresh'
    };
    ws.send(JSON.stringify(event));
}
exports.handleEndExperiment = handleEndExperiment;
async function handleSetSensor(received) {
    // console.log('/setSensor received from client');
    if (received.data.ExperimentData.Exp_id == '') {
        await (0, LocalMongoHandler_1.addSensorData)(received.data, 'exp_0_BOOT');
    }
    else {
        await (0, LocalMongoHandler_1.addSensorData)(received.data, `exp_${received.data.ExperimentData.Exp_id}_${received.data.ExperimentData.Exp_name}`);
    }
}
exports.handleSetSensor = handleSetSensor;
async function handleRemoveSensor(received) {
    await (0, LocalMongoHandler_1.addSensorData)(received.data, 'exp_0_BOOT');
}
exports.handleRemoveSensor = handleRemoveSensor;
// nir adition 16.01.23
// function that handles the getExperimentsInfo request from the client
async function handleGetExperimentsInfo(received, ws) {
    const experimentsInfo = await (0, LocalMongoHandler_1.getExperimentsInfo)();
    const event = {
        type: 'experiments_info',
        data: experimentsInfo,
    };
    ws.send(JSON.stringify(event));
}
exports.handleGetExperimentsInfo = handleGetExperimentsInfo;
/// nir adition 26.11.2023 //
// data[0],data[1] - the ipv6 of the sensor and the ipv6 of the new sensor
// data[2] - the mongodb dict of sensors list
// function which get the Switch sensors list from  the client, and prints the sensr info
async function handleSwitchSensorsList(received, ws) {
    const sensorList = received.data;
    const ipv6ofCurrentSensor = sensorList[0];
    const ipv6ofNewSensor = sensorList[1];
    const sensorsList = sensorList[2];
    await (0, LocalMongoHandler_1.MongoSwitchSensorsList)(ipv6ofCurrentSensor, ipv6ofNewSensor, sensorsList);
    const event_update = {
        type: 'sensor_repalced'
    };
    ws.send(JSON.stringify(event_update));
}
exports.handleSwitchSensorsList = handleSwitchSensorsList;
/// function that get's the Experiment name and the wanted alerted mail and update the DB
// the function get [list,expName,alertedMail]
async function handleUpdateAlertedMail(received, ws) {
    const expName = received.data[1];
    let alertedMail = received.data[2];
    // Replace ',\n' '\n' or ',' or ' ' with ', '
    alertedMail = alertedMail.replace(/,?\n|,(?!\s)|\s+/g, ',');
    console.log("alertedMail: ", alertedMail);
    await (0, LocalMongoHandler_1.updateSensorAlertedMail)(expName, alertedMail);
    const even_update = {
        type: 'alerted_mail_updated'
    };
    ws.send(JSON.stringify(even_update));
}
exports.handleUpdateAlertedMail = handleUpdateAlertedMail;
// function thaty handle the csv file from the client and update the DB
async function handleUpdateByCSV(received, ws) {
    const csv = received.data; // the csv file
    (0, LocalMongoHandler_1.UpdateByCSV)(csv); // send the csv to the function that update the DB
    const event_update = {
        type: 'Csv_Updated'
    };
    ws.send(JSON.stringify(event_update));
}
exports.handleUpdateByCSV = handleUpdateByCSV;
// function that handle the sensor label data uodate from the client and update the DB
async function handleUpdateLabel(received, ws) {
    const sensorData = received.data; // the sensor data
    await (0, LocalMongoHandler_1.updateLabel)(sensorData); // Send the sensor data to the function that updates the DB
    // create an event update object
    const event_update = {
        type: 'label_updated'
    };
    // send the event update object to the client
    ws.send(JSON.stringify(event_update));
}
exports.handleUpdateLabel = handleUpdateLabel;
function sendLaaToClient(ipv6, timestamp, ws) {
    // const timestamp = new Date().toISOString();
    // console.log(`sendLaaToClient called for ${ipv6} at ${timestamp}`);
    const event = {
        type: "sp_ipv6",
        data: { ipv6: ipv6, timestamp: timestamp }
    };
    ws.send(JSON.stringify(event));
}
exports.sendLaaToClient = sendLaaToClient;
function sendPingToClient(ipv6, ws) {
    const timestamp = new Date().toString();
    const event = {
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
