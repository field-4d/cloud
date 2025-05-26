const { MongoClient } = require('mongodb');
import { uploadToInflux } from './pkgHandler';
import { Conf } from './Models'

var LOCAL_URL = "mongodb://127.0.0.1:27017/";


const Device_Owner = Conf.Device_Owner.Owner;
// const Device_OWNER = "developer_room";

const client = new MongoClient(LOCAL_URL, { useNewUrlParser: true, useUnifiedTopology: true });
export var activeSensorsInfo : any[] = [];
const mac_add = Conf.BlackBox.bucket
const dbPromise = client.connect().then(() => client.db(mac_add));


export type PackageObj = {
  ipv6: string;
  light?: number;
  battery_t?: number;
  battery: number;
  bmp_press?: number;
  bmp_temp?: number;
  hdc_temp?: number;
  hdc_humidity?: number;
  tmp107_amb?: number;
  tmp107_obj?: number;
  rssi?: number;
  // Fields for the second type of package
  bmp_390_u18_pressure?: number;
  bmp_390_u18_temperature?: number;
  bmp_390_u19_pressure?: number;
  bmp_390_u19_temperature?: number;
  hdc_2010_u13_temperature?: number;
  hdc_2010_u13_humidity?: number;
  hdc_2010_u16_temperature?: number;
  hdc_2010_u16_humidity?: number;
  hdc_2010_u17_temperature?: number;
  hdc_2010_u17_humidity?: number;
  opt_3001_u1_light_intensity?: number;
  opt_3001_u2_light_intensity?: number;
  opt_3001_u3_light_intensity?: number;
  opt_3001_u4_light_intensity?: number;
  opt_3001_u5_light_intensity?: number;
  batmon_temperature?: number;
  batmon_battery_voltage?: number;
     // Fields for the CO2 and Air Velocity package type
  co2_ppm?: number;
  air_velocity?: number;
  // Fields for the ZTP-315 Thermopile IR sensor
  ztp_315_surface_temperature?: number;
  ztp_315_ambient_temperature?: number;
  ztp_315_object_temperature?: number;
  ztp_315_voltage_output?: number;
  ztp_315_temperature_offset?: number;
  ztp_315_emissivity?: number;
  ztp_315_calibrated_temperature?: number;
  // Fields for IIS3DHHC accelerometer
  iis3dhhc_x_acceleration?: number;
  iis3dhhc_y_acceleration?: number;
  iis3dhhc_z_acceleration?: number;
  iis3dhhc_temperature?: number;
  // Fields for precision inclinometer angles
  iis3dhhc_roll_angle?: number;
  iis3dhhc_pitch_angle?: number;
  iis3dhhc_yaw_angle?: number;
  iis3dhhc_tilt_angle?: number;
  iis3dhhc_azimuth_angle?: number;
};

export async function updateSensorLastSeen(ipv6: string, timestamp: string): Promise<void> {
  // Connect to the MongoDB database
  const db = await dbPromise; 
  const collections = await db.listCollections().toArray(); 

  for (const collection of collections) { 
    // Skip collections ending with "_DATA"
    if (collection.name.endsWith("_DATA")) continue;

    // Special case: Check "exp_0_BOOT" collection first
    if (collection.name === "exp_0_BOOT") {
      const sensor = await db.collection(collection.name).findOne({ 'SensorData.LLA': ipv6 });
      if (sensor) {
        await db.collection(collection.name).updateOne(
          { 'SensorData.LLA': ipv6 },
          { $set: { 'SensorData.LastSeen': timestamp } }
        );
      }
    }
    // Search in other collections
    const sensor = await db.collection(collection.name).findOne({ 
      'SensorData.LLA': ipv6,
      "SensorData.isActive": true
    });
    if (sensor) {
      await db.collection(collection.name).updateOne(
        { 'SensorData.LLA': ipv6 },
        { $set: { 'SensorData.LastSeen': timestamp } }
      );
      return; // Exit function after update
    }
  }
  // console.log(`Sensor ${ipv6} not found in any collection.`);
}



// Function to convert a Unix timestamp to local machine time in seconds
function LocalMachineTimeConvert(timestamp: number): string {
  // Convert Unix timestamp to Date object
  const date = new Date(timestamp * 1000); // Multiply by 1000 to convert from seconds to milliseconds

  // Get local date components
  const year = date.getFullYear(); // Retrieves the year in local time
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Retrieves the month in local time (Month is 0-indexed, so +1)
  const day = String(date.getDate()).padStart(2, '0'); // Retrieves the day in local time
  const hours = String(date.getHours()).padStart(2, '0'); // Retrieves the hours in local time
  const minutes = String(date.getMinutes()).padStart(2, '0'); // Retrieves the minutes in local time
  const seconds = String(date.getSeconds()).padStart(2, '0'); // Retrieves the seconds in local time
  // const milliseconds = String(date.getMilliseconds()).padStart(3, '0'); // Optional: Retrieves milliseconds in local time (currently commented out)

  // Construct local ISO string
  const utcIsoString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`; 
  // NOTE: This string construction is incorrectly appending 'Z' which indicates UTC time. 
  // However, the components (year, month, etc.) are based on local time, not UTC.

  return utcIsoString; // Returns the constructed string
}

// Function to insert data into the MongoDB database based on packet data - IDans version
export async function PackageToSendMongo(pkg: PackageObj, timeStamp: number, buffer: number, exp_name: string) {
  const db = await dbPromise;
  const experimentCollection = db.collection(exp_name);

  // Fetch additional experiment data from the other MongoDB collection
  const additionalExperimentData = await experimentCollection.findOne({ 'SensorData.LLA': pkg.ipv6 });

  // Check if the additional data is found and not empty
  if (!additionalExperimentData) {
    throw new Error(`Experiment data not found for experiment ${exp_name}`);
  }
  // check if the location contain the word "faulty" and if so, skip the sensor
  if (additionalExperimentData.SensorData.Location.includes("faulty")) {
    console.log("Skipping upload due to faulty location:", additionalExperimentData.SensorData.Location);
    return;
  }

  // Construct collection name based on exp_name
  const targetCollectionName = `${exp_name}_DATA`;
  const targetCollection = db.collection(targetCollectionName);

  // Update all previous documents with the most updated Labels based on the LLA
  await targetCollection.updateMany(
    { "MetaData.LLA": additionalExperimentData.SensorData.LLA },
    {
      $set: {
        "SensorData.Labels": additionalExperimentData.SensorData.Label,
        "SensorData.LabelOptions": additionalExperimentData.SensorData.LabelOptions
      }
    }
  );

  // Convert the Unix timestamp to local machine time
  const localTimeString = LocalMachineTimeConvert(timeStamp); // Convert to local machine time as ISO string

  // Construct BSON object based on pkg and additionalExperimentData
  const bsonData = {
    UniqueID: `exp_g${additionalExperimentData.ExperimentData.Exp_id}_${additionalExperimentData.ExperimentData.Exp_name}_${additionalExperimentData.SensorData.LLA}_${new Date(timeStamp * 1000).toISOString()}_${pkg.ipv6}`,
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
      Exp_name: `exp_${additionalExperimentData.ExperimentData.Exp_id}_${additionalExperimentData.ExperimentData.Exp_name}`,
    },
    TimeStamp: {
      // $date: new Date(localTimeString * 1000).toISOString() // Convert to milliseconds and then to ISO string
      $date: localTimeString // Convert to milliseconds and then to ISO string

    },
    SensorData: {
  Name: additionalExperimentData.SensorData.Location,
  battery: pkg.battery,
  temperature: pkg.hdc_temp ?? null,
  humidity: pkg.hdc_humidity ?? null,
  light: pkg.light ?? null,
  barometric_pressure: pkg.bmp_press ?? null,
  barometric_temp: pkg.bmp_temp ?? null,
  Coordinates: additionalExperimentData.SensorData.coordinates,
  Labels: additionalExperimentData.SensorData.Label,
  LabelOptions: additionalExperimentData.SensorData.LabelOptions,
  tmp107_amb: pkg.tmp107_amb ?? null,
  tmp107_obj: pkg.tmp107_obj ?? null,
  rssi: pkg.rssi ?? null,

  // Additional fields from the second package type
  bmp_390_u18_pressure: pkg.bmp_390_u18_pressure ?? null,
  bmp_390_u18_temperature: pkg.bmp_390_u18_temperature ?? null,
  bmp_390_u19_pressure: pkg.bmp_390_u19_pressure ?? null,
  bmp_390_u19_temperature: pkg.bmp_390_u19_temperature ?? null,
  hdc_2010_u13_temperature: pkg.hdc_2010_u13_temperature ?? null,
  hdc_2010_u13_humidity: pkg.hdc_2010_u13_humidity ?? null,
  hdc_2010_u16_temperature: pkg.hdc_2010_u16_temperature ?? null,
  hdc_2010_u16_humidity: pkg.hdc_2010_u16_humidity ?? null,
  hdc_2010_u17_temperature: pkg.hdc_2010_u17_temperature ?? null,
  hdc_2010_u17_humidity: pkg.hdc_2010_u17_humidity ?? null,
  opt_3001_u1_light_intensity: pkg.opt_3001_u1_light_intensity ?? null,
  opt_3001_u2_light_intensity: pkg.opt_3001_u2_light_intensity ?? null,
  opt_3001_u3_light_intensity: pkg.opt_3001_u3_light_intensity ?? null,
  opt_3001_u4_light_intensity: pkg.opt_3001_u4_light_intensity ?? null,
  opt_3001_u5_light_intensity: pkg.opt_3001_u5_light_intensity ?? null,
  batmon_temperature: pkg.batmon_temperature ?? null,
  batmon_battery_voltage: pkg.batmon_battery_voltage ?? null,
  // aditional fields from the third package type
  co2_ppm: pkg.co2_ppm ?? null,
  air_velocity: pkg.air_velocity ?? null,
  // ZTP-315 Thermopile IR sensor fields
  ztp_315_surface_temperature: pkg.ztp_315_surface_temperature ?? null,
  ztp_315_ambient_temperature: pkg.ztp_315_ambient_temperature ?? null,
  ztp_315_object_temperature: pkg.ztp_315_object_temperature ?? null,
  ztp_315_voltage_output: pkg.ztp_315_voltage_output ?? null,
  ztp_315_temperature_offset: pkg.ztp_315_temperature_offset ?? null,
  ztp_315_emissivity: pkg.ztp_315_emissivity ?? null,
  ztp_315_calibrated_temperature: pkg.ztp_315_calibrated_temperature ?? null,
  // Fields for IIS3DHHC accelerometer and inclinometer
  iis3dhhc_x_acceleration: pkg.iis3dhhc_x_acceleration ?? null,
  iis3dhhc_y_acceleration: pkg.iis3dhhc_y_acceleration ?? null,
  iis3dhhc_z_acceleration: pkg.iis3dhhc_z_acceleration ?? null,
  iis3dhhc_temperature: pkg.iis3dhhc_temperature ?? null,
  iis3dhhc_roll_angle: pkg.iis3dhhc_roll_angle ?? null,
  iis3dhhc_pitch_angle: pkg.iis3dhhc_pitch_angle ?? null,
  iis3dhhc_yaw_angle: pkg.iis3dhhc_yaw_angle ?? null,
  iis3dhhc_tilt_angle: pkg.iis3dhhc_tilt_angle ?? null,
  iis3dhhc_azimuth_angle: pkg.iis3dhhc_azimuth_angle ?? null,
    }


  };
  // Insert data into the target collection
  await targetCollection.insertOne(bsonData);
  // console.log("The bson which is inserted is:", bsonData);
}


export async function getAll(): Promise<any> {
  const db = await dbPromise;
  const collections = await db.listCollections().toArray();
  const allData = [];

  for (const collection of collections) {
    const data = await db.collection(collection.name).find({}).toArray();
    allData.push(...data);
  }

  return allData;
}

export async function getClientSensors(): Promise<any>{

  const bootSensors = await getBootSensors();
  const activeSensors = await getActiveSensors();
  const clientSensors = [];

  clientSensors.push(...activeSensors);

  // Getting rid of the active sensors in the boot collection
  for (const sensor of bootSensors) {
    const sensorExists = activeSensors.some((activeSensor:any) => activeSensor.SensorData.LLA === sensor.SensorData.LLA);
    if (!sensorExists) {
      clientSensors.push(sensor);
    }
  }

  return clientSensors;
}
export async function updateActiveSensorsInfo(): Promise<void> {
  const db = await dbPromise;
  const collections = await db.listCollections().toArray();

  const activeSensors: any[] = [];
  const latestTimeStamps: { [key: string]: { date: string, time: string } } = {};

  for (const collection of collections) {
      const data = await db.collection(collection.name).find({ 'SensorData.isActive': true }).toArray();
      
      if (data[0]) {
          uploadToInflux.value = true;

          // Loop through each active sensor document
          for (const document of data) {
              const currentLLA = document.SensorData.LLA;

              // Now, search in the corresponding "_DATA" collection for the latest timestamp
              const dataCollectionName = `${collection.name}_DATA`;
              const relatedData = await db.collection(dataCollectionName).find({ 'MetaData.LLA': currentLLA }).sort({ 'TimeStamp': -1 }).limit(1).toArray();

              // Check if we found any related data with a timestamp
              let currentTimestamp: { date: string, time: string } | null = null;
              if (relatedData[0] && relatedData[0].TimeStamp && relatedData[0].TimeStamp.$date) {
                  const dateTimeString = relatedData[0].TimeStamp.$date;
                  const [date, time] = dateTimeString.split('T');
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
                  Alerts: document.Alerts,
                  Location: document.SensorData.Location,
                  latestTimeStamp: latestTimeStamps[currentLLA] || null
              });
          }
      }
  }
  activeSensorsInfo = activeSensors;
  // console.log("getActiveSensorsFromAllCollections() ->", activeSensorsInfo)
}



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

export async function getActiveSensors(): Promise<any> {
  const db = await dbPromise;
  const collections = await db.listCollections().toArray();

  const activeSensors = [];

  for (const collection of collections) {
    const data = await db.collection(collection.name).find({ 'SensorData.isActive': true }).toArray();
    activeSensors.push(...data)
  }
  
  // console.log("getActiveSensors() ->",activeSensors)
  return activeSensors
}

export async function getBootSensors(): Promise<any> {
  const db = await dbPromise;
  const collection = db.collection('exp_0_BOOT');
  const bootSensors = await collection.find({}).toArray();
  
  // console.log("getBootSensors() ->",bootSensors)
  return bootSensors
}

// function that get the LLA and remove the sensor from the exp_0_boot collection
export async function removeSensorFromBoot(LLA: string): Promise<any> {
  const db = await dbPromise;
  const collection = db.collection('exp_0_BOOT');
  const result = await collection.deleteMany({ 'SensorData.LLA': LLA });
  console.log(`${result.deletedCount} sensors deleted!`);
  return result;
}



export async function getExpNameByLLA(LLA: string): Promise<any>{
  const db = await dbPromise;
  const collections = await db.listCollections().toArray();
  const found = false;
  for (const collection of collections) {
    const data = await db.collection(collection.name).find({LLA:LLA})
    console.log(collection.name)
    return collection.name
  }
}

export async function deleteFromBoot(expName:string): Promise<any> {
  const db = await dbPromise;
  const collection = db.collection('exp_0_BOOT');

  try {
    const result = await collection.deleteMany({ 'ExperimentData.Exp_name': expName });
    console.log(`${result.deletedCount} sensors deleted!`);
    return result;
  } catch (err) {
    throw err;
  }
}

export async function getValids(): Promise<any> {
  const db = await dbPromise;
  const collection = db.collection("sensors");
  const docs = await collection.find({ isValid: true }).toArray();
  console.log(docs);
  return docs;
}

export async function isExistsByIpv6(ipv6: string,collectionName:any): Promise<boolean> {

  const db = await dbPromise;
  const collection = db.collection(collectionName);
  const result = await collection.findOne({ "SensorData.LLA": ipv6 });
  return Boolean(result);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}


// function that add to the relevent collection the sensor coordinates
export async function addSensorCoordinates(sensor:any,coordinates:any): Promise<any> {
  const db = await dbPromise; // Connect to mongoDB
  const collections = await db.listCollections().toArray(); // Retrieve all collections
  let collectionName = '';

  // console.log("the sensor is:",sensor.SensorData.LLA, sensor.SensorData.isActive)
// 
 for (const collection of collections) {   // of  is used to iterate over the values in an iterable, like an array
      const SensorInCollection = await db.collection(collection.name
        ).findOne({'SensorData.LLA':sensor.SensorData.LLA,'SensorData.isActive': true});
        // console.log("the sensor is:",sensor.SensorData.LLA)
      if (SensorInCollection) {
        collectionName = collection.name;
        await db.collection(collectionName).updateOne(
          {"SensorData.LLA": sensor.SensorData.LLA},
          { $set: { 'SensorData.coordinates': coordinates } } // Update operation
        );
        // console.log("the collection is:",collectionName)
        return collectionName;
  }
}
    // if sensor not in any collection, add it to the boot collection exp_0_BOOT
    collectionName = 'exp_0_BOOT';
    await db.collection(collectionName).updateOne(
      {"SensorData.LLA": sensor.SensorData.LLA},
      { $set: { 'SensorData.coordinates': coordinates } } // Update operation
    );
    // console.log("the collection is:",collectionName)
    return collectionName;
}


export async function addSensorData(sensor: any, collectionName: any): Promise<any> {
  const db = await dbPromise;
  const collection = db.collection(collectionName);

  try {
    // Define the update fields
    const updateData = {
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

    await collection.createIndex({ "SensorData.LLA": 1 }, { unique: true });


    // Perform the upsert operation
    // the res variable will contain the result of the operation
    // res.upsertedCount will be 1 if a new document was inserted
    // res.modifiedCount will be 1 if an existing document was updated
    const res = await collection.updateOne(
      { "SensorData.LLA": sensor.SensorData.LLA },
      { $set: updateData }, // Update the fields
      { upsert: true } // Insert a new document if no match is found - upsert is true by default
    );

    // Log the result
    if (res.upsertedCount > 0) { // Check if a new document was inserted
      console.log("Sensor inserted!"); // Log the insertion 
    } else if (res.modifiedCount > 0) { // Check if an existing document was modified
      // console.log("Sensor already exists - Updating values..."); // Log the update
    }

    return res;
  } catch (err) {
    console.error("Error in addSensorData: ", err);
    throw err;
  }
}

// function that updates the sensor labelsoptions
export async function updateLabel(dataArray: any[]): Promise<any> {
  const db = await dbPromise;
  const bootCollection = db.collection("exp_0_BOOT");
  const collections = await db.collections();
  // console.log("From LocalMongo dataArray",dataArray)
  
  for (const sensor of dataArray) {
    if (sensor.SensorData.LLA) {
      console.log("The new sensor LabelOptions are ",sensor.SensorData.LabelOptions )
      console.log("The new sensor options are ",sensor.SensorData.Label )

      let updated = false;
      
      for (const collection of collections) {
        // Skip the exp_0_BOOT collection
        if (collection.collectionName === "exp_0_BOOT") continue;
        
        // Find active sensors with the same LLA in the current collection
        const activeSensor = await collection.findOne({"SensorData.LLA": sensor.SensorData.LLA, "SensorData.isActive": true});
        
        if (activeSensor) {
          // Update LabelOptions for active sensors with the same LLA in the current collection
          await collection.updateMany(
            {"SensorData.LLA": sensor.SensorData.LLA, "SensorData.isActive": true},
            {
              $set: {
                "SensorData.Label": sensor.SensorData.Label,
                "SensorData.LabelOptions": sensor.SensorData.LabelOptions,
              }
            }
          );

 
          updated = true;
        }
      }
      
      // If no active sensors were found in any collection, update the exp_0_BOOT collection
      if (!updated) {
        await bootCollection.updateMany(
          {"SensorData.LLA": sensor.SensorData.LLA},
          {
            $set: {
              "SensorData.Label": sensor.SensorData.Label,
              "SensorData.LabelOptions": sensor.SensorData.LabelOptions,
            }
          }
        );
      }
    }
  }
}


export async function createNewCollection(expName: string): Promise<number> {
  const db = await dbPromise;
  const lastId = await findLastCollectionId();
  const expId = lastId+1;
  const collectionName = `exp_${expId}_${expName}`;
  await db.createCollection(collectionName);
  return expId
}

async function findLastCollectionId(): Promise<number> {
  const db = await dbPromise;
  const collections = await db.listCollections().toArray();

  if (collections.length > 0) {
    const sortedCollections = collections.sort((a:any, b:any) => {
      const idA = parseInt(a.name.split('_')[1]);
      const idB = parseInt(b.name.split('_')[1]);
      return idB - idA; // Sort in descending order based on the ID
    });

    const lastCollectionName = sortedCollections[0].name;
    const lastId = parseInt(lastCollectionName.split('_')[1]);
    return lastId; // Get the last collection ID
  } else {
    return 0; // Return 0 if no collections found
  }
}

// removeAllCollections();
export async function removeAllCollections(): Promise<void> {
  const db = await dbPromise;
  const collections = await db.listCollections().toArray();

  for (const collection of collections) {
    await db.collection(collection.name).drop();
    console.log(`Collection '${collection.name}' dropped!`);
  }
}
/**
 * handle get sensor name by the ipv6, where the SensorData.isActive is true
 * @param ipv6
 */
export async function getSensorInfoByIpv6(ipv6:string): Promise<any> {
  const db = await dbPromise;
  const collections = await db.listCollections().toArray();
  let SensorData = {};
  let SensorAlerted ={};
  let SensorExperiment = {};
  for (const collection of collections) {
    const sensor = await db.collection(collection.name).findOne({'SensorData.LLA': ipv6,'SensorData.isActive': true});
    if (sensor) {
      SensorData = sensor.SensorData;
      SensorAlerted = sensor.Alerts;
      SensorExperiment = sensor.ExperimentData;
      //break;
      return {SensorData,SensorAlerted,SensorExperiment};
    }
  }
  return {SensorData: {},SensorAlerted:{},SensorExperiment:{}}; // return empty object if no sensor found
}
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
export async function updateSensorAlertedMail(expName: string, alertedmail: string): Promise<any[]> {
  // console.log(`expName: ${expName}, alertedmail: ${alertedmail}`);
  const db = await dbPromise; // Connect to the MongoDB database
  const collections = await db.listCollections().toArray(); // Retrieve all collections
  let results = [];

  for (const collection of collections) {
      // Check if alertedmail is empty and handle email clearing or updating accordingly
      if (alertedmail === '') {
          // Clear email for all matching documents
          const updateResult = await db.collection(collection.name).updateMany(
              {'ExperimentData.Exp_name': expName, 'SensorData.isActive': true},
              {$set: { "Alerts.Email": '' }}
          );
          // Log and store results of clearing operation
          if (updateResult.modifiedCount > 0) {
              console.log(`Cleared emails for ${updateResult.modifiedCount} sensors in collection ${collection.name}`);
              results.push(updateResult);
          }
      } else {
          // Append new email to existing alerts for all matching documents
          const sensors = await db.collection(collection.name).find(
              {'ExperimentData.Exp_name': expName, 'SensorData.isActive': true}
          ).toArray();
          for (const sensor of sensors) {
              // Check if email already exists in the alerts field
              const emails = sensor.Alerts?.Email?.split(',').map((email:string) => email.trim()) || [];
              if (!emails.includes(alertedmail)){

              let updatedEmail = sensor.Alerts?.Email ? `${sensor.Alerts.Email}, ${alertedmail}` : alertedmail;
              const updateResult = await db.collection(collection.name).updateOne(
                  {_id: sensor._id},
                  {$set: { "Alerts.Email": updatedEmail }}
              );
              // Log and store results of update operation
              if (updateResult.modifiedCount > 0) {
                  console.log(`Updated sensor with ID ${sensor._id} in collection ${collection.name}`);
                  results.push(updateResult);
              }
          }
      }
    }
  }
  return results;
}




/**
 * Handles updating sensor data based on the received list.
 * - Finds the first two sensors with different LLA values in the received list.
 * - Copies all data (excluding the _id field) from the first sensor to the second sensor.
 * - Sets the isValid property of the first sensor's SensorData to false.
 *
 */
export async function MongoSwitchSensorsList(ipv6ofCurrentSensor:string,ipv6ofNewSensor:string,sensorList: any[]): Promise<any> 
{
  console.log('/processing Switch Sensors List');

  const db = await dbPromise; // Connect to mongoDB
  // get first and second sensors as string
  const currentSensor = sensorList.find((sensor:any) => sensor.SensorData.LLA === ipv6ofCurrentSensor);
  const newSensor = sensorList.find((sensor:any) => sensor.SensorData.LLA === ipv6ofNewSensor);
  
  // find the collection where current sensor is active
  const collections = await db.listCollections().toArray();
  let collectionName = '';

  for (const collection of collections) {
    const sensorInCollection = await db.collection(collection.name
      ).findOne({'SensorData.LLA': ipv6ofCurrentSensor,'SensorData.isActive': true});
    if (sensorInCollection) {
      collectionName = collection.name;
      break;
    }
  }
  // check if the current sensor is in the list
  if (!collectionName) {
    throw new Error('Could not find the collection of the current sensor');
  }
  // console.log("the collection is:",collectionName)
  // get the bson by the current sensor lla
  const query_1 = { 'SensorData.LLA': ipv6ofCurrentSensor };
  const documentCurrent = await db.collection(collectionName).findOne(query_1);
  
  const query_2 = { 'SensorData.LLA': ipv6ofNewSensor };
  const documentNew = await db.collection("exp_0_BOOT").findOne(query_2);

  console.log("documentNew LLA",documentNew.SensorData.LLA);
  console.log("documentNew ID",documentNew._id);

  if (documentCurrent) {
    const {_id, ... fieldsToUpdate } = documentCurrent;
    // modify the LLA values in the field to update
    fieldsToUpdate._id = documentNew._id; // copy the _id of the new sensor
    fieldsToUpdate.SensorData.LLA = ipv6ofNewSensor; // copy the LLA of the new sensor
    fieldsToUpdate.SensorData.Location = documentCurrent.SensorData.Location; // copy the location of the current sensor

    const updatedResult = await db.collection(collectionName).insertOne(
      fieldsToUpdate,
    )
    
    // set SensorData IsValid to false for the current sensor in the current collection
    const newLocationName = documentCurrent.SensorData.Location + "-(faulty)"
    const invalidateCurrentSensor = await db.collection(collectionName).updateOne(
      query_1, // find the current sensor
      {
        $set: {
          "SensorData.isValid": false,
          "SensorData.Location": newLocationName
        }
      }
      );
      await getClientSensors();
}
}

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

export async function UpdateByCSV(dataArray: any[]): Promise<any> {
  const db = await dbPromise;
  const collection = db.collection("exp_0_BOOT");

  // Define the batch size
  const batchSize = 10;

  for (let i = 0; i < dataArray.length; i += batchSize) {
    const batch = dataArray.slice(i, i + batchSize); // Get a batch of 10 elements

    const bulkOperations = batch
      .filter(sensor => sensor.LLA) // Ensure LLA is not empty or null
      .map(sensor => {
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

    if (bulkOperations.length > 0) {
      try {
        const result = await collection.bulkWrite(bulkOperations);
        console.log(`Batch ${Math.floor(i / batchSize) + 1} - Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}, Upserted: ${result.upsertedCount}`);
      } catch (error) {
        console.error(`Error in batch ${Math.floor(i / batchSize) + 1}:`, error);
      }
    } else {
      console.log(`Batch ${Math.floor(i / batchSize) + 1} - No valid sensors to update.`);
    }
  }
  console.log("Finished updating sensors.");
}




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
export async function getExperimentsInfo(): Promise<any[]> {
  const db = await dbPromise; // Connect to mongoDB
  const collections = await db.listCollections().toArray(); // Retrieve all collections
  const experimentInfo = new Set(); // Set to store unique experiment info
  const seenExperiments = new Set(); // Track seen experiment names

  for (const collection of collections) {
    // Skip the 'exp_0_BOOT' collection
    if (collection.name === 'exp_0_BOOT') continue;

    const data = await db.collection(collection.name).find({}).toArray();
    const expName = data[0].ExperimentData.Exp_name;

    // Check if the experiment name has already been seen
    if (!seenExperiments.has(expName)) {
      seenExperiments.add(expName); // Add to seen experiments
      experimentInfo.add({
        exp_name: collection.name,
        start_time: data[0].ExperimentData.Start_time,
        end_time: data[0].ExperimentData.End_time,
        // data of all of the lla in the experiment and their location as dictionary {lla:location}
        sensor_info: data.reduce((acc:any, curr:any) => { 
          acc[curr.SensorData.LLA] = curr.SensorData.Location;
          return acc;
        }, {})
      });
    }
  }
  // Convert Set to Array before returning
  return Array.from(experimentInfo);
}