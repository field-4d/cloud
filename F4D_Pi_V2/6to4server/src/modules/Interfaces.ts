// import { Point } from '@influxdata/influxdb-client';
export interface PKG {
  timeReceived: Date;
  lastPackage: PackageObj;
  lastPackageID: number;
  isFirstPackage: boolean;
}

export interface PkgElement {
  [ipv6: string]: PKG;
}


export interface PackageObj {
  ipv6: string;
  packet_number: number;
  light?: number; // Optional, since not all packages may have this field
  battery_t?: number; // Optional
  battery: number;
  bmp_press?: number; // Optional
  bmp_temp?: number; // Optional
  hdc_temp?: number; // Optional
  hdc_humidity?: number; // Optional
  tmp107_amb?: number; // Optional
  tmp107_obj?: number; // Optional
  rssi: any;

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

  // Fields for ZTP-315 Thermopile IR sensor
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
}



