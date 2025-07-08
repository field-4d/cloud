"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryFromBlackBox = exports.saveToBlackBox = void 0;
const influxdb_client_1 = require("@influxdata/influxdb-client");
const Models_1 = require("./Models");
function saveToBlackBox(packets) {
    const writeApi = Models_1.BlackBox.getWriteApi(Models_1.Conf.BlackBox.org, Models_1.Conf.BlackBox.bucket, 's');
    // writeApi.useDefaultTags({ host: 'wsn1' });
    writeApi.writePoints(packets);
    writeApi
        .close()
        .then(() => {
        console.log('[FieldArr@y-BlackBox] successfully saved .\n');
    })
        .catch((e) => {
        console.error(e);
        console.log('\\nFinished ERROR');
    });
}
exports.saveToBlackBox = saveToBlackBox;
// function to query data from the influxDB based on the experiment name
async function queryFromBlackBox(expName) {
    const url = Models_1.Conf.BlackBox.url;
    const token = Models_1.Conf.BlackBox.token;
    const org = Models_1.Conf.BlackBox.org;
    console.log('queryFromBlackBox - InfluxDB configuration:', url, token, org);
    /**
     * intisiates the influxDB client with configuration
     */
    const queryAPI = new influxdb_client_1.InfluxDB({ url, token }).getQueryApi(org);
    console.log('queryFromBlackBox - Querying data from InfluxDB');
    console.log(Models_1.Conf.BlackBox.bucket, expName);
    const fluxQuery = `
  from(bucket: "${Models_1.Conf.BlackBox.bucket}")
    |> range(start: 0) 
    |> filter(fn: (r) => r["Exp_Name"] == "${expName}")
    |> aggregateWindow(every: 3m, fn: mean, createEmpty: false)
    |> yield(name: "mean")
`;
    let csvData = "date,exp_name,LLA,field,measurements\n"; // CSV Header
    try {
        for await (const { values, tableMeta } of queryAPI.iterateRows(fluxQuery)) {
            const o = tableMeta.toObject(values);
            csvData += `${o._time},${expName},${o._measurement},${o._field},${o._value}\n`;
        }
        return csvData;
    }
    catch (e) {
        console.error(e);
        return ''; // Return an empty string in case of an error
    }
}
exports.queryFromBlackBox = queryFromBlackBox;
