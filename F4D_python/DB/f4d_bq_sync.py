#!/usr/bin/env python3
"""
Manual DuckDB -> BigQuery sync for Field4D.

Location:
    /home/pi/F4D/DB/f4d_bq_sync.py
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional

import duckdb


ENV_PATH = "/home/pi/F4D/.env"
DB_PATH = "/home/pi/F4D/DB/local.duckdb"
DEFAULT_BATCH_SIZE = 500
HTTP_TIMEOUT_SECONDS = 60


TABLE_CONFIG: Dict[str, Dict[str, str]] = {
    "sensors_data": {
        "duckdb_table": "sensors_data",
        "bq_table": "F4D_sensors_data",
        "incremental_column": "Timestamp",
        "order_by": "Timestamp ASC, row_id ASC",
    },
    "packet_events": {
        "duckdb_table": "packet_events",
        "bq_table": "F4D_packet_events",
        "incremental_column": "Interval_Timestamp",
        "order_by": "Interval_Timestamp ASC, row_id ASC",
    },
}


def log(message: str) -> None:
    print(f"[BQ_SYNC] {message}")


def load_env_file(env_path: str) -> Dict[str, str]:
    env: Dict[str, str] = {}

    if not os.path.exists(env_path):
        raise FileNotFoundError(f".env file not found: {env_path}")

    with open(env_path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()

            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")

    return env


def require_env(env: Dict[str, str], key: str) -> str:
    value = env.get(key, "").strip()
    if not value:
        raise ValueError(f"Missing required env key: {key}")
    return value


def post_json(url: str, payload: Dict[str, Any], timeout: int = HTTP_TIMEOUT_SECONDS) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return {"http_status": resp.status, "raw_text": ""}
            data = json.loads(raw)
            if isinstance(data, dict):
                data["_http_status"] = resp.status
                return data
            return {
                "_http_status": resp.status,
                "status": "unexpected_response_shape",
                "data": data,
            }

    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"raw_text": raw}

        return {
            "status": "http_error",
            "http_status": e.code,
            "error": parsed,
        }

    except urllib.error.URLError as e:
        return {
            "status": "network_error",
            "error": str(e),
        }


def get_db_connection(db_path: str) -> duckdb.DuckDBPyConnection:
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"DuckDB file not found: {db_path}")
    return duckdb.connect(db_path, read_only=True)


def table_exists(con: duckdb.DuckDBPyConnection, table_name: str) -> bool:
    sql = """
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = 'main'
      AND table_name = ?
    """
    count = con.execute(sql, [table_name]).fetchone()[0]
    return count > 0


def get_columns(con: duckdb.DuckDBPyConnection, table_name: str) -> List[str]:
    rows = con.execute(f"DESCRIBE {table_name}").fetchall()
    return [row[0] for row in rows]


def normalize_value(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.isoformat(sep="T", timespec="seconds")

    if isinstance(value, date):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value

    if isinstance(value, (list, dict)):
        return value

    return value


def rows_to_dicts(columns: List[str], rows: Iterable[Iterable[Any]]) -> List[Dict[str, Any]]:
    output: List[Dict[str, Any]] = []
    for row in rows:
        item = {}
        for col, value in zip(columns, row):
            item[col] = normalize_value(value)
        output.append(item)
    return output


def chunk_list(items: List[Dict[str, Any]], chunk_size: int) -> List[List[Dict[str, Any]]]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    return [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]


def fetch_last_timestamp(
    sync_url: str,
    bq_table_name: str,
    owner: str,
    mac_address: str,
    experiment_name: str,
) -> Optional[str]:
    payload = {
        "action": "get_last_timestamp",
        "table_name": bq_table_name,
        "owner": owner,
        "mac_address": mac_address,
        "experiment_name": experiment_name,
    }

    response = post_json(sync_url, payload)

    if response.get("status") == "success":
        table_exists_flag = response.get("table_exists")
        stream_exists_flag = response.get("stream_exists")
        last_timestamp = response.get("last_timestamp")

        log(
            f"Cloud get_last_timestamp ok "
            f"(table_exists={table_exists_flag}, stream_exists={stream_exists_flag}, "
            f"last_timestamp={last_timestamp})"
        )
        return last_timestamp

    raise RuntimeError(f"get_last_timestamp failed: {json.dumps(response, ensure_ascii=False)}")


def build_select_query(
    duckdb_table: str,
    columns: List[str],
    incremental_column: str,
    order_by: str,
    has_last_timestamp: bool,
    use_limit: bool,
) -> str:
    selected_columns = ", ".join([f'"{c}"' for c in columns])

    sql = f"""
    SELECT {selected_columns}
    FROM {duckdb_table}
    WHERE "Owner" = ?
      AND "Mac_Address" = ?
      AND "Exp_Name" = ?
    """

    if has_last_timestamp:
        sql += f'\n  AND "{incremental_column}" > CAST(? AS TIMESTAMP)'

    sql += f"\nORDER BY {order_by}"

    if use_limit:
        sql += "\nLIMIT ?"

    return sql


def query_new_rows_from_duckdb(
    con: duckdb.DuckDBPyConnection,
    table_name: str,
    owner: str,
    mac_address: str,
    experiment_name: str,
    last_timestamp: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    config = TABLE_CONFIG[table_name]
    duckdb_table = config["duckdb_table"]
    incremental_column = config["incremental_column"]
    order_by = config["order_by"]

    if not table_exists(con, duckdb_table):
        raise RuntimeError(f"Local DuckDB table does not exist: {duckdb_table}")

    columns = get_columns(con, duckdb_table)

    sql = build_select_query(
        duckdb_table=duckdb_table,
        columns=columns,
        incremental_column=incremental_column,
        order_by=order_by,
        has_last_timestamp=bool(last_timestamp),
        use_limit=limit is not None,
    )

    params: List[Any] = [owner, mac_address, experiment_name]
    if last_timestamp:
        params.append(last_timestamp)
    if limit is not None:
        params.append(limit)

    rows = con.execute(sql, params).fetchall()
    return rows_to_dicts(columns, rows)


def upload_batch(sync_url: str, bq_table_name: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    payload = {
        "action": "upload_rows",
        "table_name": bq_table_name,
        "rows": rows,
    }
    return post_json(sync_url, payload)


def get_range_for_rows(rows: List[Dict[str, Any]], incremental_column: str) -> tuple[Optional[str], Optional[str]]:
    if not rows:
        return None, None

    first_value = rows[0].get(incremental_column)
    last_value = rows[-1].get(incremental_column)
    return first_value, last_value


def sync_one_table(
    con: duckdb.DuckDBPyConnection,
    sync_url: str,
    table_name: str,
    owner: str,
    mac_address: str,
    experiment_name: str,
    limit: Optional[int],
    batch_size: int,
    dry_run: bool,
) -> Dict[str, Any]:
    if table_name not in TABLE_CONFIG:
        raise ValueError(f"Unsupported table: {table_name}")

    config = TABLE_CONFIG[table_name]
    bq_table_name = config["bq_table"]
    incremental_column = config["incremental_column"]

    log(
        f"START table={table_name} exp={experiment_name} owner={owner} mac={mac_address} "
        f"dry_run={dry_run}"
    )

    last_timestamp = fetch_last_timestamp(
        sync_url=sync_url,
        bq_table_name=bq_table_name,
        owner=owner,
        mac_address=mac_address,
        experiment_name=experiment_name,
    )

    rows = query_new_rows_from_duckdb(
        con=con,
        table_name=table_name,
        owner=owner,
        mac_address=mac_address,
        experiment_name=experiment_name,
        last_timestamp=last_timestamp,
        limit=limit,
    )

    selected_rows = len(rows)
    first_ts, last_ts = get_range_for_rows(rows, incremental_column)
    total_batches = math.ceil(selected_rows / batch_size) if selected_rows else 0

    log(f"Local rows selected for {table_name}: {selected_rows}")
    log(
        f"Selection summary table={table_name} incremental_column={incremental_column} "
        f"first={first_ts} last={last_ts} batches={total_batches} batch_size={batch_size}"
    )

    if not rows:
        log(f"Nothing to upload for {table_name}")
        return {
            "table": table_name,
            "selected_rows": 0,
            "uploaded_rows": 0,
            "failed_batches": 0,
            "dry_run": dry_run,
            "first_selected_timestamp": None,
            "last_selected_timestamp": None,
            "total_batches": 0,
            "batch_size": batch_size,
        }

    if dry_run:
        log(f"DRY RUN: no upload performed for {table_name}")
        return {
            "table": table_name,
            "selected_rows": selected_rows,
            "uploaded_rows": 0,
            "failed_batches": 0,
            "dry_run": True,
            "first_selected_timestamp": first_ts,
            "last_selected_timestamp": last_ts,
            "total_batches": total_batches,
            "batch_size": batch_size,
        }

    batches = chunk_list(rows, batch_size)
    uploaded_rows = 0
    failed_batches = 0

    for idx, batch in enumerate(batches, start=1):
        batch_first, batch_last = get_range_for_rows(batch, incremental_column)
        log(
            f"Uploading {table_name} batch {idx}/{len(batches)} size={len(batch)} "
            f"first={batch_first} last={batch_last}"
        )

        response = upload_batch(
            sync_url=sync_url,
            bq_table_name=bq_table_name,
            rows=batch,
        )

        if response.get("status") == "success":
            uploaded_rows += len(batch)
            log(f"Batch {idx} success")
            continue

        failed_batches += 1
        log(f"Batch {idx} FAILED: {json.dumps(response, ensure_ascii=False)}")
        raise RuntimeError(
            f"Upload failed for {table_name} batch {idx}/{len(batches)}: "
            f"{json.dumps(response, ensure_ascii=False)}"
        )

    log(
        f"DONE table={table_name} uploaded={uploaded_rows} failed_batches={failed_batches} "
        f"first={first_ts} last={last_ts}"
    )

    return {
        "table": table_name,
        "selected_rows": selected_rows,
        "uploaded_rows": uploaded_rows,
        "failed_batches": failed_batches,
        "dry_run": False,
        "first_selected_timestamp": first_ts,
        "last_selected_timestamp": last_ts,
        "total_batches": total_batches,
        "batch_size": batch_size,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manual DuckDB -> BigQuery sync for Field4D")
    parser.add_argument(
        "--table",
        required=True,
        choices=["sensors_data", "packet_events", "both"],
        help="Which table to sync",
    )
    parser.add_argument(
        "--exp",
        required=True,
        help="Experiment name (must match Exp_Name in DuckDB / cloud filter)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional row limit for manual testing",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Upload batch size (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--owner",
        default=None,
        help="Override HOSTNAME from .env",
    )
    parser.add_argument(
        "--mac",
        default=None,
        help="Override MAC_ADDRESS from .env",
    )
    parser.add_argument(
        "--sync-url",
        default=None,
        help="Override F4D_BQ_SYNC_URL from .env",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be uploaded, but do not send anything",
    )
    return parser.parse_args()


def main() -> int:
    con: Optional[duckdb.DuckDBPyConnection] = None

    try:
        args = parse_args()
        env = load_env_file(ENV_PATH)

        owner = args.owner or require_env(env, "HOSTNAME")
        mac_address = args.mac or require_env(env, "MAC_ADDRESS")
        sync_url = args.sync_url or require_env(env, "F4D_BQ_SYNC_URL")

        if args.batch_size <= 0:
            raise ValueError("--batch-size must be > 0")

        log(f"Using ENV_PATH={ENV_PATH}")
        log(f"Using DB_PATH={DB_PATH}")
        log(f"Using sync URL={sync_url}")
        log(f"Dry run mode={args.dry_run}")

        con = get_db_connection(DB_PATH)

        tables_to_run = ["sensors_data", "packet_events"] if args.table == "both" else [args.table]

        results: List[Dict[str, Any]] = []

        for table_name in tables_to_run:
            result = sync_one_table(
                con=con,
                sync_url=sync_url,
                table_name=table_name,
                owner=owner,
                mac_address=mac_address,
                experiment_name=args.exp,
                limit=args.limit,
                batch_size=args.batch_size,
                dry_run=args.dry_run,
            )
            results.append(result)

        log("SUMMARY")
        for result in results:
            log(json.dumps(result, ensure_ascii=False))

        return 0

    except KeyboardInterrupt:
        log("Interrupted by user")
        return 130

    except Exception as e:
        log(f"FATAL: {e}")
        return 1

    finally:
        if con is not None:
            con.close()


if __name__ == "__main__":
    sys.exit(main())