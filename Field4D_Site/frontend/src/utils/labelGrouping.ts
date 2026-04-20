/**
 * Long-format row helpers: prefer experiment-summary sensorLabelMap (latest Label per LLA);
 * fall back to row.label from fetch-data (same assignment from BQ).
 */

export interface RowWithSensorLabel {
  sensor: string;
  label?: string | null;
  parameter: string;
  value?: number | null;
  timestamp?: string;
  [key: string]: unknown;
}

/** Trimmed non-empty Label column from BigQuery row, or null. */
export function labelFromRow(d: RowWithSensorLabel): string | null {
  if (d.label == null) return null;
  const t = String(d.label).trim();
  return t === '' ? null : t;
}

/**
 * Effective label for grouping: latest assignment from sensorLabelMap when unambiguous,
 * else row label (BQ-assigned), else first map entry if multiple.
 */
export function getEffectiveLabel(
  d: RowWithSensorLabel,
  sensorLabelMap: Record<string, string[]>
): string | null {
  const sid = String(d.sensor);
  const fromMap = sensorLabelMap[sid];
  if (fromMap?.length === 1) return fromMap[0];
  const fromRow = labelFromRow(d);
  if (fromRow !== null) return fromRow;
  if (fromMap && fromMap.length > 1) return fromMap[0];
  return null;
}

/** Match parameter name with optional legacy SensorData_ prefix. */
export function rowMatchesParameter(d: RowWithSensorLabel, param: string): boolean {
  const p = param.replace('SensorData_', '');
  return d.parameter === param || d.parameter === p;
}

/**
 * Unique labels present in rows (for selected sensors), for viz legend/traces.
 */
export function collectLabelsFromRows(
  rows: RowWithSensorLabel[],
  selectedSensors: string[],
  sensorLabelMap: Record<string, string[]>
): string[] {
  const set = new Set<string>();
  const sensorSet = new Set(selectedSensors.map(String));
  for (const d of rows) {
    if (!sensorSet.has(String(d.sensor))) continue;
    const el = getEffectiveLabel(d, sensorLabelMap);
    if (el !== null) set.add(el);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
