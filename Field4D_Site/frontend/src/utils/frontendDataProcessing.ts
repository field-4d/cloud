export interface FrontendDataRow {
  timestamp: string;
  parameter: string;
  value: number | null | undefined;
  [key: string]: unknown;
}

export interface OutlierHintAnalysis {
  hasDefaultRuleOutliers: boolean;
  dataFingerprint: string;
  finiteCount: number;
  groupedValueEntries: number;
}

/** Preserve source identity when all dates are selected; otherwise retain row order and references. */
export function filterRowsBySelectedDates<T extends FrontendDataRow>(
  rows: T[],
  allDatesSelected: boolean,
  selectedDates: readonly string[]
): T[] {
  if (allDatesSelected) return rows;
  return rows.filter((row) =>
    selectedDates.includes(typeof row.timestamp === 'string' ? row.timestamp.split('T')[0] : '')
  );
}

/** Apply the existing inclusive UTC-hour semantics without copying row objects. */
export function filterRowsByUtcHourRange<T extends FrontendDataRow>(
  rows: T[],
  hourRange: readonly [number, number]
): T[] {
  return rows.filter((row) => {
    const timestamp = typeof row.timestamp === 'string' ? row.timestamp : '';
    if (!timestamp) return false;
    const hour = new Date(timestamp).getUTCHours();
    if (Number.isNaN(hour)) return false;
    return hourRange[0] <= hourRange[1]
      ? hour >= hourRange[0] && hour <= hourRange[1]
      : hour >= hourRange[0] || hour <= hourRange[1];
  });
}

/**
 * Detect the same default-IQR outliers used by the pulse hint without cloning
 * and mutating every row through the general filtering function.
 */
export function analyzeDefaultIqrOutliers<T extends FrontendDataRow>(
  rows: T[],
  threshold: number
): OutlierHintAnalysis {
  const valuesByBucket = new Map<string, number[]>();
  let finiteCount = 0;
  let finiteSum = 0;
  let finiteMin = Number.POSITIVE_INFINITY;
  let finiteMax = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    if (typeof row.value !== 'number' || !Number.isFinite(row.value)) continue;
    finiteCount += 1;
    finiteSum += row.value;
    if (row.value < finiteMin) finiteMin = row.value;
    if (row.value > finiteMax) finiteMax = row.value;

    const parameter = String(row.parameter ?? '');
    const date = typeof row.timestamp === 'string' && row.timestamp.includes('T')
      ? row.timestamp.split('T')[0]
      : String(row.timestamp ?? '');
    const bucketKey = `${parameter}\u0000${date}`;
    const values = valuesByBucket.get(bucketKey);
    if (values) values.push(row.value);
    else valuesByBucket.set(bucketKey, [row.value]);
  }

  let hasDefaultRuleOutliers = false;
  for (const values of valuesByBucket.values()) {
    if (values.length < 4) continue;
    values.sort((left, right) => left - right);
    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - threshold * iqr;
    const upper = q3 + threshold * iqr;
    if (values[0] < lower || values[values.length - 1] > upper) {
      hasDefaultRuleOutliers = true;
      break;
    }
  }

  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const dataFingerprint = [
    rows.length,
    finiteCount,
    finiteSum.toFixed(6),
    Number.isFinite(finiteMin) ? finiteMin.toFixed(6) : 'na',
    Number.isFinite(finiteMax) ? finiteMax.toFixed(6) : 'na',
    String(firstRow?.timestamp ?? ''),
    String(lastRow?.timestamp ?? ''),
    String(firstRow?.parameter ?? ''),
    String(lastRow?.parameter ?? ''),
  ].join('|');

  return {
    hasDefaultRuleOutliers,
    dataFingerprint,
    finiteCount,
    groupedValueEntries: finiteCount,
  };
}
