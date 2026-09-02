from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from google.api_core.exceptions import NotFound
from google.cloud import bigquery
from google.cloud import bigquery_storage_v1
import orjson
import numpy as np
import pyarrow
import pyarrow.compute as pyarrow_compute
from pydantic import BaseModel, Field
from starlette.responses import Response

from config.settings import get_settings
from services.bigquery_client import get_bigquery_storage_client, start_query
from services.fetch_cursor import CursorValidationError, decode_cursor, encode_cursor


router = APIRouter()

PAGE_SCHEMA_VERSION = "field4d.fetch-data.page.v1"
DEFAULT_PAGE_SIZE = 100_000
MAX_PAGE_SIZE = 100_000
# The measured 100K workload peaked at 20.84 MiB of response JSON. Keep a
# finite ceiling with enough headroom for normal row-width variation while
# remaining below a 32 MiB-class response safety boundary.
TARGET_ROW_BYTES = 24 * 1024 * 1024
CURSOR_TTL = timedelta(hours=6)
QUERY_TIMEOUT_SECONDS = 120.0
MAX_SELECTION_ITEMS = 250
CATEGORICAL_COLUMNS = (
    "sensor",
    "parameter",
    "location",
    "experiment",
    "owner",
    "mac_address",
)


class DateRange(BaseModel):
    start: datetime
    end: datetime


class FetchDataPageRequest(BaseModel):
    owner: str
    mac_address: str
    experiment: str = ""
    experimentId: int | None = None
    exp_id: int | None = None
    selectedSensors: list[str] = Field(default_factory=list, max_length=MAX_SELECTION_ITEMS)
    selectedParameters: list[str] = Field(default_factory=list, max_length=MAX_SELECTION_ITEMS)
    selectedLabels: list[str] | None = None
    dateRange: DateRange
    cursor: str | None = None
    pageSize: int | None = Field(default=None, ge=1, le=MAX_PAGE_SIZE)


def _utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _canonical_selection(payload: FetchDataPageRequest) -> tuple[dict[str, Any], str]:
    experiment_id = payload.experimentId if payload.experimentId is not None else payload.exp_id
    experiment_name = payload.experiment.strip()
    owner = payload.owner.strip()
    mac_address = payload.mac_address.strip()
    sensors = sorted({value.strip() for value in payload.selectedSensors if value.strip()})
    parameters = sorted({value.strip() for value in payload.selectedParameters if value.strip()})

    if not owner or not mac_address:
        raise HTTPException(status_code=400, detail="owner and mac_address are required")
    if experiment_id is None and not experiment_name:
        raise HTTPException(status_code=400, detail="experimentId or experiment is required")
    if not sensors or not parameters:
        raise HTTPException(
            status_code=400,
            detail="selectedSensors and selectedParameters must not be empty",
        )
    if payload.dateRange.end < payload.dateRange.start:
        raise HTTPException(status_code=400, detail="dateRange.end must be >= dateRange.start")

    selection = {
        "owner": owner,
        "mac_address": mac_address,
        "experiment_id": experiment_id,
        # Legacy semantics ignore experiment name whenever an ID is supplied.
        "experiment_name": None if experiment_id is not None else experiment_name,
        "selected_sensors": sensors,
        "selected_parameters": parameters,
        "start": _utc_iso(payload.dateRange.start),
        "end_exclusive": _utc_iso(payload.dateRange.end + timedelta(milliseconds=1)),
    }
    canonical = json.dumps(selection, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    signature = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return selection, signature


def _query_parameters(
    selection: dict[str, Any],
    snapshot_at: datetime,
) -> list[bigquery.ScalarQueryParameter | bigquery.ArrayQueryParameter]:
    return [
        bigquery.ScalarQueryParameter("snapshot_at", "TIMESTAMP", snapshot_at),
        bigquery.ScalarQueryParameter("owner", "STRING", selection["owner"]),
        bigquery.ScalarQueryParameter("mac_address", "STRING", selection["mac_address"]),
        bigquery.ScalarQueryParameter(
            "use_experiment_id", "BOOL", selection["experiment_id"] is not None
        ),
        bigquery.ScalarQueryParameter(
            "use_experiment_name", "BOOL", bool(selection["experiment_name"])
        ),
        bigquery.ScalarQueryParameter("experiment_id", "INT64", selection["experiment_id"]),
        bigquery.ScalarQueryParameter("experiment", "STRING", selection["experiment_name"] or ""),
        bigquery.ScalarQueryParameter("startDate", "TIMESTAMP", _parse_utc(selection["start"])),
        bigquery.ScalarQueryParameter(
            "endExclusive", "TIMESTAMP", _parse_utc(selection["end_exclusive"])
        ),
        bigquery.ArrayQueryParameter(
            "selectedSensors", "STRING", selection["selected_sensors"]
        ),
        bigquery.ArrayQueryParameter(
            "selectedParameters", "STRING", selection["selected_parameters"]
        ),
    ]


def _job_server_ms(job: bigquery.QueryJob) -> float | None:
    if job.started is None or job.ended is None:
        return None
    return (job.ended - job.started).total_seconds() * 1000


async def _cancel_job(job: bigquery.QueryJob) -> None:
    try:
        await asyncio.to_thread(job.cancel)
    except Exception:
        # Cancellation is best-effort and the request still terminates explicitly.
        return


async def _wait_for_job(
    job: bigquery.QueryJob,
    request: Request,
    *,
    page_size: int | None = None,
    max_results: int | None = None,
    start_index: int | None = None,
) -> Any:
    result_task = asyncio.create_task(
        asyncio.to_thread(
            lambda: job.result(
                timeout=QUERY_TIMEOUT_SECONDS,
                page_size=page_size,
                max_results=max_results,
                start_index=start_index,
            )
        )
    )
    started = time.perf_counter()
    while True:
        done, _ = await asyncio.wait({result_task}, timeout=0.2)
        if result_task in done:
            return result_task.result()
        if await request.is_disconnected():
            await _cancel_job(job)
            result_task.cancel()
            raise HTTPException(status_code=499, detail="Client cancelled the page request")
        if time.perf_counter() - started > QUERY_TIMEOUT_SECONDS:
            await _cancel_job(job)
            result_task.cancel()
            raise HTTPException(status_code=504, detail="Page query timed out; retry this cursor")


def _arrow_rows(row_iterator: Any) -> list[dict[str, Any]]:
    table = row_iterator.to_arrow(create_bqstorage_client=True)
    columns = table.to_pydict()
    names = list(columns)
    return [
        {name: columns[name][index] for name in names}
        for index in range(table.num_rows)
    ]


async def _materialize_rows(
    job: bigquery.QueryJob,
    iterator: Any,
    *,
    prefer_arrow: bool,
    page_size: int | None = None,
    max_results: int | None = None,
    start_index: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    materialize_started = time.perf_counter()
    method = "row_iterator"
    fallback_type: str | None = None
    if prefer_arrow:
        try:
            rows = await asyncio.to_thread(_arrow_rows, iterator)
            method = "bigquery_storage_arrow"
        except Exception as exc:
            fallback_type = type(exc).__name__
            fallback_iterator = await asyncio.to_thread(
                lambda: job.result(
                    timeout=QUERY_TIMEOUT_SECONDS,
                    page_size=page_size,
                    max_results=max_results,
                    start_index=start_index,
                )
            )
            rows = await asyncio.to_thread(
                lambda: [dict(row.items()) for row in fallback_iterator]
            )
    else:
        rows = await asyncio.to_thread(lambda: [dict(row.items()) for row in iterator])
    return rows, {
        "materialization_ms": (time.perf_counter() - materialize_started) * 1000,
        "materialization_method": method,
        "arrow_fallback_type": fallback_type,
    }


async def _execute_query(
    query: str,
    parameters: list[bigquery.ScalarQueryParameter | bigquery.ArrayQueryParameter],
    request: Request,
    *,
    prefer_arrow: bool,
    location: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    query_started = time.perf_counter()
    job = await asyncio.to_thread(start_query, query, parameters, location)
    iterator = await _wait_for_job(job, request)
    query_ms = (time.perf_counter() - query_started) * 1000

    rows, materialization = await _materialize_rows(
        job, iterator, prefer_arrow=prefer_arrow
    )

    return rows, {
        "client_query_ms": query_ms,
        "server_query_ms": _job_server_ms(job),
        "bytes_processed": int(job.total_bytes_processed or 0),
        "slot_millis": int(job.slot_millis or 0),
        **materialization,
    }


async def _load_label_map(
    selection: dict[str, Any],
    snapshot_at: datetime,
    request: Request,
) -> tuple[dict[str, str], dict[str, Any]]:
    settings = get_settings()
    query = f"""
WITH ranked AS (
  SELECT
    LLA,
    Label,
    ROW_NUMBER() OVER (PARTITION BY LLA ORDER BY Timestamp DESC, row_id DESC) AS rn
  FROM `{settings.sensors_data_table}` FOR SYSTEM_TIME AS OF @snapshot_at
  WHERE Owner = @owner
    AND Mac_Address = @mac_address
    AND (
      (@use_experiment_id = TRUE AND SAFE_CAST(Exp_ID AS INT64) = @experiment_id)
      OR (@use_experiment_id = FALSE AND @use_experiment_name = TRUE AND Exp_Name = @experiment)
    )
    AND LLA IN UNNEST(@selectedSensors)
    AND Label IS NOT NULL
    AND Label != ''
)
SELECT LLA AS sensor, Label AS label
FROM ranked
WHERE rn = 1
ORDER BY sensor
"""
    rows, metrics = await _execute_query(
        query,
        _query_parameters(selection, snapshot_at),
        request,
        prefer_arrow=False,
    )
    return {str(row["sensor"]): str(row["label"]) for row in rows}, metrics


def _measurement_query(
    selection: dict[str, Any],
    snapshot_at: datetime,
) -> tuple[str, list[bigquery.ScalarQueryParameter | bigquery.ArrayQueryParameter]]:
    settings = get_settings()
    query = f"""
SELECT
  row_id,
  Timestamp AS timestamp,
  LLA AS sensor,
  Variable AS parameter,
  Value AS value,
  Location AS location,
  Exp_Name AS experiment,
  Owner AS owner,
  Mac_Address AS mac_address,
  ROW_NUMBER() OVER (
    ORDER BY Timestamp ASC, LLA ASC, Variable ASC, row_id ASC
  ) - 1 AS page_index
FROM `{settings.sensors_data_table}` FOR SYSTEM_TIME AS OF @snapshot_at
WHERE Owner = @owner
  AND Mac_Address = @mac_address
  AND (
    (@use_experiment_id = TRUE AND SAFE_CAST(Exp_ID AS INT64) = @experiment_id)
    OR (@use_experiment_id = FALSE AND @use_experiment_name = TRUE AND Exp_Name = @experiment)
  )
  AND Timestamp >= @startDate
  AND Timestamp < @endExclusive
  AND LLA IN UNNEST(@selectedSensors)
  AND Variable IN UNNEST(@selectedParameters)
ORDER BY timestamp ASC, sensor ASC, parameter ASC, row_id ASC
"""
    return query, _query_parameters(selection, snapshot_at)


def _storage_reference(job: bigquery.QueryJob, total_rows: int) -> dict[str, str]:
    destination = job.destination
    if destination is None:
        raise HTTPException(status_code=500, detail="BigQuery returned no temporary result")
    reference = {
        "job_id": str(job.job_id),
        "project": str(job.project),
        "location": str(job.location),
        "read_session": "",
        "read_stream": "",
    }
    if not reference["job_id"] or not reference["project"] or not reference["location"]:
        raise HTTPException(status_code=500, detail="BigQuery returned an incomplete job reference")
    if total_rows == 0:
        return reference

    read_client = get_bigquery_storage_client()
    table_path = (
        f"projects/{destination.project}/datasets/{destination.dataset_id}"
        f"/tables/{destination.table_id}"
    )
    session = bigquery_storage_v1.types.ReadSession(
        table=table_path,
        data_format=bigquery_storage_v1.types.DataFormat.ARROW,
    )
    session = read_client.create_read_session(
        parent=f"projects/{job.project}",
        read_session=session,
        max_stream_count=1,
    )
    if len(session.streams) != 1:
        raise HTTPException(status_code=500, detail="BigQuery returned no stable read stream")
    if int(session.estimated_row_count or 0) != total_rows:
        raise HTTPException(status_code=500, detail="BigQuery read stream row count changed")
    reference["read_session"] = session.name
    reference["read_stream"] = session.streams[0].name
    return reference


def _read_storage_page_sync(
    job_reference: dict[str, str],
    start_index: int,
    page_size: int,
    total_rows: int,
) -> pyarrow.Table:
    target_rows = min(page_size, max(0, total_rows - start_index))
    if target_rows == 0:
        return []
    if not job_reference.get("read_stream"):
        raise CursorValidationError("Cursor has no BigQuery read stream")

    read_stream = get_bigquery_storage_client().read_rows(
        job_reference["read_stream"], offset=start_index
    )
    batches: list[pyarrow.RecordBatch] = []
    downloaded_rows = 0
    try:
        for page in read_stream.rows().pages:
            batch = page.to_arrow()
            batches.append(batch)
            downloaded_rows += batch.num_rows
            if downloaded_rows >= target_rows:
                break
    finally:
        wrapped = getattr(read_stream, "_wrapped", None)
        if wrapped is not None and hasattr(wrapped, "cancel"):
            wrapped.cancel()

    table = pyarrow.Table.from_batches(batches).slice(0, target_rows)
    if table.num_rows != target_rows:
        raise HTTPException(status_code=410, detail="BigQuery read stream ended early; restart")
    return table


async def _load_storage_page(
    job_reference: dict[str, str],
    start_index: int,
    page_size: int,
    total_rows: int,
) -> tuple[pyarrow.Table, dict[str, Any]]:
    started = time.perf_counter()
    try:
        rows = await asyncio.to_thread(
            _read_storage_page_sync,
            job_reference,
            start_index,
            page_size,
            total_rows,
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=410,
            detail="Cursor query result expired; restart this selection",
        ) from exc
    elapsed_ms = (time.perf_counter() - started) * 1000
    return rows, {
        "client_query_ms": elapsed_ms,
        "server_query_ms": 0.0,
        "bytes_processed": 0,
        "slot_millis": 0,
        "materialization_ms": elapsed_ms,
        "materialization_method": "bigquery_storage_stream_arrow",
        "arrow_fallback_type": None,
    }


async def _start_measurement_page(
    selection: dict[str, Any],
    snapshot_at: datetime,
    page_size: int,
    request: Request,
) -> tuple[pyarrow.Table, dict[str, Any], dict[str, Any], int]:
    query, parameters = _measurement_query(selection, snapshot_at)
    query_started = time.perf_counter()
    job = await asyncio.to_thread(start_query, query, parameters)
    iterator = await _wait_for_job(
        job,
        request,
        page_size=page_size,
        max_results=page_size,
        start_index=0,
    )
    query_ms = (time.perf_counter() - query_started) * 1000
    total_rows = int(iterator.total_rows or 0)
    job_reference = await asyncio.to_thread(_storage_reference, job, total_rows)
    rows, page_metrics = await _load_storage_page(job_reference, 0, page_size, total_rows)
    metrics = {
        "client_query_ms": query_ms + float(page_metrics["client_query_ms"]),
        "server_query_ms": float(_job_server_ms(job) or 0)
        + float(page_metrics["server_query_ms"] or 0),
        "bytes_processed": int(job.total_bytes_processed or 0)
        + int(page_metrics["bytes_processed"]),
        "slot_millis": int(job.slot_millis or 0) + int(page_metrics["slot_millis"]),
        "materialization_ms": page_metrics["materialization_ms"],
        "materialization_method": page_metrics["materialization_method"],
        "arrow_fallback_type": page_metrics["arrow_fallback_type"],
    }
    return rows, metrics, job_reference, total_rows


async def _resume_measurement_page(
    job_reference: dict[str, str],
    start_index: int,
    page_size: int,
    total_rows: int,
    request: Request,
) -> tuple[pyarrow.Table, dict[str, Any], int]:
    rows, metrics = await _load_storage_page(
        job_reference, start_index, page_size, total_rows
    )
    metrics = {
        **metrics,
    }
    return rows, metrics, total_rows


def _public_row(row: dict[str, Any], label_map: dict[str, str]) -> dict[str, Any]:
    timestamp = row.get("timestamp")
    if not isinstance(timestamp, datetime):
        raise HTTPException(status_code=500, detail="A selected row has no valid timestamp")
    value = row.get("value")
    if isinstance(value, float) and not math.isfinite(value):
        raise HTTPException(status_code=500, detail="A selected row has a non-finite value")
    sensor = str(row["sensor"])
    return {
        "timestamp": _utc_iso(timestamp),
        "sensor": sensor,
        "parameter": str(row["parameter"]),
        "value": value,
        "label": label_map.get(sensor),
        "location": row.get("location"),
        "experiment": row.get("experiment"),
        "owner": row.get("owner"),
        "mac_address": row.get("mac_address"),
    }


class _DictionaryColumn:
    __slots__ = ("values", "indices")

    def __init__(self, encoded: pyarrow.DictionaryArray) -> None:
        self.values = encoded.dictionary.to_pylist()
        self.indices = pyarrow_compute.fill_null(encoded.indices, -1).to_numpy(
            zero_copy_only=False
        )

    def get(self, index: int) -> Any:
        value_index = int(self.indices[index])
        return None if value_index < 0 else self.values[value_index]


def _vectorized_public_rows(
    table: pyarrow.Table,
    label_map: dict[str, str],
    start_index: int,
) -> tuple[list[dict[str, Any]], list[Any], dict[str, float]]:
    """Materialize the existing public row contract without a full to_pydict pass."""
    total_started = time.perf_counter()

    arrow_started = time.perf_counter()
    ordinal_values = table.column("page_index").combine_chunks().to_numpy(
        zero_copy_only=False
    )
    expected_ordinals = np.arange(
        start_index, start_index + table.num_rows, dtype=np.int64
    )
    if not np.array_equal(ordinal_values, expected_ordinals):
        raise HTTPException(status_code=500, detail="BigQuery read stream order changed")
    if bool(pyarrow_compute.any(pyarrow_compute.is_null(table.column("timestamp"))).as_py()):
        raise HTTPException(status_code=500, detail="A selected row has no valid timestamp")
    invalid_values = pyarrow_compute.fill_null(
        pyarrow_compute.invert(pyarrow_compute.is_finite(table.column("value"))), False
    )
    if bool(pyarrow_compute.any(invalid_values).as_py()):
        raise HTTPException(status_code=500, detail="A selected row has a non-finite value")
    encoded_dictionaries = {
        name: pyarrow_compute.dictionary_encode(table.column(name).combine_chunks())
        for name in CATEGORICAL_COLUMNS
    }
    arrow_native_ms = (time.perf_counter() - arrow_started) * 1000

    transforms_started = time.perf_counter()
    timestamp_micros = (
        pyarrow_compute.cast(table.column("timestamp"), pyarrow.int64())
        .combine_chunks()
        .to_numpy(zero_copy_only=False)
    )
    unique_micros, timestamp_indices = np.unique(
        timestamp_micros, return_inverse=True
    )
    timestamp_values = np.datetime_as_string(
        unique_micros.view("datetime64[us]"), unit="us", timezone="UTC"
    ).tolist()
    casts_vectorized_ms = (time.perf_counter() - transforms_started) * 1000

    materialization_started = time.perf_counter()
    dictionaries = {
        name: _DictionaryColumn(encoded)
        for name, encoded in encoded_dictionaries.items()
    }
    numeric_values = table.column("value").to_pylist()
    row_ids = table.column("row_id").to_pylist()
    sensor_dictionary = dictionaries["sensor"]
    labels_by_sensor_dictionary = [
        label_map.get(str(sensor)) for sensor in sensor_dictionary.values
    ]
    null_sensor_label = label_map.get("None")
    final_materialization_ms = (time.perf_counter() - materialization_started) * 1000

    rows_started = time.perf_counter()
    parameter_dictionary = dictionaries["parameter"]
    location_dictionary = dictionaries["location"]
    experiment_dictionary = dictionaries["experiment"]
    owner_dictionary = dictionaries["owner"]
    mac_dictionary = dictionaries["mac_address"]
    public_rows = [
        {
            "timestamp": timestamp_values[int(timestamp_indices[index])],
            "sensor": str(sensor_dictionary.get(index)),
            "parameter": str(parameter_dictionary.get(index)),
            "value": numeric_values[index],
            "label": (
                labels_by_sensor_dictionary[int(sensor_dictionary.indices[index])]
                if int(sensor_dictionary.indices[index]) >= 0
                else null_sensor_label
            ),
            "location": location_dictionary.get(index),
            "experiment": experiment_dictionary.get(index),
            "owner": owner_dictionary.get(index),
            "mac_address": mac_dictionary.get(index),
        }
        for index in range(table.num_rows)
    ]
    final_row_construction_ms = (time.perf_counter() - rows_started) * 1000
    return public_rows, row_ids, {
        "arrow_native_operations_ms": arrow_native_ms,
        "casts_vectorized_transforms_ms": casts_vectorized_ms,
        "final_materialization_ms": final_materialization_ms,
        "final_python_row_construction_ms": final_row_construction_ms,
        "total_transform_ms": (time.perf_counter() - total_started) * 1000,
    }


def _bound_prepared_public_rows(
    prepared_rows: list[dict[str, Any]],
    row_ids: list[Any],
    page_size: int,
) -> tuple[list[dict[str, Any]], list[str] | None, bool, int]:
    public_rows: list[dict[str, Any]] = []
    row_bytes = 0
    last_key: list[str] | None = None
    for public, row_id in zip(prepared_rows, row_ids):
        if len(public_rows) >= page_size:
            break
        serialized = orjson.dumps(public)
        projected = row_bytes + len(serialized) + (1 if public_rows else 0)
        if public_rows and projected > TARGET_ROW_BYTES:
            break
        public_rows.append(public)
        row_bytes = projected
        last_key = [
            public["timestamp"],
            public["sensor"],
            public["parameter"],
            str(row_id),
        ]

    has_more = len(public_rows) < len(prepared_rows)
    return public_rows, last_key, has_more, row_bytes


def _bounded_public_rows(
    raw_rows: list[dict[str, Any]],
    label_map: dict[str, str],
    page_size: int,
) -> tuple[list[dict[str, Any]], list[str] | None, bool, int]:
    public_rows: list[dict[str, Any]] = []
    row_bytes = 0
    last_key: list[str] | None = None
    for raw_row in raw_rows:
        if len(public_rows) >= page_size:
            break
        public = _public_row(raw_row, label_map)
        serialized = orjson.dumps(public)
        projected = row_bytes + len(serialized) + (1 if public_rows else 0)
        if public_rows and projected > TARGET_ROW_BYTES:
            break
        public_rows.append(public)
        row_bytes = projected
        last_key = [
            public["timestamp"],
            public["sensor"],
            public["parameter"],
            str(raw_row["row_id"]),
        ]

    has_more = len(public_rows) < len(raw_rows)
    return public_rows, last_key, has_more, row_bytes


def _cursor_error(exc: CursorValidationError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.post("/v2/fetch-data-page")
async def post_fetch_data_page(payload: FetchDataPageRequest, request: Request) -> Response:
    metrics = request.scope["state"]["fetch_metrics"]
    selection, selection_signature = _canonical_selection(payload)
    now = datetime.now(timezone.utc)

    if payload.cursor:
        metrics["retry_state"] = "cursor_continuation"
        try:
            cursor = decode_cursor(payload.cursor)
            if cursor.get("selection_signature") != selection_signature:
                raise CursorValidationError("Cursor does not match this selection")
            expires_at = _parse_utc(str(cursor["expires_at"]))
            if expires_at <= now:
                raise HTTPException(status_code=410, detail="Cursor expired; restart this selection")
            snapshot_at = _parse_utc(str(cursor["snapshot_at"]))
            page_size = int(cursor["page_size"])
            if payload.pageSize is not None and payload.pageSize != page_size:
                raise CursorValidationError("Cursor page size does not match this request")
            page_sequence = int(cursor["page_sequence"])
            cumulative_before = int(cursor["cumulative_rows"])
            job_reference = {
                "job_id": str(cursor["job_reference"]["job_id"]),
                "project": str(cursor["job_reference"]["project"]),
                "location": str(cursor["job_reference"]["location"]),
                "read_session": str(cursor["job_reference"]["read_session"]),
                "read_stream": str(cursor["job_reference"]["read_stream"]),
            }
            total_rows = int(cursor["total_rows"])
            label_map = {
                str(key): str(value) for key, value in dict(cursor["label_map"]).items()
            }
            query_id = str(cursor["query_id"])
            label_metrics: dict[str, Any] | None = None
        except HTTPException:
            raise
        except (CursorValidationError, KeyError, TypeError, ValueError) as exc:
            if isinstance(exc, CursorValidationError):
                raise _cursor_error(exc) from exc
            raise _cursor_error(CursorValidationError("Malformed cursor state")) from exc
    else:
        snapshot_at = now
        page_size = payload.pageSize or DEFAULT_PAGE_SIZE
        page_sequence = 1
        cumulative_before = 0
        query_id = hashlib.sha256(
            f"{selection_signature}:{_utc_iso(snapshot_at)}".encode("utf-8")
        ).hexdigest()[:32]
        label_map, label_metrics = await _load_label_map(selection, snapshot_at, request)

    metrics.update(
        {
            "selection_signature": selection_signature,
            "query_id": query_id,
            "page_sequence": page_sequence,
            "snapshot_at": _utc_iso(snapshot_at),
            "label_state": "cursor_reuse" if payload.cursor else "loaded_once",
        }
    )

    if payload.cursor:
        page_data, page_metrics, observed_total_rows = await _resume_measurement_page(
            job_reference, cumulative_before, page_size, total_rows, request
        )
        if observed_total_rows != total_rows:
            raise HTTPException(status_code=410, detail="Cursor query result changed; restart")
    else:
        page_data, page_metrics, job_reference, total_rows = await _start_measurement_page(
            selection, snapshot_at, page_size, request
        )
    normalize_started = time.perf_counter()
    if isinstance(page_data, pyarrow.Table):
        prepared_rows, row_ids, _transform_stages = _vectorized_public_rows(
            page_data, label_map, cumulative_before
        )
        public_rows, terminal_key, _bounded_more, row_bytes = (
            _bound_prepared_public_rows(prepared_rows, row_ids, page_size)
        )
    else:
        # Retained for deterministic endpoint fixtures and non-Arrow test doubles.
        public_rows, terminal_key, _bounded_more, row_bytes = _bounded_public_rows(
            page_data, label_map, page_size
        )
    normalization_ms = (time.perf_counter() - normalize_started) * 1000
    cumulative_rows = cumulative_before + len(public_rows)
    if cumulative_rows > total_rows:
        raise HTTPException(status_code=500, detail="Page count exceeded query result count")
    complete = cumulative_rows == total_rows
    has_more = not complete

    if has_more and terminal_key is None:
        raise HTTPException(status_code=500, detail="Page byte policy could not make progress")

    next_cursor = None
    if has_more:
        next_cursor = encode_cursor(
            {
                "selection_signature": selection_signature,
                "query_id": query_id,
                "snapshot_at": _utc_iso(snapshot_at),
                "expires_at": _utc_iso(snapshot_at + CURSOR_TTL),
                "page_size": page_size,
                "page_sequence": page_sequence + 1,
                "cumulative_rows": cumulative_rows,
                "last_key": terminal_key,
                "job_reference": job_reference,
                "total_rows": total_rows,
                "label_map": label_map,
            }
        )

    response_document = {
        "schema_version": PAGE_SCHEMA_VERSION,
        "query_id": query_id,
        "selection_signature": selection_signature,
        "snapshot_at": _utc_iso(snapshot_at),
        "page_sequence": page_sequence,
        "rows": public_rows,
        "rows_in_page": len(public_rows),
        "cumulative_rows": cumulative_rows,
        "total_rows": total_rows,
        "next_cursor": next_cursor,
        "complete": complete,
        "error": None,
        "retryable": False,
    }
    serialization_started = time.perf_counter()
    response_body = orjson.dumps(response_document)
    serialization_ms = (time.perf_counter() - serialization_started) * 1000

    query_metrics = [page_metrics] + ([label_metrics] if label_metrics else [])
    metrics.update(
        {
            "rows_returned": len(public_rows),
            "cumulative_rows": cumulative_rows,
            "bigquery_duration_ms": round(
                sum(float(item["client_query_ms"]) for item in query_metrics), 3
            ),
            "bigquery_server_ms": round(
                sum(float(item["server_query_ms"] or 0) for item in query_metrics), 3
            ),
            "bigquery_bytes_processed": sum(
                int(item["bytes_processed"]) for item in query_metrics
            ),
            "materialization_duration_ms": round(
                sum(float(item["materialization_ms"]) for item in query_metrics), 3
            ),
            "materialization_method": page_metrics["materialization_method"],
            "model_normalization_duration_ms": round(normalization_ms, 3),
            "serialization_duration_ms": round(serialization_ms, 3),
            "serialized_bytes": len(response_body),
            "row_payload_bytes": row_bytes,
            "complete": complete,
            "terminal_state": "complete" if complete else "next_cursor",
        }
    )
    return Response(content=response_body, media_type="application/json")
