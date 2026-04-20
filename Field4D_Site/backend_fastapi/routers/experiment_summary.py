from datetime import datetime

from fastapi import APIRouter, HTTPException
from google.cloud import bigquery
from pydantic import BaseModel, Field

from config.settings import get_settings
from services.bigquery_client import run_query


router = APIRouter()


class ExperimentSummaryRequest(BaseModel):
    owner: str
    mac_address: str
    experiments: list[str] = Field(default_factory=list)


class ExperimentSummaryRow(BaseModel):
    experimentName: str
    experimentId: int | None = None
    firstTimestamp: datetime | None = None
    lastTimestamp: datetime | None = None
    sensorCount: int
    rowCount: int
    sensors: list[str]
    labelOptions: list[str]
    locationOptions: list[str]
    parameters: list[str]
    sensorLabelMap: dict[str, list[str]] = Field(default_factory=dict)
    labelCounts: dict[str, int] = Field(default_factory=dict)
    sensorLocationMap: dict[str, str] = Field(default_factory=dict)


@router.post("/experiment-summary", response_model=list[ExperimentSummaryRow])
def post_experiment_summary(payload: ExperimentSummaryRequest) -> list[ExperimentSummaryRow]:
    if not payload.owner.strip() or not payload.mac_address.strip():
        raise HTTPException(status_code=400, detail="owner and mac_address are required")

    include_all_experiments = "*" in payload.experiments
    filtered_experiments = [exp for exp in payload.experiments if exp != "*"]

    if not include_all_experiments and not filtered_experiments:
        raise HTTPException(
            status_code=400,
            detail="experiments must include at least one experiment or '*'",
        )

    settings = get_settings()

    query = f"""
WITH base AS (
  SELECT
    Timestamp,
    LLA,
    Exp_Name,
    SAFE_CAST(Exp_ID AS INT64) AS Exp_ID,
    Label,
    Location,
    Variable
  FROM `{settings.sensors_data_table}`
  WHERE Owner = @owner
    AND Mac_Address = @mac_address
    AND (
      @include_all_experiments = TRUE
      OR Exp_Name IN UNNEST(@experiments)
    )
),
experiment_info AS (
  SELECT
    Exp_Name AS experiment_name,
    MAX(Exp_ID) AS experiment_id,
    MIN(Timestamp) AS first_timestamp,
    MAX(Timestamp) AS last_timestamp,
    COUNT(DISTINCT LLA) AS sensor_count,
    COUNT(*) AS row_count
  FROM base
  GROUP BY Exp_Name
),
sensor_list AS (
  SELECT
    Exp_Name AS experiment_name,
    ARRAY_AGG(DISTINCT LLA ORDER BY LLA) AS sensors
  FROM base
  GROUP BY Exp_Name
),
label_ranked AS (
  SELECT
    Exp_Name AS experiment_name,
    LLA,
    Label AS latest_label,
    ROW_NUMBER() OVER (PARTITION BY Exp_Name, LLA ORDER BY Timestamp DESC) AS rn
  FROM base
  WHERE Label IS NOT NULL AND Label != ''
),
label_list AS (
  SELECT
    experiment_name,
    ARRAY_AGG(latest_label ORDER BY latest_label) AS label_options
  FROM (
    SELECT DISTINCT experiment_name, latest_label
    FROM label_ranked
    WHERE rn = 1
  )
  GROUP BY experiment_name
),
location_list AS (
  SELECT
    Exp_Name AS experiment_name,
    ARRAY_AGG(DISTINCT Location IGNORE NULLS ORDER BY Location) AS location_options
  FROM base
  GROUP BY Exp_Name
),
parameter_list AS (
  SELECT
    Exp_Name AS experiment_name,
    ARRAY_AGG(DISTINCT Variable ORDER BY Variable) AS parameters
  FROM base
  GROUP BY Exp_Name
),
per_sensor_labels AS (
  SELECT
    experiment_name,
    LLA,
    ARRAY[latest_label] AS sensor_labels
  FROM label_ranked
  WHERE rn = 1
),
sensor_label_map_agg AS (
  SELECT
    experiment_name,
    ARRAY_AGG(
      STRUCT(LLA AS sensor_id, sensor_labels AS labels) ORDER BY LLA
    ) AS sensor_label_entries
  FROM per_sensor_labels
  GROUP BY experiment_name
),
location_ranked AS (
  SELECT
    Exp_Name AS experiment_name,
    LLA,
    Location AS latest_location,
    ROW_NUMBER() OVER (PARTITION BY Exp_Name, LLA ORDER BY Timestamp DESC) AS rn
  FROM base
  WHERE Location IS NOT NULL AND TRIM(CAST(Location AS STRING)) != ''
),
per_sensor_locations AS (
  SELECT
    experiment_name,
    LLA,
    latest_location
  FROM location_ranked
  WHERE rn = 1
),
sensor_location_map_agg AS (
  SELECT
    experiment_name,
    ARRAY_AGG(
      STRUCT(LLA AS sensor_id, latest_location AS location) ORDER BY LLA
    ) AS sensor_location_entries
  FROM per_sensor_locations
  GROUP BY experiment_name
)
SELECT
  e.experiment_name,
  e.experiment_id,
  e.first_timestamp,
  e.last_timestamp,
  e.sensor_count,
  e.row_count,
  s.sensors,
  l.label_options,
  loc.location_options,
  p.parameters,
  slm.sensor_label_entries,
  sloc.sensor_location_entries
FROM experiment_info e
LEFT JOIN sensor_list s ON e.experiment_name = s.experiment_name
LEFT JOIN label_list l ON e.experiment_name = l.experiment_name
LEFT JOIN location_list loc ON e.experiment_name = loc.experiment_name
LEFT JOIN parameter_list p ON e.experiment_name = p.experiment_name
LEFT JOIN sensor_label_map_agg slm ON e.experiment_name = slm.experiment_name
LEFT JOIN sensor_location_map_agg sloc ON e.experiment_name = sloc.experiment_name
ORDER BY e.last_timestamp DESC;
"""

    query_parameters = [
        bigquery.ScalarQueryParameter("owner", "STRING", payload.owner),
        bigquery.ScalarQueryParameter("mac_address", "STRING", payload.mac_address),
        bigquery.ScalarQueryParameter("include_all_experiments", "BOOL", include_all_experiments),
        bigquery.ArrayQueryParameter("experiments", "STRING", filtered_experiments),
    ]

    rows = run_query(query=query, query_parameters=query_parameters)

    response: list[ExperimentSummaryRow] = []
    for row in rows:
        labels = [label for label in (row["label_options"] or []) if label != ""]
        sensor_label_map = _build_sensor_label_map(row.get("sensor_label_entries"))
        label_counts = _label_counts_from_map(sensor_label_map)
        sensor_location_map = _build_sensor_location_map(row.get("sensor_location_entries"))
        response.append(
            ExperimentSummaryRow(
                experimentName=row["experiment_name"],
                experimentId=row["experiment_id"],
                firstTimestamp=row["first_timestamp"],
                lastTimestamp=row["last_timestamp"],
                sensorCount=row["sensor_count"],
                rowCount=row["row_count"],
                sensors=sorted(row["sensors"] or []),
                labelOptions=labels,
                locationOptions=row["location_options"] or [],
                parameters=sorted(row["parameters"] or []),
                sensorLabelMap=sensor_label_map,
                labelCounts=label_counts,
                sensorLocationMap=sensor_location_map,
            )
        )

    return response


def _build_sensor_location_map(entries: list | None) -> dict[str, str]:
    """Map LLA -> latest Location for that sensor."""
    if not entries:
        return {}
    out: dict[str, str] = {}
    for entry in entries:
        sid = str(entry["sensor_id"])
        loc = entry.get("location")
        if loc is not None and str(loc).strip() != "":
            out[sid] = str(loc).strip()
    return out


def _build_sensor_label_map(entries: list | None) -> dict[str, list[str]]:
    """Map LLA -> [latest label per sensor]; array kept for future multi-label."""
    if not entries:
        return {}
    out: dict[str, list[str]] = {}
    for entry in entries:
        sid = entry["sensor_id"]
        raw_labels = entry["labels"] or []
        labs = sorted({str(l) for l in raw_labels if str(l) != ""})
        out[str(sid)] = labs
    return out


def _label_counts_from_map(sensor_label_map: dict[str, list[str]]) -> dict[str, int]:
    """Count sensors per label; each sensor contributes once per label in its list (multi-label safe)."""
    counts: dict[str, int] = {}
    for labels in sensor_label_map.values():
        for lab in labels:
            s = str(lab).strip()
            if s:
                counts[s] = counts.get(s, 0) + 1
    return dict(sorted(counts.items()))
