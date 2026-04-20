from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from google.cloud import bigquery
from pydantic import BaseModel, Field

from config.settings import get_settings
from services.bigquery_client import run_query


router = APIRouter()


class DateRange(BaseModel):
    start: datetime
    end: datetime


class FetchDataRequest(BaseModel):
    owner: str
    mac_address: str
    experiment: str
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
def post_fetch_data(payload: FetchDataRequest) -> list[FetchDataRow]:
    if (
        not payload.owner.strip()
        or not payload.mac_address.strip()
        or not payload.experiment.strip()
    ):
        raise HTTPException(status_code=400, detail="owner, mac_address, and experiment are required")

    if not payload.selectedSensors or not payload.selectedParameters:
        raise HTTPException(
            status_code=400,
            detail="selectedSensors and selectedParameters must not be empty",
        )

    if payload.dateRange.end < payload.dateRange.start:
        raise HTTPException(status_code=400, detail="dateRange.end must be >= dateRange.start")

    # Use an exclusive end boundary to avoid precision edge cases on single-day requests
    # (for example end=23:59:59.999Z). +1 ms preserves current UI semantics.
    end_exclusive = payload.dateRange.end + timedelta(milliseconds=1)

    settings = get_settings()

    query = f"""
WITH all_rows AS (
  SELECT
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
    AND Exp_Name = @experiment
),
label_ranked AS (
  SELECT
    LLA,
    Label AS latest_label,
    ROW_NUMBER() OVER (PARTITION BY LLA ORDER BY Timestamp DESC) AS rn
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
ORDER BY timestamp ASC, sensor ASC, parameter ASC;
"""

    query_parameters = [
        bigquery.ScalarQueryParameter("owner", "STRING", payload.owner),
        bigquery.ScalarQueryParameter("mac_address", "STRING", payload.mac_address),
        bigquery.ScalarQueryParameter("experiment", "STRING", payload.experiment),
        bigquery.ScalarQueryParameter("startDate", "TIMESTAMP", payload.dateRange.start),
        bigquery.ScalarQueryParameter("endExclusive", "TIMESTAMP", end_exclusive),
        bigquery.ArrayQueryParameter("selectedSensors", "STRING", payload.selectedSensors),
        bigquery.ArrayQueryParameter("selectedParameters", "STRING", payload.selectedParameters),
    ]

    rows = run_query(query=query, query_parameters=query_parameters)

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

    return response
