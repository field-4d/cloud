import { Point } from '@influxdata/influxdb-client';
import { PackageObj, PkgElement } from './Interfaces';
import { PackageToSend } from './Models';
import { saveToBlackBox } from './DB';
import { updateActiveSensorsInfo , activeSensorsInfo,PackageToSendMongo } from './LocalMongoHandler'

// const SYNC_INTERVAL = 180000;
export const uploadToInflux = { value: false };

const SYNC_INTERVAL = 180000;  // this is in milliseconds

// const spList: PkgElement = {}; // nir changed 06.09.2023
let spList: PkgElement = {}; // also change this in order to prevent repetition (instad of const is let)
let lastBuffer: PackageObj[];
let SPcount: number;
let BufferCount = 0;
/*******************************************/


export const isNewSP = (sp: string): boolean => {
  if (sp in spList) {
    return false;
  } else {
    return true;
  }
};

/* nir eddtion 2025-04-14 */
// Utility function to merge package data
function mergePackages(existingPackage: any, newPackage: any): any {
  return { ...existingPackage, ...newPackage };
}

export function addNewSP(sp: any): void {
  spList[sp.ADDR] = {
    lastPackageID: sp.NUM,
    lastPackage: sp.DB, // intialize the first package
    isFirstPackage: true,
    timeReceived: sp.TIME,
  };
  SPcount = Object.keys(spList).length;

}

export function updateNewPackage(sp: any): void {
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
      lastPackage: mergedPackage, // Store the merged package
      isFirstPackage: false,
      timeReceived: sp.TIME,
    };
  } 
  // console.log("spList after updateNewPackage:", spList);
}


// ipv6 - the sensor ipv6, pkg - the current package number
export const isNewPackage = (ipv6: string, pkg: number): boolean => {
  if (pkg == spList[ipv6].lastPackageID) {

    return false;
  } else {
    return true;
  }
};

const wasSent = (
  thisPackage: PackageObj[],
  sentPackage: PackageObj[],
): boolean => {
  if (
    !thisPackage ||
    !sentPackage ||
    thisPackage.length !== sentPackage.length
  ) {
    return false;
  }
  for (const pkg of thisPackage) {
    if (sentPackage.includes(pkg)) {
      console.log(`Package #${pkg.packet_number} was sent`);
      return true;
    }
  }
  console.log(
    `this package number ${sentPackage
      .map(pkg => pkg.packet_number)
      .toString()} ≠ last package number ${thisPackage
      .map(pkg => pkg.packet_number)
      .toString()}`,
  );
  return false;
};
async function prepareBuffer(ts: number): Promise<Point[]> {
  const pkgBuffer: Point[] = [];
  BufferCount++;

  for (const sp in spList) {
    const spData = spList[sp];
    const spIPv6 = spData.lastPackage.ipv6;
    const activeSensorEntry = activeSensorsInfo.find(info => info.LLA === spIPv6);
    const exp_name = activeSensorEntry ? activeSensorEntry.collectionName : null;
    if (exp_name) {
      const pkg = PackageToSend(spList[sp].lastPackage, ts, BufferCount, exp_name).Ready;
      pkgBuffer.push(pkg); // insert the package to the buffer and influxdb 
      
      // Insert data into MongoDB
      await PackageToSendMongo(spList[sp].lastPackage, ts, BufferCount, exp_name);
    }
  }
  
  // Empty the spList parameter after sending the data to the DB
  for (const sp in spList) {
    delete spList[sp];
  }
  
  // console.log(pkgBuffer);
  console.log("wiped splist after sending to DB:", spList);
  return pkgBuffer;
}


function addToBuffer(): PackageObj[] {
  const pkgBuffer: PackageObj[] = [];
  for (const sp in spList) {
    pkgBuffer.push(spList[sp].lastPackage);
  }

  return pkgBuffer;
}

export function showList(): void {
  console.log(`Showing ${SPcount} SPs:\n`);
  console.log(spList);
}

export async function syncPackets(): Promise<void> {
  console.log('Trying to sync packets:\n');
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
    await saveToBlackBox(Packed); // in here we save the data to the influxDB
  }
  // await saveToBlackBox(Packed); // in here we save the data to the influxDB
  // saveToCloud(Packed);
  lastBuffer = PkgBuffer;
}

// an interval function that checks if the uploadToInflux variable switched to true every 30s
function isUploadTime() : void {
  if (uploadToInflux.value == true) {
    console.log("From PkgHandel SYNC IS ON!");
    clearInterval(checkInterval);
    // If so - start uploading to InfluxDB
    const syncInterval = setInterval(syncPackets, SYNC_INTERVAL); // sync the packets every 3 minutes
  } 
}


const mongoInfoInterval = setInterval(updateActiveSensorsInfo, 30000); // update the active sensors info every 30s
const checkInterval = setInterval(isUploadTime,5000); // check if the uploadToInflux variable switched to true every 5s