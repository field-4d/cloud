import { activeSensorsInfo, updateActiveSensorsInfo,getSensorInfoByIpv6} from './LocalMongoHandler'

const nodemailer = require("nodemailer");
const tempSentMail = new Map();
const lightSentMail = new Map();
const sentBatteryEmailMap = new Map();
const tempAlert : any = new Object();

tempAlert[`sp_mac_address`]={maxTemp:null,emailSent:false,spName:''};

const mailList = ['mosheliongreenhouse@gmail.com','','','',''];

const defaultParm = {
    minBattery: 2750,
  };

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: "mosheliongreenhouse@gmail.com",
      pass: "eojevzaqemkqstic",
    },
  });

  // functino which find active sensors which didn't upload data for more than 30 minutes
  

export function batteryAlerter (obj:any):void {
    const activeSensorEntry = activeSensorsInfo.find(info => info.LLA === obj.ipv6);
    if (!activeSensorEntry){
        return;
    }
    const alerts = activeSensorEntry ? activeSensorEntry.Alerts : null;
    const location = activeSensorEntry ? activeSensorEntry.Location : null;

    const receiverMail = alerts.Email;
    // If user did not enter mail
    if(!receiverMail){
        return;
    }



    if (obj.battery < defaultParm.minBattery){
        if (sentBatteryEmailMap.get(`${obj["ipv6"]}`) == true){
            return
            // console.log(`BATTERY ALERT - SP: '${obj["ipv6"]}' (battery = ${obj["battery"]}) -> EMAIL HAS BEEN SENT ALREADY`);
        }else{  
            console.log(`BATTERY ALERT - SP: '${obj["ipv6"]}' (battery = ${obj["battery"]}) -> Sending EMAIL...`);
            let mailOptions = {
            from: 'mosheliongreenhouse@gmail.com',
            to: receiverMail,
            subject: `BATTERY ALERT - SP: '${obj["ipv6"]}' | sp Location = "${location}"`,
            html: `battery = ${obj["battery"]}`,
         }; 
        transporter.sendMail(mailOptions, function (err:any, info:any) {
            if (err) {
            console.log(JSON.parse(err));
            } else {
            console.log(JSON.parse(info));
            }
        });
        sentBatteryEmailMap.set(`${obj["ipv6"]}`,true);
        }
    } else {
        sentBatteryEmailMap.set(`${obj["ipv6"]}`,false);
    }
}

function getCurrentTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
  
    // Formatting the hours and minutes to have leading zeros if needed
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
  
    // Returning the time as a string in the format "HH:mm"
    return `${formattedHours}:${formattedMinutes}`;
  }
  

function isCurrentTimeInRange(startTime:any, endTime:any) {
    // Check if either startTime & endTime is set to '00:00:00'
    if (startTime === '00:00:00' && endTime === '00:00:00') {
        return false;
    }

    const now = getCurrentTime();

    // Extract hours and minutes from the time strings
    const nowHours = parseInt(now.split(':')[0], 10);
    const nowMinutes = parseInt(now.split(':')[1], 10);

    const startHours = parseInt(startTime.split(':')[0], 10);
    const startMinutes = parseInt(startTime.split(':')[1], 10);

    const endHours = parseInt(endTime.split(':')[0], 10);
    const endMinutes = parseInt(endTime.split(':')[1], 10);

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
export function alerter (obj:any) {
    updateActiveSensorsInfo();
}

// Function to get the current date and time in YYYY-MM-DDTHH:MM format
function getCurrentFormattedTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}
///////////////////////////////////////////////////////////////////
// function to check if the sensor is in the alert range

const sensorSendCounts  = new Map <string, number>();
function updateAlertCount(sensorId: string, alertType: string, shouldSendAlert: boolean) {
    const sensorKey = `${sensorId}-${alertType}`;
    if (shouldSendAlert) {
        const count = sensorSendCounts.get(sensorKey) || 0;
        sensorSendCounts.set(sensorKey, count + 1);
    } else {
        sensorSendCounts.set(sensorKey, 0); // Reset the count if the alert type is not being added
    }
    // console.log("The sensorSendCounts",sensorKey, sensorSendCounts.get(sensorKey));
}



// sensoAlert is a map of the sensor ipv6 address to the alerts for that sensor
const sensorAlerts = new Map<string, { message: string; email: string }>();
export async function alerter_2(obj:any){

    const { SensorData: SensorData, SensorAlerted: SensorAlerted,SensorExperiment:SensorExperiment } = await getSensorInfoByIpv6(obj.ipv6);
    

    // Check if there are any keys in SensorData
    if (Object.keys(SensorData).length !== 0 && SensorData.isValid === true) {
        // do nothing   
        // console.log("LLA: ", obj.ipv6, 
        // ",SensorLocation: ", SensorData.Location, 
        // ",SensorAlerted: ", SensorAlerted.Alerted,
        // ",SensorExperiment: ", SensorExperiment.Exp_name);
    } else {
        console.log(obj.ipv6," - No sensor data found for LLA or sensor is Invalid");
        return;
    }

    let alertMessage = '';
    let sendAlert = false;


    // check if the sensor is set for alert or the alert message is not empty
    if (SensorAlerted.Alerted == true && SensorData.isValid === true) {
    // if (SensorAlerted.Alerted == true && SensorData.isValid === true) {
    // if (alerts && alerts.Alerted) {
        const receiverMail = SensorAlerted.Email;
        if (!receiverMail) return;
        // set the default values for the 
        // sendAlert = false;

        const currentTime = getCurrentFormattedTime();

        const shouldsSendTempAlert = false;
        const shouldsSendLightAlert = false;

        // Temperature Alerts - check if the temperature is outside the range
        const { Max_Temp: maxTemp, Min_Temp: minTemp, Start_Time: tempStartTime, End_Time: tempEndTime } = SensorAlerted.Temperature;
        const isTempTimeInRange = isCurrentTimeInRange(tempStartTime, tempEndTime);
        if ((obj.hdc_temp > maxTemp || obj.hdc_temp < minTemp) && isTempTimeInRange) { // && isTempTimeInRange
            //alertMessage += `${obj.ipv6}-Temperature Alert: Current - ${obj.bmp_temp}, Max - ${maxTemp}, Min - ${minTemp}\n`;
            alertMessage += `${currentTime},${SensorExperiment.Exp_name},${SensorData.Location},${obj.ipv6},Temperature,${obj.hdc_temp},${minTemp}-${maxTemp}\n`;
            // alertMessage += `${currentTime},${SensorExperiment.Exp_name},${SensorData.Location},${obj.ipv6},${obj.hdc_temp},${maxTemp},${minTemp}\n`;
            sendAlert = true;
            updateAlertCount(obj.ipv6, 'Temperature', true); // Update the alert count for this sensor
        }
        else{
            updateAlertCount(obj.ipv6, 'Temperature', false); // Reset the alert count for this sensor
        }

        // battery Alert check (moved outside the other alerts check )
        if (obj.battery <  defaultParm.minBattery) { // the default value is 2750 and setup in the top of the file
            const currentTime = getCurrentFormattedTime();
            alertMessage += `${currentTime},${SensorExperiment.Exp_name},${SensorData.Location},${obj.ipv6},Battery,${obj.battery},${ defaultParm.minBattery}\n`;
            sendAlert = true;
        updateAlertCount(obj.ipv6, 'Battery', true); // Update the alert count for this sensor
        }
        else {
        updateAlertCount(obj.ipv6, 'Battery', false); // Reset the alert count for this sensor
        }

        // Light Alert Check
        const { Max_Light: maxLight, Min_Light: minLight, Start_Time: lightStartTime, End_Time: lightEndTime } = SensorAlerted.Light;
        const isLightTimeInRange = isCurrentTimeInRange(lightStartTime, lightEndTime);
        if ((obj.light > maxLight || obj.light < minLight) &&isLightTimeInRange) { // && isLightTimeInRange
            //alertMessage += `${obj.ipv6}-Light Alert: Current - ${obj.light}, Max - ${maxLight}, Min - ${minLight}\n`;
            alertMessage += `${currentTime},${SensorExperiment.Exp_name},${SensorData.Location},${obj.ipv6},Light,${obj.light},${minLight}-${maxLight}\n`;

            sendAlert = true;
            updateAlertCount(obj.ipv6, 'Light', true); // Update the alert count for this sensor
        }
        else {
            updateAlertCount(obj.ipv6, 'Light', false); // Reset the alert count for this sensor
        }
        


        const experimentKey = SensorExperiment.Exp_name; // or any other unique experiment identifier
        
        if (sendAlert) {
            const existingEntry = sensorAlerts.get(experimentKey) || { message: '', email: receiverMail };
            //existingEntry.message += `${currentTime},${SensorExperiment.Exp_name},${SensorData.Location},${obj.ipv6},${alertMessage}\n`;
            existingEntry.message += `${alertMessage}\n`;
            sensorAlerts.set(experimentKey, existingEntry);
            // console.log("Added Alerts for Experiment:", experimentKey);
            console.log("The combined alert message is:\n", alertMessage);
        }
    }
    
}
// nir- add aggregation of alerts and send them all at once
// the code intergrates the alerts from the same experiment and sends them all at once
// furthermore, it filter the messege on their count, and send only the last message within the last 3 minutes
export function sendAccumulatedAlerts() {
    const currentTime = new Date();
    const currentMinute = currentTime.getMinutes(); 
    const intervalStartMinute  = currentMinute - (currentMinute % 3); // Get the start minute of the current interval
    const intervalStartTime = new Date(currentTime); // Copy the current time
    intervalStartTime.setMinutes(intervalStartMinute,0,0) // Set the minutes, seconds and milliseconds to 0

    sensorAlerts.forEach(({ message, email }, experimentKey) => {
        if (message) {
            let latestMessagesMap  = new Map();

        // process each line to keep onlythe latest messege per sensor type within the interval
        message.split('\n').forEach(line => {
            const part = line.split(',');
            const TimeStamp = new Date(part[0]);
            if (TimeStamp>=intervalStartTime){
                const sensorId = part[3];
                const alertType = part[4];
                const sensorKey = `${sensorId}-${alertType}`;
                latestMessagesMap .set(sensorKey, line);
            }
        });
        // Filter the latest messages based on the alert count limit
        let filteredMessage = Array.from(latestMessagesMap.values()).filter(line => {
                const parts = line.split(',');
                const sensorId = parts[3];
                const alertType = parts[4];
                const sensorKey = `${sensorId}-${alertType}`;
                const count = sensorSendCounts.get(sensorKey) || 0;
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
            const headers = "Current Time,Experiment Name,Location,IPv6 Address,Type,Value,Range"
                .split(',')
                .map(header => `<th>${header.trim()}</th>`)
                .join('');
        
            const rows = filteredMessage.split('\n').map(line =>
                `<tr>${line.split(',').map(cell => `<td>${cell.trim()}</td>`).join('')}</tr>`
            ).join('');

            // Build the complete HTML table
            const htmlTable = `<table border="1"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;

            console.log("Sending EMAIL to", email, "with alerts for experiment", experimentKey);
            let mailOptions = {
                from: 'mosheliongreenhouse@gmail.com',
                to: email,
                subject: `ALERT for Experiment ${experimentKey} - Consolidated Report`,
                html: htmlTable,
            };
            transporter.sendMail(mailOptions, function (err:any, info:any) {
                if (err) console.log(err);
                else console.log(info);
            });
            // Clear the alerts for this experiment after sending the email
            sensorAlerts.set(experimentKey, { message: '', email });
        }
    }
    });
}



export async function DeadManAlerts() {
    // Update the active sensors info before processing alerts
    await updateActiveSensorsInfo();

    const currentTime = new Date();
    const currentTimeStamp = currentTime.getTime();
    //set variable for the time limit for r30
    let DeltaMinutes = 30;
    const timeLimit = DeltaMinutes * 60 * 1000; // 1 minute in milliseconds for testing purposes

    const alertsByExperiment: { [experiment: string]: { email: string[], csv: string } } = {};

    activeSensorsInfo.forEach((sensor: any) => {
        // skip sensors with "(faulty)" in their name
        if (sensor.Location.includes("(faulty)")) {
            return;
        }
        
        if (sensor.latestTimeStamp) {
            const sensorTimeString = `${sensor.latestTimeStamp.date}T${sensor.latestTimeStamp.time}`;
            const sensorTime = new Date(sensorTimeString).getTime();
            const timeDifference = currentTimeStamp - sensorTime;

            if (timeDifference > timeLimit) {
                const deltaTimestampMinutes = Math.round(timeDifference / (60 * 1000)); // Convert to minutes
                const csvLine = `${sensor.collectionName},${sensor.LLA},${sensor.Location},${sensorTimeString},${deltaTimestampMinutes}\n`;

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
}

function sendEmailAlerts(alertsByExperiment: { [experiment: string]: { email: string[], csv: string } }) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: "mosheliongreenhouse@gmail.com",
            pass: "eojevzaqemkqstic",
        },
    });

    Object.keys(alertsByExperiment).forEach(experimentKey => {
        const experimentData = alertsByExperiment[experimentKey];
        const emails = experimentData.email.join(',');

        // Build the headers (this is static as you defined earlier)
        const headers = `<th>Experiment</th><th>LLA</th><th>Sensor</th><th>Last Timestamp</th><th>(Min) Last seen before (minutes)</th>`;

        // Build the rows
        let rows = '';
        experimentData.csv.split('\n').slice(1).forEach(line => {
            if (line) {
                const columns = line.split(',');
                rows += `<tr>${columns.map(col => `<td>${col}</td>`).join('')}</tr>`;
            }
        });

        // Build the complete HTML table
        const htmlTable = `<table border="1"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;

        console.log("Sending EMAIL to", emails, "with alerts for experiment", experimentKey);
        
        let mailOptions = {
            from: 'mosheliongreenhouse@gmail.com',
            to: emails,
            subject: `Inactive Sensor Daily Report ${experimentKey}`,
            html: htmlTable,
        };

        transporter.sendMail(mailOptions, function (err: any, info: any) {
            if (err) console.log(err);
            else console.log(info);
        });

        // Clear the alertsByExperiment after sending the email
        delete alertsByExperiment[experimentKey]; // Remove the entry from the alertsByExperiment object
    });
}