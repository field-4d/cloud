from datetime import datetime, timedelta
import hashlib
import json
import logging
import time

from fastapi import APIRouter, HTTPException, Request
from google.cloud import bigquery
from pydantic import BaseModel, Field

from config.settings import get_settings
from services.bigquery_client import run_query_with_job


router = APIRouter()
logger = logging.getLogger(__name__)


class DateRange(BaseModel):
    start: datetime
    end: datetime


class FetchDataRequest(BaseModel):
    owner: str
    mac_address: str
    experiment: str = ""
    experimentId: int | None = None
    exp_id: int | None = None
    selectedSensors: list[str] = Field(default_factory=list)
    selectedParameters: list[str] = Field(default_factory=list)
    # Deprecated: kept for older clients. Label filter is sensor-driven; rows use latest Label per LLA from BQ.
    selectedLabels: list[str] | None = None
    dateRange: DateRange


class FetchDataRow(BaseModel):
    timestamp: datetime
    sensor: str
    parameter: str
    value: float | None = None
    label: str | None = None
    location: str | None = None
    experiment: str
    owner: str
    mac_address: str


@router.post("/fetch-data", response_model=list[FetchDataRow])
def post_fetch_data(payload: FetchDataRequest, request: Request) -> list[FetchDataRow]:
    experiment_id = payload.experimentId if payload.experimentId is not None else payload.exp_id
    experiment_name = payload.experiment.strip()

    if (
        not payload.owner.strip()
        or not payload.mac_address.strip()
    ):
        raise HTTPException(status_code=400, detail="owner and mac_address are required")
    if experiment_id is None and not experiment_name:
        raise HTTPException(status_code=400, detail="experimentId or experiment is required")

    if not payload.selectedSensors or not payload.selectedParameters:
        raise HTTPException(
            status_code=400,
            detail="selectedSensors and selectedParameters must not be empty",
        )

    if payload.dateRange.end < payload.dateRange.start:
        raise HTTPException(status_code=400, detail="dateRange.end must be >= dateRange.start")

    selection_signature = hashlib.sha256(
        json.dumps(
            {
                "owner": payload.owner.strip(),
                "mac_address": payload.mac_address.strip(),
                "experiment_id": experiment_id,
                "experiment_name": None if experiment_id is not None else experiment_name,
                "selected_sensors": sorted(set(payload.selectedSensors)),
                "selected_parameters": sorted(set(payload.selectedParameters)),
                "start": payload.dateRange.start.isoformat(),
                "end": payload.dateRange.end.isoformat(),
            },
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()

    # Use an exclusive end boundary to avoid precision edge cases on single-day requests
    # (for example end=23:59:59.999Z). +1 ms preserves current UI semantics.
    end_exclusive = payload.dateRange.end + timedelta(milliseconds=1)

    settings = get_settings()

    query = f"""
WITH all_rows AS (
  SELECT
    row_id,
    Timestamp,
    LLA,
    Variable,
    Value,
    Label,
    Location,
    Exp_Name,
    Owner,
    Mac_Address
  FROM `{settings.sensors_data_table}`
  WHERE Owner = @owner
    AND Mac_Address = @mac_address
    AND (
      (@use_experiment_id = TRUE AND SAFE_CAST(Exp_ID AS INT64) = @experiment_id)
      OR (@use_experiment_id = FALSE AND @use_experiment_name = TRUE AND Exp_Name = @experiment)
    )
),
label_ranked AS (
  SELECT
    LLA,
    Label AS latest_label,
    ROW_NUMBER() OVER (PARTITION BY LLA ORDER BY Timestamp DESC, row_id DESC) AS rn
  FROM all_rows
  WHERE Label IS NOT NULL AND Label != ''
),
sensor_latest_label AS (
  SELECT LLA, latest_label
  FROM label_ranked
  WHERE rn = 1
),
windowed AS (
  SELECT
    t.Timestamp AS timestamp,
    t.row_id AS row_id,
    t.LLA AS sensor,
    t.Variable AS parameter,
    t.Value AS value,
    t.Location AS location,
    t.Exp_Name AS experiment,
    t.Owner AS owner,
    t.Mac_Address AS mac_address,
    l.latest_label AS assigned_label
  FROM all_rows t
  LEFT JOIN sensor_latest_label l ON t.LLA = l.LLA
  WHERE t.Timestamp >= @startDate
    AND t.Timestamp < @endExclusive
    AND t.LLA IN UNNEST(@selectedSensors)
    AND t.Variable IN UNNEST(@selectedParameters)
)
SELECT
  timestamp,
  sensor,
  parameter,
  value,
  assigned_label AS label,
  location,
  experiment,
  owner,
  mac_address
FROM windowed
ORDER BY timestamp ASC, sensor ASC, parameter ASC, row_id ASC;
"""

    query_parameters = [
        bigquery.ScalarQueryParameter("owner", "STRING", payload.owner),
        bigquery.ScalarQueryParameter("mac_address", "STRING", payload.mac_address),
        bigquery.ScalarQueryParameter("use_experiment_id", "BOOL", experiment_id is not None),
        bigquery.ScalarQueryParameter("use_experiment_name", "BOOL", bool(experiment_name)),
        bigquery.ScalarQueryParameter("experiment_id", "INT64", experiment_id),
        bigquery.ScalarQueryParameter("experiment", "STRING", experiment_name),
        bigquery.ScalarQueryParameter("startDate", "TIMESTAMP", payload.dateRange.start),
        bigquery.ScalarQueryParameter("endExclusive", "TIMESTAMP", end_exclusive),
        bigquery.ArrayQueryParameter("selectedSensors", "STRING", payload.selectedSensors),
        bigquery.ArrayQueryParameter("selectedParameters", "STRING", payload.selectedParameters),
    ]

    logger.info(
        {
            "fetch_data_filter_mode": "experiment_id"
            if experiment_id is not None
            else "experiment_name_fallback",
            "fetch_data_experiment_id": experiment_id,
            "fetch_data_experiment_name": experiment_name,
        }
    )

    query_started = time.perf_counter()
    rows, query_job = run_query_with_job(query=query, query_parameters=query_parameters)
    query_ms = (time.perf_counter() - query_started) * 1000

    materialize_model_started = time.perf_counter()
    response: list[FetchDataRow] = []
    for row in rows:
        label = row["label"]
        if label == "":
            label = None
        response.append(
            FetchDataRow(
                timestamp=row["timestamp"],
                sensor=row["sensor"],
                parameter=row["parameter"],
                value=row["value"],
                label=label,
                location=row["location"],
                experiment=row["experiment"],
                owner=row["owner"],
                mac_address=row["mac_address"],
            )
        )

    materialize_model_ms = (time.perf_counter() - materialize_model_started) * 1000
    server_ms = None
    if query_job.started is not None and query_job.ended is not None:
        server_ms = (query_job.ended - query_job.started).total_seconds() * 1000
    request.scope["state"]["fetch_metrics"].update(
        {
            "selection_signature": selection_signature,
            "page_sequence": 1,
            "rows_returned": len(response),
            "bigquery_duration_ms": round(query_ms, 3),
            "bigquery_server_ms": round(server_ms, 3) if server_ms is not None else None,
            "bigquery_bytes_processed": int(query_job.total_bytes_processed or 0),
            "materialization_duration_ms": round(materialize_model_ms, 3),
            "model_normalization_duration_ms": None,
            "complete": True,
            "terminal_state": "complete",
        }
    )
    return response
