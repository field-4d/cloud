export type ParameterMetadata = {
  value: string;
  label: string;
  displayLabel: string;
  unit: string;
  category: string;
  sensorFamily?: string;
  channel?: string;
};

const BASE_PARAMETER_METADATA: Omit<ParameterMetadata, 'displayLabel'>[] = [
  {
    value: 'ztp_315_object_temperature',
    label: 'ZTP315 Object Temperature',
    unit: '°C',
    category: 'ZTP315 Temperature Sensors',
    sensorFamily: 'ZTP315',
  },
  {
    value: 'ztp_315_ambient_temperature',
    label: 'ZTP315 Ambient Temperature',
    unit: '°C',
    category: 'ZTP315 Temperature Sensors',
    sensorFamily: 'ZTP315',
  },
  {
    value: 'package_number',
    label: 'Package Number',
    unit: 'n',
    category: 'Basic Environmental',
  },
  {
    value: 'opt_3001_u5_light_intensity',
    label: 'OPT3001 U5 Light Intensity',
    unit: 'lux',
    category: 'OPT3001 Light Sensors',
    sensorFamily: 'OPT3001',
    channel: 'U5',
  },
  {
    value: 'opt_3001_u4_light_intensity',
    label: 'OPT3001 U4 Light Intensity',
    unit: 'lux',
    category: 'OPT3001 Light Sensors',
    sensorFamily: 'OPT3001',
    channel: 'U4',
  },
  {
    value: 'opt_3001_u3_light_intensity',
    label: 'OPT3001 U3 Light Intensity',
    unit: 'lux',
    category: 'OPT3001 Light Sensors',
    sensorFamily: 'OPT3001',
    channel: 'U3',
  },
  {
    value: 'opt_3001_u2_light_intensity',
    label: 'OPT3001 U2 Light Intensity',
    unit: 'lux',
    category: 'OPT3001 Light Sensors',
    sensorFamily: 'OPT3001',
    channel: 'U2',
  },
  {
    value: 'opt_3001_u1_light_intensity',
    label: 'OPT3001 U1 Light Intensity',
    unit: 'lux',
    category: 'OPT3001 Light Sensors',
    sensorFamily: 'OPT3001',
    channel: 'U1',
  },
  {
    value: 'light',
    label: 'Light Intensity',
    unit: 'lux',
    category: 'Basic Environmental',
  },
  {
    value: 'hdc_temp',
    label: 'Temperature',
    unit: '°C',
    category: 'Basic Environmental',
  },
  {
    value: 'hdc_humidity',
    label: 'Relative Humidity',
    unit: '%',
    category: 'Basic Environmental',
  },
  {
    value: 'hdc_2010_u17_temperature',
    label: 'HDC2010 U17 Temperature',
    unit: '°C',
    category: 'HDC2010 Sensors',
    sensorFamily: 'HDC2010',
    channel: 'U17',
  },
  {
    value: 'hdc_2010_u17_humidity',
    label: 'HDC2010 U17 Relative Humidity',
    unit: '%',
    category: 'HDC2010 Sensors',
    sensorFamily: 'HDC2010',
    channel: 'U17',
  },
  {
    value: 'hdc_2010_u16_temperature',
    label: 'HDC2010 U16 Temperature',
    unit: '°C',
    category: 'HDC2010 Sensors',
    sensorFamily: 'HDC2010',
    channel: 'U16',
  },
  {
    value: 'hdc_2010_u16_humidity',
    label: 'HDC2010 U16 Relative Humidity',
    unit: '%',
    category: 'HDC2010 Sensors',
    sensorFamily: 'HDC2010',
    channel: 'U16',
  },
  {
    value: 'hdc_2010_u13_temperature',
    label: 'HDC2010 U13 Temperature',
    unit: '°C',
    category: 'HDC2010 Sensors',
    sensorFamily: 'HDC2010',
    channel: 'U13',
  },
  {
    value: 'hdc_2010_u13_humidity',
    label: 'HDC2010 U13 Relative Humidity',
    unit: '%',
    category: 'HDC2010 Sensors',
    sensorFamily: 'HDC2010',
    channel: 'U13',
  },
  {
    value: 'co2_ppm',
    label: 'CO2 Concentration',
    unit: 'ppm',
    category: 'Advanced Environmental',
  },
  {
    value: 'bmp_temp',
    label: 'BMP Temperature',
    unit: '°C',
    category: 'Basic Environmental',
  },
  {
    value: 'bmp_press',
    label: 'BMP Barometric Pressure',
    unit: 'hPa',
    category: 'Basic Environmental',
  },
  {
    value: 'bmp_390_u19_temperature',
    label: 'BMP390 U19 Temperature',
    unit: '°C',
    category: 'BMP390 Sensors',
    sensorFamily: 'BMP390',
    channel: 'U19',
  },
  {
    value: 'bmp_390_u19_pressure',
    label: 'BMP390 U19 Pressure',
    unit: 'hPa',
    category: 'BMP390 Sensors',
    sensorFamily: 'BMP390',
    channel: 'U19',
  },
  {
    value: 'bmp_390_u18_temperature',
    label: 'BMP390 U18 Temperature',
    unit: '°C',
    category: 'BMP390 Sensors',
    sensorFamily: 'BMP390',
    channel: 'U18',
  },
  {
    value: 'bmp_390_u18_pressure',
    label: 'BMP390 U18 Pressure',
    unit: 'hPa',
    category: 'BMP390 Sensors',
    sensorFamily: 'BMP390',
    channel: 'U18',
  },
  {
    value: 'battery_t',
    label: 'Battery Temperature',
    unit: '°C',
    category: 'Basic Environmental',
  },
  {
    value: 'battery',
    label: 'Battery Level',
    unit: 'mV',
    category: 'Basic Environmental',
  },
  {
    value: 'batmon_battery_voltage',
    label: 'Battery Voltage',
    unit: 'mV',
    category: 'Advanced Environmental',
  },
  {
    value: 'air_velocity',
    label: 'Air Velocity',
    unit: 'm/s',
    category: 'Advanced Environmental',
  },
  {
    value: 'advanced_package_number',
    label: 'Advanced Package Number',
    unit: 'n',
    category: 'Advanced Environmental',
  },
];

export const PARAMETER_METADATA: ParameterMetadata[] = BASE_PARAMETER_METADATA.map((param) => ({
  ...param,
  displayLabel: param.unit ? `${param.label} (${param.unit})` : param.label,
}));

export const getParameterMeta = (value: string) =>
  PARAMETER_METADATA.find((p) => p.value === value);

export const getParameterUnit = (value: string) =>
  getParameterMeta(value)?.unit || '';

export const getParameterLabel = (value: string) =>
  getParameterMeta(value)?.label || value.replaceAll('_', ' ');

export const getParameterDisplayLabel = (value: string) => {
  const meta = getParameterMeta(value);
  if (!meta) return value.replaceAll('_', ' ');
  return meta.unit ? `${meta.label} (${meta.unit})` : meta.label;
};

const BASIC_ENV_ORDER: Record<string, number> = {
  hdc_temp: 1,
  hdc_humidity: 2,

  light: 3,

  battery: 4,
  battery_t: 5,

  bmp_temp: 6,
  bmp_press: 7,

  package_number: 8,
};

const CATEGORY_ORDER: Record<string, number> = {
  'Basic Environmental': 1,
  'OPT3001 Light Sensors': 2,
  'HDC2010 Sensors': 3,
};

export const PARAMETER_OPTIONS = Object.values(
  PARAMETER_METADATA.reduce<
    Record<string, { label: string; options: { value: string; label: string }[] }>
  >((acc, param) => {
    if (!acc[param.category]) {
      acc[param.category] = {
        label: param.category,
        options: [],
      };
    }

    acc[param.category].options.push({
      value: param.value,
      label: param.displayLabel,
    });

    return acc;
  }, {})
)
  .map((group) => {
    if (group.label !== 'Basic Environmental') {
      return {
        ...group,
        options: group.options.slice().sort((left, right) => left.label.localeCompare(right.label)),
      };
    }

    return {
      ...group,
      options: group.options.slice().sort((left, right) => {
        const leftPriority = BASIC_ENV_ORDER[left.value] ?? 999;
        const rightPriority = BASIC_ENV_ORDER[right.value] ?? 999;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return left.label.localeCompare(right.label);
      }),
    };
  })
  .sort((left, right) => {
    const leftPriority = CATEGORY_ORDER[left.label] ?? 999;
    const rightPriority = CATEGORY_ORDER[right.label] ?? 999;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.label.localeCompare(right.label);
  });

export const getYAxisTitle = (parameterValues: string[]): string => {
  if (parameterValues.length === 0) return 'Value';
  if (parameterValues.length === 1) return getParameterDisplayLabel(parameterValues[0]);
  const units = Array.from(
    new Set(parameterValues.map((value) => getParameterUnit(value)).filter(Boolean))
  );
  if (units.length === 1) return `Value (${units[0]})`;
  return 'Value';
};
