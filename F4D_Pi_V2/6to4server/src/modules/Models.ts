/* eslint-disable @typescript-eslint/camelcase */
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { PackageObj } from './Interfaces';
import { getExpNameByLLA } from './LocalMongoHandler'
import dotenv from 'dotenv';

// Load the environment variables from a custom .env file
dotenv.config({ path: '/home/pi/6to4/.env' });

// Get the InfluxDB credentials from the environment variables
const influxDBCredentials = {
  token: process.env.LOCAL_TOKEN,
  org: process.env.LOCAL_ORG,
  bucket: process.env.BUCKET_NAME,
  url: process.env.LOCAL_URL,
}

export const Conf = {
  /*InfluxDB credentials */
  BlackBox: {
    token: influxDBCredentials.token || '',
    org: influxDBCredentials.org || '',
    bucket: influxDBCredentials.bucket || '',
    url: influxDBCredentials.url || '',
  },
  hujiCloud: {
    token:'',
    org: '',
    bucket: '',
    url: '',
  },
  Device_Owner: {
    Owner : process.env.Device_Owner,
   }
};


export const BlackBox = new InfluxDB({
  url: Conf.BlackBox.url,
  token: Conf.BlackBox.token,
});



// export const Cloud = new InfluxDB({
//   url: Conf.hujiCloud.url,
//   token: Conf.hujiCloud.token,
// });
export const PackageToSend = (
  pkg: PackageObj,
  timeStamp: number,
  bufferNumber: number,
  exp_name: string
) => {
  const readyPoint = new Point(pkg.ipv6)
    .tag('Exp_Name', exp_name)
    .floatField('buffer_number', bufferNumber)
    .timestamp(timeStamp);

  if (pkg.battery !== undefined) {
    readyPoint.floatField('battery', pkg.battery);
  }

  if (pkg.rssi !== undefined) {
    readyPoint.intField('rssi', pkg.rssi);
  }

  // Handle standard package fields
  if (pkg.light !== undefined) {
    readyPoint.floatField('light', pkg.light);
  }

  // Handle multiple sensor package fields
  if (pkg.bmp_390_u18_pressure !== undefined) {
    readyPoint
      .floatField('bmp_390_u18_pressure', pkg.bmp_390_u18_pressure || 0)
      .floatField('bmp_390_u18_temperature', pkg.bmp_390_u18_temperature || 0)
      .floatField('bmp_390_u19_pressure', pkg.bmp_390_u19_pressure || 0)
      .floatField('bmp_390_u19_temperature', pkg.bmp_390_u19_temperature || 0);
  }

  // Handle CO2 and Air Velocity fields
  if (pkg.co2_ppm !== undefined && pkg.air_velocity !== undefined) {
    readyPoint
      .floatField('co2_ppm', pkg.co2_ppm)
      .floatField('air_velocity', pkg.air_velocity);
  }

  // Handle ZTP-315 Thermopile IR sensor fields
  if (pkg.ztp_315_object_temperature !== undefined) {
    readyPoint
      .floatField('ztp_315_surface_temperature', pkg.ztp_315_surface_temperature || 0)
      .floatField('ztp_315_ambient_temperature', pkg.ztp_315_ambient_temperature || 0)
      .floatField('ztp_315_object_temperature', pkg.ztp_315_object_temperature || 0)
      .floatField('ztp_315_voltage_output', pkg.ztp_315_voltage_output || 0)
      .floatField('ztp_315_temperature_offset', pkg.ztp_315_temperature_offset || 0)
      .floatField('ztp_315_emissivity', pkg.ztp_315_emissivity || 0)
      .floatField('ztp_315_calibrated_temperature', pkg.ztp_315_calibrated_temperature || 0);
  }
  // Handle IIS3DHHC accelerometer and inclinometer fields
  if (pkg.iis3dhhc_x_acceleration !== undefined) {
    readyPoint
      .floatField('iis3dhhc_x_acceleration', pkg.iis3dhhc_x_acceleration || 0)
      .floatField('iis3dhhc_y_acceleration', pkg.iis3dhhc_y_acceleration || 0)
      .floatField('iis3dhhc_z_acceleration', pkg.iis3dhhc_z_acceleration || 0)
      .floatField('iis3dhhc_temperature', pkg.iis3dhhc_temperature || 0)
      .floatField('iis3dhhc_roll_angle', pkg.iis3dhhc_roll_angle || 0)
      .floatField('iis3dhhc_pitch_angle', pkg.iis3dhhc_pitch_angle || 0)
      .floatField('iis3dhhc_yaw_angle', pkg.iis3dhhc_yaw_angle || 0)
      .floatField('iis3dhhc_tilt_angle', pkg.iis3dhhc_tilt_angle || 0)
      .floatField('iis3dhhc_azimuth_angle', pkg.iis3dhhc_azimuth_angle || 0);
  }

  return { Ready: readyPoint };
};


export const Package = (obj: any) => {
  let packageData: PackageObj;

  // Handle the standard package with light sensor
  if (obj.light !== undefined) {
    // console.log("Processing standard texas package");
    packageData = {
      ipv6: obj.ipv6,
      packet_number: obj.packet_number,
      light: obj.light,
      battery_t: obj.battery_t,
      battery: obj.battery,
      bmp_press: obj.bmp_press,
      bmp_temp: obj.bmp_temp,
      hdc_temp: obj.hdc_temp,
      hdc_humidity: obj.hdc_humidity,
      tmp107_amb: obj.tmp107_amb,
      tmp107_obj: obj.tmp107_obj,
      rssi: obj.rssi,
    };
  } 
  // Handle the package with multiple sensors (BMP390, HDC, OPT)
  else if (obj.bmp_390_u18_pressure !== undefined) {
    // console.log("Processing multiple sensor advanced package");
    packageData = {
      ipv6: obj.ipv6,
      packet_number: obj.packet_number,
      battery: obj.batmon_battery_voltage,
      rssi: obj.rssi,
      bmp_390_u18_pressure: obj.bmp_390_u18_pressure,
      bmp_390_u18_temperature: obj.bmp_390_u18_temperature,
      bmp_390_u19_pressure: obj.bmp_390_u19_pressure,
      bmp_390_u19_temperature: obj.bmp_390_u19_temperature,
      hdc_2010_u13_temperature: obj.hdc_2010_u13_temperature,
      hdc_2010_u13_humidity: obj.hdc_2010_u13_humidity,
      hdc_2010_u16_temperature: obj.hdc_2010_u16_temperature,
      hdc_2010_u16_humidity: obj.hdc_2010_u16_humidity,
      hdc_2010_u17_temperature: obj.hdc_2010_u17_temperature,
      hdc_2010_u17_humidity: obj.hdc_2010_u17_humidity,
      opt_3001_u1_light_intensity: obj.opt_3001_u1_light_intensity,
      opt_3001_u2_light_intensity: obj.opt_3001_u2_light_intensity,
      opt_3001_u3_light_intensity: obj.opt_3001_u3_light_intensity,
      opt_3001_u4_light_intensity: obj.opt_3001_u4_light_intensity,
      opt_3001_u5_light_intensity: obj.opt_3001_u5_light_intensity,
      batmon_temperature: obj.batmon_temperature,
      batmon_battery_voltage: obj.batmon_battery_voltage,
      ztp_315_surface_temperature: obj.ztp_315_surface_temperature,
      ztp_315_ambient_temperature: obj.ztp_315_ambient_temperature,
      ztp_315_object_temperature: obj.ztp_315_object_temperature,
      ztp_315_voltage_output: obj.ztp_315_voltage_output,
      ztp_315_temperature_offset: obj.ztp_315_temperature_offset,
      ztp_315_emissivity: obj.ztp_315_emissivity,
      ztp_315_calibrated_temperature: obj.ztp_315_calibrated_temperature,
    };
  } 
  // Handle CO2 and Air Velocity package type
  else if (obj.co2_ppm !== undefined && obj.air_velocity !== undefined) {
    // console.log("Processing CO2 and Air Velocity package");
    packageData = {
      ipv6: obj.ipv6,
      packet_number: obj.packet_number,
      co2_ppm: obj.co2_ppm,
      air_velocity: obj.air_velocity,
      battery: obj.battery,
      rssi: obj.rssi,
    };
  } 
  // Handle ZTP-315 Thermopile IR sensor package type
  // else if (obj.ztp_315_object_temperature !== undefined) {
  //   console.log("Processing ZTP-315 Thermopile IR sensor package");
  //   packageData = {
  //     ipv6: obj.ipv6,
  //     packet_number: obj.packet_number,
  //     battery: obj.battery,
  //     rssi: obj.rssi,
  //     ztp_315_surface_temperature: obj.ztp_315_surface_temperature,
  //     ztp_315_ambient_temperature: obj.ztp_315_ambient_temperature,
  //     ztp_315_object_temperature: obj.ztp_315_object_temperature,
  //     ztp_315_voltage_output: obj.ztp_315_voltage_output,
  //     ztp_315_temperature_offset: obj.ztp_315_temperature_offset,
  //     ztp_315_emissivity: obj.ztp_315_emissivity,
  //     ztp_315_calibrated_temperature: obj.ztp_315_calibrated_temperature,
  //   };
  // } 
  // Unknown package structure
  else {
    throw new Error("Unknown package structure");
  }

  return {
    DB: packageData,
    ADDR: String(obj.ipv6),
    NUM: parseFloat(obj.packet_number || obj.package_number || 0),
    TIME: new Date(),
  };
};



export const writeOptions = {
  /* the maximum points/line to send in a single batch to InfluxDB server */
  batchSize: 1001,
  /* default tags to add to every point */
  defaultTags: { GW: 'RPI4' },

  /* maximum size of the retry buffer - it contains items that could not be sent for the first time */
  maxBufferLines: 2958500,
  /* the count of retries, the delays between retries follow an exponential backoff strategy if there is no Retry-After HTTP header */
  maxRetries: 20,
  /* maximum delay between retries in milliseconds */
  maxRetryDelay: 3600000,
  /* minimum delay between retries in milliseconds */
  minRetryDelay: 60000, // minimum delay between retries
  /* a random value of up to retryJitter is added when scheduling next retry */
  retryJitter: 10000,
  // ... or you can customize what to do on write failures when using a writeFailed fn, see the API docs for details
  writeFailed: function(error: any, lines: any, failedAttempts: any) {
    console.error(error);

    // if (failedAttempts > 5) {
    //   try {
    //     let array = fs.readFileSync('data.txt').toString().split("\n");
    //     const reWriteApi = client.getWriteApi(org, bucket, 's', writeOptions)
    //     reWriteApi.writeRecords(array);
    //   } catch (e) {
    //     console.error(e)
    //     // console.log('\nFinished ERROR')
    //   }
    // }
  },
  writeSuccess: (lines: any) => {
    console.log(lines);
  },
};