export const POINTS_PER_DAY = 480;
export const TARGET_MAX_ROWS_PER_REQUEST = 50_000;
export const MIN_DAYS_PER_CHUNK = 1;
export const MAX_DAYS_PER_CHUNK = 3;
/** Existing boundary retained as a user-visible large-request warning threshold. */
export const LARGE_DATASET_WARNING_ROWS = 300_000;
/** Largest exact, stable headed-Chromium dataset validated by Phase 4. */
export const MAX_TESTED_MERGED_ROWS = 1_008_000;
export const SENSOR_CHUNK_SIZE = 20;

export interface UtcDateWindow {
  start: string;
  end: string;
}

const requirePositiveInteger = (value: number, name: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
};

export const computeDaysPerChunk = (
  sensorCount: number,
  parameterCount: number
): number => {
  requirePositiveInteger(sensorCount, 'sensorCount');
  requirePositiveInteger(parameterCount, 'parameterCount');

  const estimatedRowsPerDay = sensorCount * parameterCount * POINTS_PER_DAY;
  const estimatedDays = Math.floor(
    TARGET_MAX_ROWS_PER_REQUEST / estimatedRowsPerDay
  );

  return Math.min(
    MAX_DAYS_PER_CHUNK,
    Math.max(MIN_DAYS_PER_CHUNK, estimatedDays)
  );
};

const utcDayStart = (date: Date): number =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const utcDayEnd = (date: Date): number =>
  Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23,
    59,
    59,
    999
  );

export const buildUtcDayWindows = (
  overallStartIso: string,
  overallEndIso: string,
  daysPerChunk: number
): UtcDateWindow[] => {
  requirePositiveInteger(daysPerChunk, 'daysPerChunk');
  if (daysPerChunk < MIN_DAYS_PER_CHUNK || daysPerChunk > MAX_DAYS_PER_CHUNK) {
    throw new RangeError(
      `daysPerChunk must be between ${MIN_DAYS_PER_CHUNK} and ${MAX_DAYS_PER_CHUNK}`
    );
  }

  const overallStart = new Date(overallStartIso);
  const overallEnd = new Date(overallEndIso);
  if (
    !Number.isFinite(overallStart.getTime()) ||
    !Number.isFinite(overallEnd.getTime())
  ) {
    throw new RangeError('Date window bounds must be valid ISO timestamps');
  }

  let cursorMs = utcDayStart(overallStart);
  const finalDayMs = utcDayStart(overallEnd);
  if (finalDayMs < cursorMs) {
    throw new RangeError('Date window end must not precede its start');
  }

  const windows: UtcDateWindow[] = [];
  while (cursorMs <= finalDayMs) {
    const cursor = new Date(cursorMs);
    const candidateEndMs = Date.UTC(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth(),
      cursor.getUTCDate() + daysPerChunk - 1
    );
    const windowEndDayMs = Math.min(candidateEndMs, finalDayMs);
    const windowEnd = new Date(windowEndDayMs);

    windows.push({
      start: new Date(cursorMs).toISOString(),
      end: new Date(utcDayEnd(windowEnd)).toISOString(),
    });

    cursorMs = Date.UTC(
      windowEnd.getUTCFullYear(),
      windowEnd.getUTCMonth(),
      windowEnd.getUTCDate() + 1
    );
  }

  return windows;
};
