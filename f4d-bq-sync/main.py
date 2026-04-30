import json
import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import functions_framework
from google.cloud import bigquery
from google.cloud.exceptions import NotFound


PROJECT_ID = "iucc-f4d"
DATASET_ID = "Field4D"

TABLE_CONFIG = {
    "F4D_sensors_data": {
        "timestamp_column": "Timestamp",
        "schema": [
            bigquery.SchemaField("row_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("Timestamp", "TIMESTAMP"),
            bigquery.SchemaField("TimeBucket", "INT64"),
            bigquery.SchemaField("Last_Packet_Time", "TIMESTAMP"),
            bigquery.SchemaField("LLA", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("Owner", "STRING"),
            bigquery.SchemaField("Mac_Address", "STRING"),
            bigquery.SchemaField("Time_Zone", "STRING"),
            bigquery.SchemaField("Exp_ID", "INT64"),
            bigquery.SchemaField("Exp_Name", "STRING"),
            bigquery.SchemaField("Exp_Location", "STRING"),
            bigquery.SchemaField("Label", "STRING"),
            bigquery.SchemaField("Label_Options", "STRING"),
            bigquery.SchemaField("Location", "STRING"),
            bigquery.SchemaField("RFID", "STRING"),
            bigquery.SchemaField("Coordinates_X", "FLOAT64"),
            bigquery.SchemaField("Coordinates_Y", "FLOAT64"),
            bigquery.SchemaField("Coordinates_Z", "FLOAT64"),
            bigquery.SchemaField("Variable", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("Value", "FLOAT64"),
            bigquery.SchemaField("Package_Count_3min", "INT64"),
            bigquery.SchemaField("Source", "STRING"),
        ],
        "required_row_fields": [
            "row_id",
            "Timestamp",
            "LLA",
            "Variable",
        ],
        "partition_field": "Timestamp",
        "clustering_fields": ["Owner", "Mac_Address", "Exp_Name", "LLA"],
    },
    "F4D_packet_events": {
        "timestamp_column": "Interval_Timestamp",
        "schema": [
            bigquery.SchemaField("row_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("Interval_Timestamp", "TIMESTAMP"),
            bigquery.SchemaField("TimeBucket", "INT64"),
            bigquery.SchemaField("Packet_Arrival_Time", "TIMESTAMP"),
            bigquery.SchemaField("LLA", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("Owner", "STRING"),
            bigquery.SchemaField("Mac_Address", "STRING"),
            bigquery.SchemaField("Time_Zone", "STRING"),
            bigquery.SchemaField("Exp_ID", "INT64"),
            bigquery.SchemaField("Exp_Name", "STRING"),
            bigquery.SchemaField("Exp_Location", "STRING"),
            bigquery.SchemaField("Label", "STRING"),
            bigquery.SchemaField("Label_Options", "STRING"),
            bigquery.SchemaField("Location", "STRING"),
            bigquery.SchemaField("RFID", "STRING"),
            bigquery.SchemaField("Coordinates_X", "FLOAT64"),
            bigquery.SchemaField("Coordinates_Y", "FLOAT64"),
            bigquery.SchemaField("Coordinates_Z", "FLOAT64"),
            bigquery.SchemaField("Packet_Order_In_LLA_Interval", "INT64"),
            bigquery.SchemaField("Packet_Order_Global_Interval", "INT64"),
            bigquery.SchemaField("Packet_Count_3min", "INT64"),
            bigquery.SchemaField("Source", "STRING"),
        ],
        "required_row_fields": [
            "row_id",
            "Interval_Timestamp",
            "LLA",
        ],
        "partition_field": "Interval_Timestamp",
        "clustering_fields": ["Owner", "Mac_Address", "Exp_Name", "LLA"],
    },
}

DEFAULT_INSERT_CHUNK_SIZE = 500


def json_response(payload: Dict[str, Any], status_code: int = 200):
    return (
        json.dumps(payload, default=str),
        status_code,
        {"Content-Type": "application/json"},
    )


def get_bq_client() -> bigquery.Client:
    return bigquery.Client(project=PROJECT_ID)


def get_dataset_ref() -> str:
    return f"{PROJECT_ID}.{DATASET_ID}"


def get_table_ref(table_name: str) -> str:
    return f"{PROJECT_ID}.{DATASET_ID}.{table_name}"


def validate_table_name(table_name: str) -> Optional[str]:
    if table_name not in TABLE_CONFIG:
        return f"Unsupported table_name '{table_name}'. Allowed values: {list(TABLE_CONFIG.keys())}"
    return None


def parse_request_json(request) -> Tuple[Optional[Dict[str, Any]], Optional[Tuple[str, int]]]:
    try:
        payload = request.get_json(silent=False)
    except Exception:
        return None, ("Invalid JSON body.", 400)

    if not isinstance(payload, dict):
        return None, ("Request body must be a JSON object.", 400)

    return payload, None


def check_dataset_exists(client: bigquery.Client, dataset_ref: str) -> bool:
    try:
        client.get_dataset(dataset_ref)
        return True
    except NotFound:
        return False


def ensure_dataset_exists(client: bigquery.Client) -> None:
    dataset_ref = get_dataset_ref()

    dataset = bigquery.Dataset(dataset_ref)
    dataset.location = "me-west1"

    try:
        client.create_dataset(dataset, exists_ok=True)
    except Exception as e:
        raise RuntimeError(f"Failed to ensure dataset exists: {dataset_ref}: {e}")


def check_table_exists(client: bigquery.Client, table_ref: str) -> bool:
    try:
        client.get_table(table_ref)
        return True
    except NotFound:
        return False


def ensure_table_exists(client: bigquery.Client, table_name: str) -> None:
    ensure_dataset_exists(client)

    table_ref = get_table_ref(table_name)
    config = TABLE_CONFIG[table_name]

    table = bigquery.Table(table_ref, schema=config["schema"])
    table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field=config["partition_field"],
    )
    table.clustering_fields = config["clustering_fields"]

    try:
        client.create_table(table, exists_ok=True)
    except Exception as e:
        raise RuntimeError(f"Failed to ensure table exists: {table_ref}: {e}")


def normalize_scalar(value: Any) -> Any:
    """
    Make values safe for BigQuery JSON insert.

    Rules:
    - datetime -> ISO string
    - NaN/Inf -> None
    - leave normal scalars unchanged
    """
    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None

    return value


def clean_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {k: normalize_scalar(v) for k, v in row.items()}


def chunk_rows(rows: List[Dict[str, Any]], size: int) -> List[List[Dict[str, Any]]]:
    return [rows[i:i + size] for i in range(0, len(rows), size)]


def validate_rows(table_name: str, rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    required_fields = TABLE_CONFIG[table_name]["required_row_fields"]

    cleaned_rows = []
    errors = []

    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"Row index {idx}: row must be a JSON object.")
            continue

        missing = [field for field in required_fields if row.get(field) is None]
        if missing:
            errors.append(f"Row index {idx}: missing required fields {missing}")
            continue

        cleaned_rows.append(clean_row(row))

    return cleaned_rows, errors


def handle_get_last_timestamp(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    """
    Return the latest uploaded timestamp for one logical stream.

    Expected payload:
    {
      "action": "get_last_timestamp",
      "table_name": "F4D_sensors_data",
      "owner": "f4dv2",
      "mac_address": "d83adde260d1",
      "experiment_name": "Big_Query"
    }
    """
    table_name = payload.get("table_name")
    owner = payload.get("owner")
    mac_address = payload.get("mac_address")
    experiment_name = payload.get("experiment_name")

    table_error = validate_table_name(table_name)
    if table_error:
        return {"status": "error", "message": table_error}, 400

    if not owner or not mac_address or not experiment_name:
        return {
            "status": "error",
            "message": "Missing required fields: owner, mac_address, experiment_name.",
        }, 400

    client = get_bq_client()
    table_ref = get_table_ref(table_name)

    if not check_table_exists(client, table_ref):
        return {
            "status": "success",
            "action": "get_last_timestamp",
            "table_name": table_name,
            "table_exists": False,
            "stream_exists": False,
            "last_timestamp": None,
        }, 200

    timestamp_column = TABLE_CONFIG[table_name]["timestamp_column"]

    query = f"""
        SELECT MAX({timestamp_column}) AS last_timestamp
        FROM `{table_ref}`
        WHERE Owner = @owner
          AND Mac_Address = @mac_address
          AND Exp_Name = @experiment_name
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("owner", "STRING", owner),
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address),
            bigquery.ScalarQueryParameter("experiment_name", "STRING", experiment_name),
        ]
    )

    query_job = client.query(query, job_config=job_config)
    results = list(query_job.result())

    last_timestamp = None
    if results:
        last_timestamp = results[0]["last_timestamp"]

    return {
        "status": "success",
        "action": "get_last_timestamp",
        "table_name": table_name,
        "table_exists": True,
        "stream_exists": last_timestamp is not None,
        "last_timestamp": last_timestamp.isoformat() if last_timestamp else None,
    }, 200


def handle_upload_rows(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    """
    Insert rows into BigQuery.

    Expected payload:
    {
      "action": "upload_rows",
      "table_name": "F4D_sensors_data",
      "rows": [ ... ]
    }

    Testing behavior:
    - auto-create dataset/table if missing
    - append rows directly with insert_rows_json
    """
    table_name = payload.get("table_name")
    rows = payload.get("rows")

    table_error = validate_table_name(table_name)
    if table_error:
        return {"status": "error", "message": table_error}, 400

    if not isinstance(rows, list) or not rows:
        return {
            "status": "error",
            "message": "Missing required field: rows (non-empty list).",
        }, 400

    cleaned_rows, validation_errors = validate_rows(table_name, rows)
    if validation_errors:
        return {
            "status": "error",
            "action": "upload_rows",
            "message": "Row validation failed.",
            "validation_error_count": len(validation_errors),
            "validation_errors": validation_errors[:20],
        }, 400

    client = get_bq_client()
    table_ref = get_table_ref(table_name)

    try:
        ensure_table_exists(client, table_name)
    except Exception as e:
        return {
            "status": "error",
            "action": "upload_rows",
            "table_name": table_name,
            "message": f"Failed while ensuring dataset/table exists: {e}",
        }, 500

    inserted_rows = 0
    chunk_errors = []

    for chunk_index, chunk in enumerate(chunk_rows(cleaned_rows, DEFAULT_INSERT_CHUNK_SIZE), start=1):
        try:
            errors = client.insert_rows_json(table_ref, chunk)
        except NotFound:
            try:
                ensure_table_exists(client, table_name)
                errors = client.insert_rows_json(table_ref, chunk)
            except Exception as e:
                return {
                    "status": "error",
                    "action": "upload_rows",
                    "table_name": table_name,
                    "message": f"Insert failed after recreate attempt on chunk {chunk_index}: {e}",
                }, 500
        except Exception as e:
            return {
                "status": "error",
                "action": "upload_rows",
                "table_name": table_name,
                "message": f"Unexpected insert exception on chunk {chunk_index}: {e}",
            }, 500

        if errors:
            chunk_errors.append({
                "chunk_index": chunk_index,
                "errors": errors,
            })
        else:
            inserted_rows += len(chunk)

    if chunk_errors:
        return {
            "status": "partial_error",
            "action": "upload_rows",
            "table_name": table_name,
            "requested_rows": len(rows),
            "validated_rows": len(cleaned_rows),
            "inserted_rows": inserted_rows,
            "error_chunks": len(chunk_errors),
            "chunk_errors": chunk_errors[:10],
        }, 207

    return {
        "status": "success",
        "action": "upload_rows",
        "table_name": table_name,
        "requested_rows": len(rows),
        "validated_rows": len(cleaned_rows),
        "inserted_rows": inserted_rows,
    }, 200


@functions_framework.http
def f4d_bq_sync(request):
    """
    Unified Field4D BigQuery sync function.

    Supported actions:
    - get_last_timestamp
    - upload_rows

    Notes:
    - no authentication yet
    - auto-creates tables during testing
    - shared BigQuery tables for all owners/devices/experiments
    """
    if request.method != "POST":
        return json_response(
            {"status": "error", "message": "Only POST is supported."},
            405,
        )

    payload, parse_error = parse_request_json(request)
    if parse_error:
        message, code = parse_error
        return json_response({"status": "error", "message": message}, code)

    action = payload.get("action")

    if action == "get_last_timestamp":
        body, status = handle_get_last_timestamp(payload)
        return json_response(body, status)

    if action == "upload_rows":
        body, status = handle_upload_rows(payload)
        return json_response(body, status)

    return json_response(
        {
            "status": "error",
            "message": "Unsupported action. Allowed values: get_last_timestamp, upload_rows",
        },
        400,
    )