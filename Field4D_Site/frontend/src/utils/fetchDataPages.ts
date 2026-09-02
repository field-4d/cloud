export const FETCH_PAGE_SCHEMA_VERSION = 'field4d.fetch-data.page.v1';
export const DEFAULT_FETCH_PAGE_SIZE = 100_000;
export const MAX_PAGED_MERGED_ROWS = 3_000_000;

export interface FetchDataPageRow {
  timestamp: string;
  sensor: string;
  parameter: string;
  value: number | null;
  label: string | null;
  location: string | null;
  experiment: string;
  owner: string;
  mac_address: string;
}

export interface FetchDataPageDocument {
  schema_version: string;
  query_id: string;
  selection_signature: string;
  snapshot_at: string;
  page_sequence: number;
  rows: FetchDataPageRow[];
  rows_in_page: number;
  cumulative_rows: number;
  total_rows: number;
  next_cursor: string | null;
  complete: boolean;
  error: string | null;
  retryable: boolean;
}

export interface FetchDataPagePayload {
  owner: string;
  mac_address: string;
  experimentId: number;
  experiment: string;
  selectedSensors: string[];
  selectedParameters: string[];
  dateRange: { start: string; end: string };
  pageSize?: number;
}

export interface FetchDataPageProgress {
  page: FetchDataPageDocument;
  parseMs: number;
  responseBytes: number | null;
}

export interface FetchDataPageStreamResult {
  queryId: string;
  selectionSignature: string;
  snapshotAt: string;
  pages: number;
  rows: number;
}

export class FetchDataPageError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'FetchDataPageError';
  }
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ERROR_TEXT = 500;

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const waitForRetry = (delayMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The request was cancelled', 'AbortError'));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException('The request was cancelled', 'AbortError'));
    };
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });

const fetchPageWithRetry = async (
  endpoint: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  fetchImpl: typeof fetch
): Promise<{ page: FetchDataPageDocument; parseMs: number; responseBytes: number | null }> => {
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        const retryable = RETRYABLE_STATUSES.has(response.status);
        if (attempt === 0 && retryable) {
          await waitForRetry(250, signal);
          continue;
        }
        const detail = (await response.text()).slice(0, MAX_ERROR_TEXT);
        throw new FetchDataPageError(
          `Page request failed with HTTP ${response.status}. ${detail}`,
          response.status,
          retryable
        );
      }
      const parseStarted = performance.now();
      const page = await response.json() as FetchDataPageDocument;
      const parseMs = performance.now() - parseStarted;
      const contentLength = Number(response.headers.get('Content-Length'));
      return {
        page,
        parseMs,
        responseBytes: Number.isFinite(contentLength) ? contentLength : null,
      };
    } catch (error) {
      if (isAbortError(error) || error instanceof FetchDataPageError) throw error;
      if (attempt === 0 && error instanceof TypeError) {
        await waitForRetry(250, signal);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Page request retry loop terminated unexpectedly');
};

export const fetchDataPageStream = async (
  endpoint: string,
  payload: FetchDataPagePayload,
  signal: AbortSignal,
  onPage: (progress: FetchDataPageProgress) => void | Promise<void>,
  fetchImpl: typeof fetch = fetch
): Promise<FetchDataPageStreamResult> => {
  let cursor: string | null = null;
  let expectedPageSequence = 1;
  let expectedCumulativeRows = 0;
  let queryId: string | null = null;
  let selectionSignature: string | null = null;
  let snapshotAt: string | null = null;
  let totalRows: number | null = null;
  const seenCursors = new Set<string>();

  while (true) {
    if (signal.aborted) throw new DOMException('The request was cancelled', 'AbortError');
    const requestBody: Record<string, unknown> = cursor
      ? { ...payload, cursor, pageSize: undefined }
      : { ...payload, pageSize: payload.pageSize ?? DEFAULT_FETCH_PAGE_SIZE };
    const result = await fetchPageWithRetry(endpoint, requestBody, signal, fetchImpl);
    const page = result.page;

    if (page.schema_version !== FETCH_PAGE_SCHEMA_VERSION) {
      throw new Error(`Unsupported page schema: ${String(page.schema_version)}`);
    }
    if (!Array.isArray(page.rows) || page.rows.length !== page.rows_in_page) {
      throw new Error('Page row count metadata does not match its rows');
    }
    if (page.page_sequence !== expectedPageSequence) {
      throw new Error('A page is missing or out of sequence');
    }
    if (page.cumulative_rows !== expectedCumulativeRows + page.rows_in_page) {
      throw new Error('Page cumulative count is inconsistent');
    }
    if (!Number.isSafeInteger(page.total_rows) || page.total_rows < page.cumulative_rows) {
      throw new Error('Page total row count is invalid');
    }
    if (queryId !== null && page.query_id !== queryId) {
      throw new Error('Page query identity changed during retrieval');
    }
    if (selectionSignature !== null && page.selection_signature !== selectionSignature) {
      throw new Error('Page selection identity changed during retrieval');
    }
    if (snapshotAt !== null && page.snapshot_at !== snapshotAt) {
      throw new Error('Page snapshot changed during retrieval');
    }
    if (totalRows !== null && page.total_rows !== totalRows) {
      throw new Error('Page total row count changed during retrieval');
    }
    if (page.complete === Boolean(page.next_cursor)) {
      throw new Error('Page terminal metadata is inconsistent');
    }
    if (page.complete !== (page.cumulative_rows === page.total_rows)) {
      throw new Error('Page completeness does not match its total row count');
    }

    queryId = page.query_id;
    selectionSignature = page.selection_signature;
    snapshotAt = page.snapshot_at;
    totalRows = page.total_rows;
    expectedCumulativeRows = page.cumulative_rows;
    await onPage(result);

    if (page.complete) {
      return {
        queryId,
        selectionSignature,
        snapshotAt,
        pages: expectedPageSequence,
        rows: expectedCumulativeRows,
      };
    }
    const nextCursor = page.next_cursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error('Page cursor did not advance');
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
    expectedPageSequence += 1;
  }
};
