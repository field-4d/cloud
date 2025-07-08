"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncPackets = exports.showList = exports.isNewPackage = exports.updateNewPackage = exports.addNewSP = exports.isNewSP = exports.uploadToInflux = void 0;
const Models_1 = require("./Models");
const DB_1 = require("./DB");
const LocalMongoHandler_1 = require("./LocalMongoHandler");
// const SYNC_INTERVAL = 180000;
exports.uploadToInflux = { value: false };
const SYNC_INTERVAL = 180000; // this is in milliseconds
// const spList: PkgElement = {}; // nir changed 06.09.2023
let spList = {}; // also change this in order to prevent repetition (instad of const is let)
let lastBuffer;
let SPcount;
let BufferCount = 0;
/*******************************************/
const isNewSP = (sp) => {
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
    return { ...existingPackage, ...newPackage };
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
    const existingSP = spList[sp.ADDR];
    if (existingSP) {
        // Merge the new package data with the existing lastPackage
        const mergedPackage = mergePackages(existingSP.lastPackage, sp.DB);
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
const isNewPackage = (ipv6, pkg) => {
    if (pkg == spList[ipv6].lastPackageID) {
        return false;
    }
    else {
        return true;
    }
};
exports.isNewPackage = isNewPackage;
const wasSent = (thisPackage, sentPackage) => {
    if (!thisPackage ||
        !sentPackage ||
        thisPackage.length !== sentPackage.length) {
        return false;
    }
    for (const pkg of thisPackage) {
        if (sentPackage.includes(pkg)) {
            console.log(`Package #${pkg.packet_number} was sent`);
            return true;
        }
    }
    console.log(`this package number ${sentPackage
        .map(pkg => pkg.packet_number)
        .toString()} ≠ last package number ${thisPackage
        .map(pkg => pkg.packet_number)
        .toString()}`);
    return false;
};
async function prepareBuffer(ts) {
    const pkgBuffer = [];
    BufferCount++;
    for (const sp in spList) {
        const spData = spList[sp];
        const spIPv6 = spData.lastPackage.ipv6;
        const activeSensorEntry = LocalMongoHandler_1.activeSensorsInfo.find(info => info.LLA === spIPv6);
        const exp_name = activeSensorEntry ? activeSensorEntry.collectionName : null;
        if (exp_name) {
            const pkg = (0, Models_1.PackageToSend)(spList[sp].lastPackage, ts, BufferCount, exp_name).Ready;
            pkgBuffer.push(pkg); // insert the package to the buffer and influxdb 
            // Insert data into MongoDB
            await (0, LocalMongoHandler_1.PackageToSendMongo)(spList[sp].lastPackage, ts, BufferCount, exp_name);
        }
    }
    // Empty the spList parameter after sending the data to the DB
    for (const sp in spList) {
        delete spList[sp];
    }
    // console.log(pkgBuffer);
    console.log(`[${new Date().toLocaleString()}] wiped splist after sending to DB:`, spList);
    return pkgBuffer;
}
function addToBuffer() {
    const pkgBuffer = [];
    for (const sp in spList) {
        pkgBuffer.push(spList[sp].lastPackage);
    }
    return pkgBuffer;
}
function showList() {
    console.log(`Showing ${SPcount} SPs:\n`);
    console.log(spList);
}
exports.showList = showList;
async function syncPackets() {
    console.log(`[${new Date().toLocaleString()}] Trying to sync packets:\n`);
    const now = new Date();
    const timeStamp = now.setSeconds(0, 0) / 1000;
    const PkgBuffer = addToBuffer();
    // if (!wasSent(PkgBuffer, lastBuffer)) {
    console.log('Syncing Packets:\n');
    const Packed = await prepareBuffer(timeStamp);
    // legecy lines of code, which store the data in the influxDB !
    // check if the uploadToInflux variable is true
    let Upload_To_Influx = true;
    if (Upload_To_Influx) { // if true - save the data to the influxDB
        await (0, DB_1.saveToBlackBox)(Packed); // in here we save the data to the influxDB
    }
    // await saveToBlackBox(Packed); // in here we save the data to the influxDB
    // saveToCloud(Packed);
    lastBuffer = PkgBuffer;
}
exports.syncPackets = syncPackets;
function getDelayToNext3MinuteMark() {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ms = now.getMilliseconds();
    const nextMark = Math.ceil(minutes / 3) * 3;
    let delayMinutes = nextMark - minutes;
    if (delayMinutes === 0 && (seconds > 0 || ms > 0)) {
        delayMinutes = 3;
    }
    const delayMs = delayMinutes * 60 * 1000 - seconds * 1000 - ms;
    const firstSyncTime = new Date(Date.now() + delayMs);
    console.log(`[[SYNC] First sync will run at ${firstSyncTime.toLocaleTimeString()}`);
    return delayMs;
}
// an interval function that checks if the uploadToInflux variable switched to true every 30s
// function isUploadTime() : void {
//   if (uploadToInflux.value == true) {
//     console.log("From PkgHandel SYNC IS ON!");
//     clearInterval(checkInterval);
//     // If so - start uploading to InfluxDB
//     const syncInterval = setInterval(syncPackets, SYNC_INTERVAL); // sync the packets every 3 minutes
//   } 
// }
function isUploadTime() {
    if (exports.uploadToInflux.value == true) {
        console.log(`From PkgHandel SYNC IS ON!`);
        clearInterval(checkInterval);
        const delay = getDelayToNext3MinuteMark();
        setTimeout(() => {
            syncPackets();
            console.log(`[SYNC] Started 3-minute sync interval.`);
            setInterval(syncPackets, SYNC_INTERVAL); // every 3 minutes
        }, delay);
    }
}
const mongoInfoInterval = setInterval(LocalMongoHandler_1.updateActiveSensorsInfo, 30000); // update the active sensors info every 30s
const checkInterval = setInterval(isUploadTime, 5000); // check if the uploadToInflux variable switched to true every 5s
