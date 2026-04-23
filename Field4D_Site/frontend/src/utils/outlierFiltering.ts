export type OutlierMethod = 'IQR' | 'ZSCORE';

export interface OutlierConfig {
  enabled: boolean;
  method: OutlierMethod;
  threshold: number;
}

export type VisualizationType = 'scatter' | 'box' | 'histogram';

const SUPPORTED_METHODS_BY_VIZ: Record<VisualizationType, OutlierMethod[]> = {
  scatter: ['IQR', 'ZSCORE'],
  box: ['IQR'],
  histogram: ['IQR', 'ZSCORE'],
};

const DEFAULT_METHOD_BY_VIZ: Record<VisualizationType, OutlierMethod> = {
  scatter: 'IQR',
  box: 'IQR',
  histogram: 'IQR',
};

export function getSupportedOutlierMethods(viz: VisualizationType): OutlierMethod[] {
  return SUPPORTED_METHODS_BY_VIZ[viz];
}

export function getDefaultOutlierMethod(viz: VisualizationType): OutlierMethod {
  return DEFAULT_METHOD_BY_VIZ[viz];
}

export function getCompatibleOutlierMethod(
  viz: VisualizationType,
  method: OutlierMethod
): OutlierMethod {
  const supported = getSupportedOutlierMethods(viz);
  return supported.includes(method) ? method : getDefaultOutlierMethod(viz);
}

type WithValue = {
  parameter: string;
  timestamp: string;
  value: number | null | undefined;
  [key: string]: any;
};

type GroupedRows<T extends WithValue> = Record<string, Record<string, T[]>>;

function getNumeric(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  if (Number.isNaN(v)) return null;
  return v;
}

function groupByParameterAndDate<T extends WithValue>(rows: T[]): GroupedRows<T> {
  const grouped: GroupedRows<T> = {};
  for (const row of rows) {
    const parameter = String(row.parameter ?? '');
    const date =
      typeof row.timestamp === 'string' && row.timestamp.includes('T')
        ? row.timestamp.split('T')[0]
        : String(row.timestamp ?? '');
    if (!grouped[parameter]) grouped[parameter] = {};
    if (!grouped[parameter][date]) grouped[parameter][date] = [];
    grouped[parameter][date].push(row);
  }
  return grouped;
}

export function applyOutlierFiltering<T extends WithValue>(
  rows: T[],
  config: OutlierConfig
): T[] {
  if (!config.enabled) return rows;

  const grouped = groupByParameterAndDate(rows);

  Object.keys(grouped).forEach((parameter) => {
    Object.keys(grouped[parameter]).forEach((date) => {
      const bucket = grouped[parameter][date];
      const values = bucket
        .map((r) => getNumeric(r.value))
        .filter((v): v is number => v !== null);

      if (values.length < 4) return;

      if (config.method === 'IQR') {
        const sorted = [...values].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lower = q1 - config.threshold * iqr;
        const upper = q3 + config.threshold * iqr;

        for (const row of bucket) {
          const val = getNumeric(row.value);
          if (val !== null && (val < lower || val > upper)) {
            row.value = Number.NaN;
          }
        }
        return;
      }

      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      if (std === 0) return;

      for (const row of bucket) {
        const val = getNumeric(row.value);
        if (val === null) continue;
        const zScore = Math.abs((val - mean) / std);
        if (zScore > config.threshold) {
          row.value = Number.NaN;
        }
      }
    });
  });

  return rows;
}
