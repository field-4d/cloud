"""
Test script for:
GET /phone-app/NFC/fetch-data?lla=<LLA>

Reads LLAs from a CSV template and validates response payload.

Install:
    pip install requests

Usage:
    python test_script/8.test_phone_app_nfc.py
    python test_script/8.test_phone_app_nfc.py "C:/path/to/template.csv"
"""
import csv
import io
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List

import requests


# Fix Windows console encoding for emoji/special output
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(line_buffering=True)


BASE_URL = "https://apisync-1000435921680.us-central1.run.app"
ENDPOINT_PATH = "/phone-app/NFC/fetch-data"
DEFAULT_CSV_PATH = r"C:\Users\nir\Downloads\sensor_metadata_template_menachem_moshelion_d83adde26283.csv"
REQUEST_TIMEOUT_SEC = 15


def read_template_rows(csv_path: str) -> List[Dict[str, str]]:
    """Read sensor rows from CSV template."""
    rows: List[Dict[str, str]] = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = {"lla", "owner", "mac_address"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV missing required columns: {sorted(missing)}")

        for row in reader:
            lla = (row.get("lla") or "").strip()
            if not lla:
                continue
            rows.append(
                {
                    "lla": lla,
                    "owner": (row.get("owner") or "").strip(),
                    "mac_address": (row.get("mac_address") or "").strip(),
                    "exp_name": (row.get("exp_name") or "").strip(),
                    "label": (row.get("label") or "").strip(),
                }
            )
    return rows


def _parse_iso_datetime(value: str) -> datetime:
    """Parse ISO datetime string (supports trailing Z)."""
    text = (value or "").strip()
    if not text:
        raise ValueError("empty timestamp")
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def test_single_lla(row: Dict[str, str]) -> Dict[str, str]:
    """Call endpoint for one LLA and validate JSON + Last_Seen recency."""
    lla = row["lla"]
    url = f"{BASE_URL}{ENDPOINT_PATH}"
    params = {"lla": lla}

    started = time.time()
    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SEC)
    duration = time.time() - started

    result = {
        "lla": lla,
        "ok": False,
        "status_code": str(response.status_code),
        "duration_sec": f"{duration:.3f}",
        "last_seen_status": "⚪ unknown",
        "error": "",
    }

    if response.status_code != 200:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        result["error"] = f"HTTP {response.status_code}: {detail}"
        return result

    try:
        body = response.json()
    except Exception as exc:
        result["error"] = f"Invalid JSON response: {exc}"
        return result

    data = body.get("data")
    if not isinstance(data, list) or len(data) != 1:
        result["error"] = f"Expected data list with 1 item, got: {type(data).__name__} ({len(data) if isinstance(data, list) else 'n/a'})"
        return result

    payload = data[0]
    last_seen_raw = str(payload.get("Last_Seen", "")).strip()
    if not last_seen_raw:
        result["error"] = "Missing Last_Seen in response payload"
        return result

    try:
        last_seen_dt = _parse_iso_datetime(last_seen_raw)
    except Exception as exc:
        result["error"] = f"Invalid Last_Seen format: {last_seen_raw} ({exc})"
        return result

    now_utc = datetime.now(timezone.utc)
    if last_seen_dt < (now_utc - timedelta(hours=1)):
        result["last_seen_status"] = "🔴 >last_hour"
        result["error"] = (
            f"Last_Seen older than 1 hour: {last_seen_raw} "
            f"(now={now_utc.isoformat()})"
        )
        return result

    result["last_seen_status"] = "🟢 <last_hour"
    result["ok"] = True
    return result


def run(csv_path: str) -> int:
    """Run full CSV-driven endpoint test."""
    print("=" * 72, flush=True)
    print("PHONE-APP NFC ENDPOINT TEST (JSON + LAST_SEEN <= 1H)", flush=True)
    print("=" * 72, flush=True)
    print(f"Base URL     : {BASE_URL}", flush=True)
    print(f"Endpoint     : {ENDPOINT_PATH}", flush=True)
    print(f"CSV Path     : {csv_path}", flush=True)

    if not os.path.exists(csv_path):
        print(f"❌ CSV file not found: {csv_path}", flush=True)
        return 1

    try:
        rows = read_template_rows(csv_path)
    except Exception as exc:
        print(f"❌ Failed reading CSV: {exc}", flush=True)
        return 1

    if not rows:
        print("❌ CSV contains no usable rows (missing/empty lla).", flush=True)
        return 1

    print(f"Rows loaded   : {len(rows)}", flush=True)
    print("Validation    : valid JSON + data[0].Last_Seen within last 1 hour", flush=True)
    print("-" * 72, flush=True)

    passed = 0
    failed = 0
    failed_rows: List[Dict[str, str]] = []

    for idx, row in enumerate(rows, start=1):
        result = test_single_lla(row)
        if result["ok"]:
            passed += 1
            print(
                f"✅ [{idx:02d}/{len(rows)}] {result['lla']} | {result['status_code']} | {result['duration_sec']}s | {result['last_seen_status']}",
                flush=True,
            )
        else:
            failed += 1
            failed_rows.append(result)
            print(
                f"❌ [{idx:02d}/{len(rows)}] {result['lla']} | {result['status_code']} | {result['duration_sec']}s | {result['last_seen_status']} | {result['error']}",
                flush=True,
            )

    print("-" * 72, flush=True)
    print(f"Passed: {passed}", flush=True)
    print(f"Failed: {failed}", flush=True)

    if failed_rows:
        print("\nFailed details:", flush=True)
        for item in failed_rows[:10]:
            print(f"  - {item['lla']}: {item['error']}", flush=True)
        if len(failed_rows) > 10:
            print(f"  ... and {len(failed_rows) - 10} more failures", flush=True)

    print("=" * 72, flush=True)
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    csv_arg = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV_PATH
    raise SystemExit(run(csv_arg))

