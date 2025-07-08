import { uploadToInflux } from './pkgHandler';
import { updateExpId } from './Functions';
import { addSensorData, createNewCollection , 
  getClientSensors,MongoSwitchSensorsList,
  updateSensorAlertedMail,UpdateByCSV,getExperimentsInfo,
  addSensorCoordinates,removeSensorFromBoot,updateLabel,updateSensorLastSeen} from './LocalMongoHandler';

import {queryFromBlackBox} from './DB'

// dssdssdfdf

export async function handleInfluxPull(recieved: any, ws: any): Promise<void> {
  const expName = recieved.data
  console.log("handleInfluxPull - i'll pull from influx: ",expName);

  // use queryFromBlackBox to get the data from influxaddSensorData
  const data = await queryFromBlackBox(expName);

  const event = {
    type: 'influx_pull_success',
    data: data,
  };
  ws.send(JSON.stringify(event));

}

export async function handleAddExperiment(received: any, ws: any): Promise<void> {
  console.log('addExperiment received from client');
  // Assuming received.data is an array with the second element being the experiment data
  const experimentData = received.data[1];
  // assign the data to variables
  const expName = experimentData.Exp_name;
  const expLocation = experimentData.Exp_location;
  // print the data
  console.log("expName: ",expName);
  console.log("expLocation: ",expLocation);

  // send to LocalMongo
}

export async function handleAddCordinates(received: any, ws: any): Promise<void> {
  const recvied_sensor = received.data[0][0];
  const cordinates_dict = received.data[1];
  let Res = await addSensorCoordinates(recvied_sensor, cordinates_dict); // add the cordinates to the DB

  console.log("Res: ",Res);
  const event = {
    type: 'cordinates_added',
    data: Res,
  };
  ws.send(JSON.stringify(event));
}

// function that handle the async request to remove sensor from the exp_0_BOOT collection
export async function handleRemoveBootSensor(received: any, ws: any): Promise<void> {
    // console.log('removeBootSensor received from client');
    // console.log("received.data: ",received.data); 
    // reciveing all the list info -> sensor LLA is under data[0][0].SensorData.LLA
    const recvied_sensor = received.data[0].SensorData.LLA;
    console.log("recvied_sensor: ",recvied_sensor);
    let res = await removeSensorFromBoot(recvied_sensor); // remove the sensor from the DB

    const event = {
      type: 'sensor_removed_from_boot',
      data: res,
    };
    ws.send(JSON.stringify(event));
}


export async function handleStartNewExperiment(received: any, ws: any): Promise<void> {
    console.log('startNewExperiment received from client');

    const expName = received.data[0].ExperimentData.Exp_name;
    const expId = await createNewCollection(expName);
    const newList = updateExpId(received.data, expId);
    uploadToInflux.value = true; // Update the value property
    for (const sensorData of newList) {
      await addSensorData(sensorData, `exp_${expId}_${expName}`);
    }
    const event = {
      type: 'sensors_list_update',
      data: newList,
    };
    ws.send(JSON.stringify(event));

}

export async function handleEndExperiment(received: any ,ws: any): Promise<void> {
  console.log('End_Experiment received from client');

  const expName = received.data[0].ExperimentData.Exp_name;
  const expId = received.data[0].ExperimentData.Exp_id;

  for (const sensorData of received.data) {
    await addSensorData(sensorData, `exp_${expId}_${expName}`);
  }
  const event = {
    type: 'force_refresh'
  };
  ws.send(JSON.stringify(event));
}

export async function handleSetSensor(received: any): Promise<void> {
    // console.log('/setSensor received from client');
    if (received.data.ExperimentData.Exp_id == '') {
      await addSensorData(received.data, 'exp_0_BOOT');
    } else {
      await addSensorData(
        received.data,
        `exp_${received.data.ExperimentData.Exp_id}_${received.data.ExperimentData.Exp_name}`
      );
    }
}

export async function handleRemoveSensor(received: any): Promise<void> {
  await addSensorData(received.data, 'exp_0_BOOT');
}


// nir adition 16.01.23
// function that handles the getExperimentsInfo request from the client

export async function handleGetExperimentsInfo(received: any,ws:any): Promise<void> {
  const experimentsInfo = await getExperimentsInfo();
  const event = {
    type: 'experiments_info',
    data: experimentsInfo,
  };
  ws.send(JSON.stringify(event));
}

/// nir adition 26.11.2023 //
// data[0],data[1] - the ipv6 of the sensor and the ipv6 of the new sensor
// data[2] - the mongodb dict of sensors list
// function which get the Switch sensors list from  the client, and prints the sensr info
export async function handleSwitchSensorsList(received: any,ws:any): Promise<void> {
  const sensorList = received.data;
  const ipv6ofCurrentSensor = sensorList[0];
  const ipv6ofNewSensor = sensorList[1];
  const sensorsList = sensorList[2];

  await MongoSwitchSensorsList(ipv6ofCurrentSensor,ipv6ofNewSensor,sensorsList);
  
  const event_update = {
    type: 'sensor_repalced'
  }
  ws.send(JSON.stringify(event_update));
}


/// function that get's the Experiment name and the wanted alerted mail and update the DB
// the function get [list,expName,alertedMail]
export async function handleUpdateAlertedMail(received: any,ws:any): Promise<void> {
  const expName = received.data[1];
  let alertedMail = received.data[2];
  // Replace ',\n' '\n' or ',' or ' ' with ', '
  alertedMail = alertedMail.replace(/,?\n|,(?!\s)|\s+/g, ',');
    
  console.log("alertedMail: ",alertedMail);
  await updateSensorAlertedMail(expName,alertedMail);

  const even_update = {
    type: 'alerted_mail_updated'
  }
  ws.send(JSON.stringify(even_update));

}

// function thaty handle the csv file from the client and update the DB
export async function handleUpdateByCSV(received: any,ws:any): Promise<void> {
  const csv = received.data; // the csv file
  UpdateByCSV(csv); // send the csv to the function that update the DB

  const event_update = {
    type: 'Csv_Updated'
  }
  ws.send(JSON.stringify(event_update));
}
// function that handle the sensor label data uodate from the client and update the DB
export async function handleUpdateLabel(received: any,ws:any): Promise<void> {
  const sensorData = received.data; // the sensor data
  await updateLabel(sensorData); // Send the sensor data to the function that updates the DB

  // create an event update object
  const event_update = {
    type: 'label_updated'
  }
  // send the event update object to the client
  ws.send(JSON.stringify(event_update));

}



export function sendLaaToClient(ipv6: string, timestamp:any,ws: any): void {
  // const timestamp = new Date().toISOString();
  // console.log(`sendLaaToClient called for ${ipv6} at ${timestamp}`);
  const event = {
    type: "sp_ipv6",
    data: { ipv6: ipv6, timestamp: timestamp }
  };
  ws.send(JSON.stringify(event));

}

export function sendPingToClient(ipv6:string,ws:any): void {
  const timestamp = new Date().toString();

  const event = {
    type : "sp_ping",
    data : {
      ipv6 : ipv6,
      timestamp : timestamp
    }
  }
  ws.send(JSON.stringify(event))
}

// // function that recive LLA and Time and send it to the client called LastPackageSent
// export function sendLastPackageToClient(LastPackageSent:any,ws:any): void {
//   console.log("The amazing LastPackageSent: ",LastPackageSent);
//   const event = {
//     type : "LastPackageSent",
//     data : LastPackageSent
//   }
//   ws.send(JSON.stringify(event));
// }