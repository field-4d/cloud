"""Compact Firestore-first Field4D Cloud Function.

Entrypoint: send_daily_reports

- Checks every Owner + MAC in F4D_mac_to_device.
- Builds the complete system state before applying email permissions.
- Sends all system_admin users the full report.
- Sends Ori and Sara only the scopes allowed by F4D_permissions.
- Displays every sensor where Is_Active=True and Is_Valid=True.
"""

from __future__ import annotations

import html
import re
from typing import Any

import pandas as pd
import requests
from google.cloud import bigquery

PROJECT_ID = "iucc-f4d"
DEVICE_TABLE = "`iucc-f4d.Field4D.F4D_mac_to_device`"
PERMISSIONS_TABLE = "`iucc-f4d.Field4D.F4D_permissions`"
SENSOR_TABLE = "`iucc-f4d.Field4D.F4D_sensors_data`"

FS_EXPERIMENTS_API = (
    "https://apisync-1000435921680.us-central1.run.app/"
    "GCP-FS/metadata/experiments"
)
FS_LAST_PACKAGE_API = (
    "https://apisync-1000435921680.us-central1.run.app/"
    "GCP-FS/last-package"
)
EMAIL_API_URL = "https://f4d-email-sender-1000435921680.europe-west1.run.app"

FIXED_RECIPIENTS = {
    "ori1409@gmail.com",
    "sara.post@mail.huji.ac.il",
}

TZ = "Asia/Jerusalem"
LOW_BATTERY_MV = 2700.0
PACKET_MINUTES = 3
FULL_DAY_PACKETS = 480
BQ_HOURS = 25
CALC_HOURS = 24
ACTIVE_MINUTES = 15
HTTP_TIMEOUT = 30

RESULT_COLUMNS = [
    "Owner", "Mac_Address", "Device_Name", "Exp_Name",
    "Firestore_Active_Count", "Location", "LLA", "Last_Seen",
    "Is_Transmitting_Now", "Expected_Packets", "Actual_Packets",
    "Packet_Loss_Percentage", "Battery_Measurement_Count",
    "Low_Battery_Count", "Low_Battery_Percentage", "Battery_Status",
    "Sensor_Window_Start", "Experiment_Status",
]


def txt(value: Any) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def pick(record: dict[str, Any], *keys: str, default: Any = None) -> Any:
    return next(
        (record[key] for key in keys if key in record and record[key] is not None),
        default,
    )


def truthy(value: Any) -> bool:
    return value is True or txt(value).lower() == "true"


def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def natural_key(value: Any) -> list[Any]:
    return [
        int(part) if part.isdigit() else part.lower()
        for part in re.split(r"(\d+)", str(value))
    ]


def sql_list(values: set[str] | list[str]) -> str:
    return ", ".join(
        "'" + txt(value).replace("'", "''") + "'"
        for value in sorted(values)
    )


def extract_list(payload: Any, key: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    value = payload.get(key)
    if not isinstance(value, list):
        value = payload.get("data")
    return value if isinstance(value, list) else []


def exp_name(sensor: dict[str, Any]) -> str:
    return txt(pick(sensor, "Exp_Name", "exp_name", "Experiment", "experiment"))


def same_experiment(sensor: dict[str, Any], name: str) -> bool:
    sensor_exp = exp_name(sensor)
    return not sensor_exp or sensor_exp == name


def fs_battery(sensor: dict[str, Any]) -> Any:
    package = pick(sensor, "Last_Package", "last_package", default={})
    return pick(package, "battery", "Battery") if isinstance(package, dict) else None


def device_label(name: Any, mac: Any) -> str:
    name, mac = txt(name), txt(mac).lower()
    if not name:
        return mac
    return name if mac and mac in name.lower() else f"{name} ({mac})"


def parse_wall(value: Any) -> pd.Timestamp | None:
    """Remove a timezone label without changing the displayed clock value."""
    if value is None or value == "":
        return None
    value = pd.to_datetime(value, errors="coerce")
    if pd.isna(value):
        return None
    value = pd.Timestamp(value)
    return value.tz_localize(None) if value.tzinfo is not None else value


def parse_fs(value: Any) -> pd.Timestamp | None:
    """Interpret Firestore time as UTC, then convert to Israel local time."""
    if value is None or value == "":
        return None
    value = pd.to_datetime(value, errors="coerce")
    if pd.isna(value):
        return None
    value = pd.Timestamp(value)
    if value.tzinfo is None:
        value = value.tz_localize("UTC")
    return value.tz_convert(TZ).tz_localize(None)


def wall_series(series: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce")
    if isinstance(parsed.dtype, pd.DatetimeTZDtype):
        parsed = parsed.dt.tz_localize(None)
    return parsed


def fmt_time(value: Any) -> str:
    value = parse_wall(value)
    return "Unknown" if value is None else value.strftime("%Y-%m-%d %H:%M:%S")


def fmt_battery(value: Any) -> str:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return "Unavailable"
    return f"{int(value)} mV" if value.is_integer() else f"{value:.1f} mV"


def load_devices(client: bigquery.Client) -> pd.DataFrame:
    query = f"""
    SELECT TRIM(Owner) Owner, LOWER(TRIM(Mac_Address)) Mac_Address,
           ARRAY_AGG(NULLIF(TRIM(Device_Name), '') IGNORE NULLS LIMIT 1)
             [SAFE_OFFSET(0)] Device_Name
    FROM {DEVICE_TABLE}
    WHERE NULLIF(TRIM(Owner), '') IS NOT NULL
      AND NULLIF(TRIM(Mac_Address), '') IS NOT NULL
    GROUP BY Owner, Mac_Address
    ORDER BY Owner, Mac_Address
    """
    df = client.query(query).to_dataframe()
    if df.empty:
        return pd.DataFrame(columns=["Owner", "Mac_Address", "Device_Name"])
    for column in ["Owner", "Mac_Address", "Device_Name"]:
        df[column] = df[column].map(txt)
    df["Mac_Address"] = df["Mac_Address"].str.lower()
    return df.drop_duplicates(["Owner", "Mac_Address"]).reset_index(drop=True)


def load_access(
    client: bigquery.Client,
) -> tuple[pd.DataFrame, set[str], list[str]]:
    """Return active permission rows, system admins, and final recipients."""
    fixed_sql = sql_list(FIXED_RECIPIENTS)
    query = f"""
    SELECT DISTINCT
      LOWER(TRIM(Email)) Email,
      TRIM(Owner) Owner,
      LOWER(TRIM(Mac_Address)) Mac_Address,
      TRIM(Experiment) Experiment,
      LOWER(TRIM(Role)) Role
    FROM {PERMISSIONS_TABLE}
    WHERE Email IS NOT NULL
      AND (
        LOWER(TRIM(Role)) = 'system_admin'
        OR LOWER(TRIM(Email)) IN ({fixed_sql})
      )
      AND (Valid_From IS NULL OR CAST(Valid_From AS TIMESTAMP) <= CURRENT_TIMESTAMP())
      AND (Valid_Until IS NULL OR CAST(Valid_Until AS TIMESTAMP) >= CURRENT_TIMESTAMP())
    """
    df = client.query(query).to_dataframe()
    columns = ["Email", "Owner", "Mac_Address", "Experiment", "Role"]
    if df.empty:
        return pd.DataFrame(columns=columns), set(), []

    for column in columns:
        df[column] = df[column].map(txt)
    df["Email"] = df["Email"].str.lower()
    df["Mac_Address"] = df["Mac_Address"].str.lower()
    df["Role"] = df["Role"].str.lower()

    system_admins = set(df.loc[df["Role"] == "system_admin", "Email"])
    fixed_with_permissions = FIXED_RECIPIENTS & set(df["Email"])
    recipients = sorted(system_admins | fixed_with_permissions)
    return df.drop_duplicates().reset_index(drop=True), system_admins, recipients


def api_get(url: str, params: dict[str, str], key: str) -> list[dict[str, Any]]:
    response = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    return extract_list(response.json(), key)


def fetch_experiments(owner: str, mac: str) -> list[dict[str, Any]]:
    return api_get(
        FS_EXPERIMENTS_API,
        {"owner": owner, "mac_address": mac},
        "experiments",
    )


def fetch_sensors(owner: str, mac: str, experiment: str) -> list[dict[str, Any]]:
    return api_get(
        FS_LAST_PACKAGE_API,
        {"owner": owner, "mac_address": mac, "exp_name": experiment},
        "data",
    )


def discover_experiments(devices: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    print("[INFO] Checking every Owner + MAC in Firestore...")

    for device in devices.to_dict("records"):
        owner = txt(device["Owner"])
        mac = txt(device["Mac_Address"]).lower()
        name = txt(device["Device_Name"]) or mac
        try:
            experiments = fetch_experiments(owner, mac)
        except Exception as exc:
            print(f"[ERROR] Experiments failed for {owner}/{mac}: {exc}")
            continue

        active = 0
        for experiment in experiments:
            name_exp = txt(pick(experiment, "exp_name", "Exp_Name"))
            count = as_int(pick(experiment, "active_count", "Active_Count"))
            if not name_exp or count <= 0:
                continue
            active += 1
            rows.append({
                "Owner": owner,
                "Mac_Address": mac,
                "Device_Name": name,
                "Exp_Name": name_exp,
                "Active_Count": count,
                "Replaced_Count": as_int(
                    pick(experiment, "replaced_count", "Replaced_Count")
                ),
                "Exp_Started_At": pick(
                    experiment, "exp_started_at", "Exp_Started_At"
                ),
            })
        print(f"[INFO] {device_label(name, mac)}: {active} active experiment(s)")

    columns = [
        "Owner", "Mac_Address", "Device_Name", "Exp_Name",
        "Active_Count", "Replaced_Count", "Exp_Started_At",
    ]
    if not rows:
        return pd.DataFrame(columns=columns)
    return pd.DataFrame(rows, columns=columns).drop_duplicates(
        ["Owner", "Mac_Address", "Exp_Name"]
    ).reset_index(drop=True)


def replacement_map(
    sensors: list[dict[str, Any]],
    experiment: str,
    replaced_count: int,
) -> dict[str, pd.Timestamp]:
    if replaced_count <= 0:
        return {}
    result: dict[str, pd.Timestamp] = {}
    for sensor in sensors:
        if not same_experiment(sensor, experiment):
            continue
        location = txt(pick(sensor, "Location", "location"))
        if not location.endswith("-replaced"):
            continue
        updated = parse_fs(pick(sensor, "Updated_At", "updated_at"))
        if updated is None:
            continue
        location = location[:-len("-replaced")]
        updated = updated.ceil(f"{PACKET_MINUTES}min")
        if location not in result or updated > result[location]:
            result[location] = updated
    return result


def expected_window(
    now: pd.Timestamp,
    started_at: Any,
    replaced_at: pd.Timestamp | None,
) -> tuple[pd.Timestamp, int]:
    rolling = now - pd.Timedelta(hours=CALC_HOURS)
    started = parse_wall(started_at)
    start = started.ceil(f"{PACKET_MINUTES}min") if started and started > rolling else rolling
    if replaced_at is not None and replaced_at > rolling:
        start = max(start, replaced_at.ceil(f"{PACKET_MINUTES}min"))
    if start <= rolling:
        return rolling, FULL_DAY_PACKETS
    elapsed = max(0.0, (now - start).total_seconds())
    expected = int(elapsed // (PACKET_MINUTES * 60)) + 1
    return start, min(expected, FULL_DAY_PACKETS)


def prepare_sensors(experiments: pd.DataFrame, now: pd.Timestamp) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    print("[INFO] Reading Firestore sensors...")

    for experiment in experiments.to_dict("records"):
        owner, mac = experiment["Owner"], experiment["Mac_Address"]
        name_exp = experiment["Exp_Name"]
        try:
            all_sensors = fetch_sensors(owner, mac, name_exp)
        except Exception as exc:
            print(f"[ERROR] Sensors failed for {owner}/{mac}/{name_exp}: {exc}")
            continue

        relevant = [s for s in all_sensors if same_experiment(s, name_exp)]
        replacements = replacement_map(
            relevant, name_exp, as_int(experiment["Replaced_Count"])
        )
        current = [
            sensor for sensor in relevant
            if truthy(pick(sensor, "Is_Active", "is_active", default=False))
            and truthy(pick(sensor, "Is_Valid", "is_valid", default=False))
        ]
        print(
            f"[INFO] {device_label(experiment['Device_Name'], mac)} / {name_exp}: "
            f"{len(current)} displayed; endpoint active_count={experiment['Active_Count']}"
        )

        for sensor in current:
            location = txt(pick(sensor, "Location", "location"))
            start, expected = expected_window(
                now, experiment["Exp_Started_At"], replacements.get(location)
            )
            rows.append({
                **experiment,
                "LLA": txt(pick(sensor, "LLA", "lla")),
                "Location": location,
                "FS_Last_Seen": parse_fs(pick(sensor, "Last_Seen", "last_seen")),
                "FS_Last_Battery": fs_battery(sensor),
                "Sensor_Window_Start": start,
                "Expected_Packets": expected,
            })

    columns = [
        "Owner", "Mac_Address", "Device_Name", "Exp_Name", "Active_Count",
        "Replaced_Count", "Exp_Started_At", "LLA", "Location",
        "FS_Last_Seen", "FS_Last_Battery", "Sensor_Window_Start",
        "Expected_Packets",
    ]
    return pd.DataFrame(rows, columns=columns) if rows else pd.DataFrame(columns=columns)


def query_battery(client: bigquery.Client, now: pd.Timestamp) -> pd.DataFrame:
    now_sql = now.strftime("%Y-%m-%d %H:%M:%S")
    query = f"""
    WITH Inventory AS (
      SELECT TRIM(Owner) Owner, LOWER(TRIM(Mac_Address)) Mac_Address,
             ARRAY_AGG(NULLIF(TRIM(Device_Name), '') IGNORE NULLS LIMIT 1)
               [SAFE_OFFSET(0)] Device_Name
      FROM {DEVICE_TABLE}
      WHERE NULLIF(TRIM(Owner), '') IS NOT NULL
        AND NULLIF(TRIM(Mac_Address), '') IS NOT NULL
      GROUP BY Owner, Mac_Address
    )
    SELECT i.Owner, i.Mac_Address,
           IFNULL(i.Device_Name, i.Mac_Address) Device_Name,
           d.Exp_Name, d.LLA, d.Location, d.Timestamp,
           SAFE_CAST(d.Value AS FLOAT64) Value,
           IFNULL(d.Time_Zone, '{TZ}') Time_Zone
    FROM {SENSOR_TABLE} d
    JOIN Inventory i
      ON d.Owner = i.Owner AND LOWER(d.Mac_Address) = i.Mac_Address
    WHERE NULLIF(TRIM(d.Exp_Name), '') IS NOT NULL
      AND d.Variable = 'battery'
      AND d.Timestamp BETWEEN
          TIMESTAMP_SUB(TIMESTAMP('{now_sql}+00'), INTERVAL {BQ_HOURS} HOUR)
          AND TIMESTAMP('{now_sql}+00')
    ORDER BY i.Owner, i.Mac_Address, d.Exp_Name, d.LLA, d.Timestamp
    """
    print("[INFO] Reading one 25-hour BigQuery battery dataset...")
    df = client.query(query).to_dataframe()
    columns = [
        "Owner", "Mac_Address", "Device_Name", "Exp_Name", "LLA",
        "Location", "Timestamp", "Value", "Time_Zone",
    ]
    if df.empty:
        return pd.DataFrame(columns=columns)
    for column in [
        "Owner", "Mac_Address", "Device_Name", "Exp_Name",
        "LLA", "Location", "Time_Zone",
    ]:
        df[column] = df[column].map(txt)
    df["Mac_Address"] = df["Mac_Address"].str.lower()
    df["Timestamp"] = wall_series(df["Timestamp"])
    df["Value"] = pd.to_numeric(df["Value"], errors="coerce")
    return df.dropna(subset=["Timestamp", "Owner", "Mac_Address", "Exp_Name", "LLA"])


def detect_stopped(
    active_experiments: pd.DataFrame,
    battery: pd.DataFrame,
    now: pd.Timestamp,
) -> pd.DataFrame:
    columns = [
        "Owner", "Mac_Address", "Device_Name", "Exp_Name",
        "Last_BQ_Timestamp", "Experiment_Status",
    ]
    if battery.empty:
        return pd.DataFrame(columns=columns)

    active = {
        (row.Owner, row.Mac_Address, row.Exp_Name)
        for row in active_experiments.itertuples(index=False)
    }
    last = battery.groupby(
        ["Owner", "Mac_Address", "Device_Name", "Exp_Name"], as_index=False
    )["Timestamp"].max().rename(columns={"Timestamp": "Last_BQ_Timestamp"})
    cutoff = now - pd.Timedelta(hours=CALC_HOURS)
    rows = []
    for row in last.to_dict("records"):
        key = (row["Owner"], row["Mac_Address"], row["Exp_Name"])
        timestamp = parse_wall(row["Last_BQ_Timestamp"])
        if key not in active and timestamp is not None and timestamp >= cutoff:
            rows.append({**row, "Last_BQ_Timestamp": timestamp, "Experiment_Status": "STOPPED"})
    return pd.DataFrame(rows, columns=columns)


def battery_status(rows: pd.DataFrame) -> dict[str, Any]:
    values = pd.to_numeric(
        rows.sort_values("Timestamp", ascending=False).head(20)["Value"],
        errors="coerce",
    ).dropna()
    count = len(values)
    low = int((values < LOW_BATTERY_MV).sum())
    ratio = low / count if count else 0.0

    if count <= 3:
        status = "POSSIBLE BATTERY ISSUE" if low >= 2 else "INSUFFICIENT BATTERY DATA"
    elif count <= 9:
        status = (
            "REPLACE BATTERY" if ratio >= 0.60
            else "POSSIBLE BATTERY ISSUE" if low >= 2
            else "LIMITED BATTERY DATA"
        )
    elif count <= 19:
        status = (
            "REPLACE BATTERY" if ratio >= 0.50
            else "POSSIBLE BATTERY ISSUE" if ratio >= 0.10
            else "LIMITED BATTERY DATA"
        )
    else:
        status = (
            "REPLACE BATTERY" if ratio > 0.20
            else "POSSIBLE BATTERY ISSUE" if low >= 3
            else "OK"
        )

    return {
        "Battery_Status": status,
        "Battery_Measurement_Count": int(count),
        "Low_Battery_Count": low,
        "Low_Battery_Percentage": round(ratio * 100, 3),
    }


def packet_loss(actual: int, expected: int) -> float:
    if expected <= 0:
        return 0.0
    return round(max(0.0, min(100.0, (expected - actual) / expected * 100)), 3)


def calculate_results(sensors: pd.DataFrame, battery: pd.DataFrame, now: pd.Timestamp) -> pd.DataFrame:
    if sensors.empty:
        return pd.DataFrame(columns=RESULT_COLUMNS)

    day_start = now - pd.Timedelta(hours=CALC_HOURS)
    active_cutoff = now - pd.Timedelta(minutes=ACTIVE_MINUTES)
    rows = []

    grouped = {
        key: group
        for key, group in battery.groupby(["Owner", "Mac_Address", "Exp_Name", "LLA"])
    } if not battery.empty else {}

    for sensor in sensors.to_dict("records"):
        key = (
            sensor["Owner"], sensor["Mac_Address"],
            sensor["Exp_Name"], sensor["LLA"],
        )
        matching = grouped.get(key, pd.DataFrame(columns=battery.columns))
        expected = as_int(sensor["Expected_Packets"])
        start = pd.Timestamp(sensor["Sensor_Window_Start"])
        packet_rows = matching[
            (matching["Timestamp"] >= start) & (matching["Timestamp"] <= now)
        ]
        day_rows = matching[
            (matching["Timestamp"] >= day_start) & (matching["Timestamp"] <= now)
        ]

        if day_rows.empty:
            battery_result = {
                "Battery_Status": (
                    "No data in last 24H, Last_Battery: "
                    f"{fmt_battery(sensor['FS_Last_Battery'])}"
                ),
                "Battery_Measurement_Count": 0,
                "Low_Battery_Count": None,
                "Low_Battery_Percentage": None,
            }
        else:
            battery_result = battery_status(day_rows)

        last_seen = parse_wall(sensor["FS_Last_Seen"])
        rows.append({
            "Owner": sensor["Owner"],
            "Mac_Address": sensor["Mac_Address"],
            "Device_Name": sensor["Device_Name"] or sensor["Mac_Address"],
            "Exp_Name": sensor["Exp_Name"],
            "Firestore_Active_Count": as_int(sensor["Active_Count"]),
            "Location": sensor["Location"] or "Unknown",
            "LLA": sensor["LLA"] or "Unknown",
            "Last_Seen": last_seen,
            "Is_Transmitting_Now": last_seen is not None and last_seen >= active_cutoff,
            "Expected_Packets": expected,
            "Actual_Packets": len(packet_rows),
            "Packet_Loss_Percentage": packet_loss(len(packet_rows), expected),
            **battery_result,
            "Sensor_Window_Start": start,
            "Experiment_Status": "ACTIVE",
        })
    return pd.DataFrame(rows, columns=RESULT_COLUMNS)


def total_lookup(experiments: pd.DataFrame) -> dict[tuple[str, str, str], int]:
    return {
        (row.Owner, row.Mac_Address, row.Exp_Name): as_int(row.Active_Count)
        for row in experiments.itertuples(index=False)
    }


def permitted(
    active: pd.DataFrame,
    stopped: pd.DataFrame,
    permissions: pd.DataFrame,
    recipient: str,
    system_admins: set[str],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if recipient in system_admins:
        return active.copy(), stopped.copy()

    scope = permissions[permissions["Email"] == recipient]
    wildcard = {
        (row.Owner, row.Mac_Address)
        for row in scope.itertuples(index=False)
        if row.Experiment == "*"
    }
    exact = {
        (row.Owner, row.Mac_Address, row.Experiment)
        for row in scope.itertuples(index=False)
        if row.Experiment != "*"
    }

    def filter_df(df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df.copy()
        mask = [
            (row.Owner, row.Mac_Address) in wildcard
            or (row.Owner, row.Mac_Address, row.Exp_Name) in exact
            for row in df.itertuples(index=False)
        ]
        return df.loc[mask].copy()

    return filter_df(active), filter_df(stopped)


def attention(row: pd.Series) -> bool:
    if not bool(row.get("Is_Transmitting_Now", False)):
        return True
    if row.get("Battery_Status") in {"REPLACE BATTERY", "POSSIBLE BATTERY ISSUE"}:
        return True
    try:
        return float(row.get("Packet_Loss_Percentage", 0)) > 5
    except (TypeError, ValueError):
        return False


def number(value: Any, decimals: int = 3) -> str:
    if value is None or pd.isna(value):
        return "-"
    try:
        return f"{float(value):.{decimals}f}"
    except (TypeError, ValueError):
        return str(value)


def sensor_table(df: pd.DataFrame) -> str:
    if df.empty:
        return '<p style="padding:10px;background:#f2f4f4;">No active and valid sensors.</p>'

    df = df.copy()
    df["_sort"] = df["Location"].map(natural_key)
    df = df.sort_values("_sort").drop(columns="_sort")
    columns = [
        ("Location", "Location"), ("LLA", "LLA"),
        ("Last Seen", "Last_Seen"), ("Is Active [1]", "Is_Transmitting_Now"),
        ("Battery Status [2]", "Battery_Status"),
        ("Battery N", "Battery_Measurement_Count"),
        ("Low N", "Low_Battery_Count"), ("Low (%)", "Low_Battery_Percentage"),
        ("Expected", "Expected_Packets"), ("Actual", "Actual_Packets"),
        ("Packet Loss (%) [3]", "Packet_Loss_Percentage"),
    ]

    out = ['<div style="overflow-x:auto"><table><tr>']
    for title, _ in columns:
        out.append(f"<th>{html.escape(title)}</th>")
    out.append("</tr>")

    for _, row in df.iterrows():
        out.append("<tr>")
        for _, field in columns:
            raw = row.get(field)
            if field == "Last_Seen":
                value = fmt_time(raw)
            elif field == "Is_Transmitting_Now":
                value = "✓" if bool(raw) else "X"
            elif field in {"Low_Battery_Percentage", "Packet_Loss_Percentage"}:
                value = number(raw)
            else:
                value = "-" if raw is None or pd.isna(raw) else str(raw)

            css = ""
            if field in {"Last_Seen", "Is_Transmitting_Now"} and not bool(row["Is_Transmitting_Now"]):
                css = "bad"
            elif field == "Battery_Status":
                css = (
                    "ok" if raw == "OK"
                    else "bad" if raw == "REPLACE BATTERY"
                    else "warn" if raw == "POSSIBLE BATTERY ISSUE"
                    else "neutral"
                )
            elif field == "Packet_Loss_Percentage":
                loss = float(raw)
                css = "bad" if loss > 90 else "warn" if loss > 5 else ""
            out.append(f'<td class="{css}">{html.escape(value)}</td>')
        out.append("</tr>")
    out.append("</table></div>")
    return "".join(out)


CSS = """
<style>
body{font-family:Arial,sans-serif;color:#333;direction:ltr}
.owner{background:#2c3e50;color:#fff;padding:12px;margin-top:34px;border-radius:4px}
.device{background:#ecf0f1;border-left:5px solid #2980b9;padding:9px 12px;margin-top:18px}
.exp,.stopped{background:#f9f9f9;border-left:6px solid #a8ab58;padding:10px 15px;margin:15px 0 10px}
.stopped{background:#f2f4f4;border-color:#7f8c8d}
.badge{display:inline-block;font-size:13px;font-weight:bold;padding:5px 10px;border-radius:12px;margin-left:10px}
.issue,.neutral{background:#f1f3f4;color:#5f6368}.good,.ok{background:#e8f5e9;color:#2e7d32}
table{border-collapse:collapse;width:100%;margin-bottom:28px;font-size:12px}
th,td{border:1px solid #ddd;text-align:center;padding:8px}th{background:#85c1ad;color:#fff}
td.bad{background:#f8d7da;color:#721c24;font-weight:bold}
td.warn{background:#fff3cd;color:#8a6500;font-weight:bold}
td.neutral{background:#f1f3f4;color:#555;font-weight:bold}
</style>
"""


def build_email(
    recipient: str,
    active: pd.DataFrame,
    stopped: pd.DataFrame,
    now: pd.Timestamp,
    totals: dict[tuple[str, str, str], int],
) -> str:
    parts = [
        "<html><head>", CSS, "</head><body>",
        '<h1 style="color:#85c1ad">Field 4D - Sensor Status Report</h1>',
        f"<p>Recipient: <b>{html.escape(recipient)}</b><br>",
        f"Report time: <b>{html.escape(fmt_time(now))}</b><br>",
        "BigQuery battery scan: 25 hours.<br>",
        "Packet Loss and battery calculations: defined 24-hour windows.</p><hr>",
    ]

    if active.empty and stopped.empty:
        parts.append(
            '<div class="stopped">No active or recently stopped experiments '
            "match this email's current permissions.</div>"
        )

    owners = set(active.get("Owner", pd.Series(dtype=str)).astype(str))
    owners |= set(stopped.get("Owner", pd.Series(dtype=str)).astype(str))

    for owner in sorted(filter(None, owners), key=natural_key):
        parts.append(f'<div class="owner"><b>Owner: {html.escape(owner)}</b></div>')
        owner_active = active[active["Owner"] == owner] if not active.empty else active
        owner_stopped = stopped[stopped["Owner"] == owner] if not stopped.empty else stopped

        devices = {
            (row.Mac_Address, row.Device_Name)
            for frame in (owner_active, owner_stopped) if not frame.empty
            for row in frame.itertuples(index=False)
        }
        for mac, name in sorted(devices, key=lambda item: natural_key(item[1] or item[0])):
            parts.append(
                f'<div class="device"><b>Device: '
                f'{html.escape(device_label(name, mac))}</b></div>'
            )
            device_active = owner_active[owner_active["Mac_Address"] == mac] if not owner_active.empty else owner_active
            device_stopped = owner_stopped[owner_stopped["Mac_Address"] == mac] if not owner_stopped.empty else owner_stopped

            for name_exp in sorted(device_active["Exp_Name"].unique(), key=natural_key) if not device_active.empty else []:
                exp_df = device_active[device_active["Exp_Name"] == name_exp].copy()
                issues = int(exp_df.apply(attention, axis=1).sum())
                key = (owner, mac.lower(), name_exp)
                if key not in totals:
                    raise ValueError(f"Missing endpoint active_count for {owner}/{mac}/{name_exp}")
                total = totals[key]
                badge = "issue" if issues else "good"
                label = f"{issues} / {total} sensors require attention"
                parts.append(
                    f'<div class="exp"><b>Experiment: {html.escape(name_exp)}</b>'
                    f'<span class="badge {badge}">{html.escape(label)}</span></div>'
                )
                parts.append(sensor_table(exp_df))

            for name_exp in sorted(device_stopped["Exp_Name"].unique(), key=natural_key) if not device_stopped.empty else []:
                row = device_stopped[device_stopped["Exp_Name"] == name_exp].sort_values(
                    "Last_BQ_Timestamp", ascending=False
                ).iloc[0]
                parts.append(
                    f'<div class="stopped"><b>Experiment: {html.escape(name_exp)}</b>'
                    '<span class="badge neutral">Stopped</span><br><br>'
                    "Experiment termination detected.<br>Last BigQuery battery data: "
                    f'<b>{html.escape(fmt_time(row["Last_BQ_Timestamp"]))}</b></div>'
                )

    parts.append("""
    <div style="margin-top:30px;padding:15px;background:#f8f9fa;border-left:4px solid #85c1ad;font-size:13px;line-height:1.6">
    <strong>[1] Is Active:</strong> ✓ when Firestore Last_Seen is 15 minutes old or less; otherwise X.<br>
    <strong>[2] Battery Status:</strong> Uses BigQuery battery measurements from the last 24 hours and at most the latest 20. With no BigQuery data, the latest Firestore battery is displayed without assigning OK.<br>
    <strong>[3] Packet Loss:</strong> One packet every 3 minutes; a full day is 480. New experiments and replacements use their rounded 3-minute start time.<br>
    <strong>Time:</strong> BigQuery clock values are used as stored. Firestore UTC times are converted to Asia/Jerusalem.
    </div></body></html>
    """)
    return "".join(parts)


def send_email(recipient: str, body: str) -> None:
    response = requests.post(
        EMAIL_API_URL,
        json={
            "to": recipient,
            "subject": "Field 4D: Sensor Status Report",
            "body": body,
            "is_html": True,
        },
        timeout=HTTP_TIMEOUT,
    )
    response.raise_for_status()


def send_daily_reports(request):
    del request
    print("[INFO] Cloud Function triggered")
    try:
        client = bigquery.Client(project=PROJECT_ID)
        now = pd.Timestamp.now(tz=TZ).tz_localize(None)

        devices = load_devices(client)
        permissions, system_admins, recipients = load_access(client)
        print(f"[INFO] Devices={len(devices)}, system_admins={sorted(system_admins)}")
        print(f"[INFO] Recipients={recipients}")

        if devices.empty:
            return ("No devices found", 200)
        if not recipients:
            return ("No active recipients found", 200)

        experiments = discover_experiments(devices)
        sensors = prepare_sensors(experiments, now)
        battery = query_battery(client, now)
        active_results = calculate_results(sensors, battery, now)
        stopped_results = detect_stopped(experiments, battery, now)
        totals = total_lookup(experiments)

        success = failed = 0
        for recipient in recipients:
            active, stopped = permitted(
                active_results, stopped_results, permissions,
                recipient, system_admins,
            )
            print(
                f"[INFO] {recipient}: {len(active)} active sensor rows, "
                f"{len(stopped)} stopped experiments"
            )
            try:
                send_email(recipient, build_email(recipient, active, stopped, now, totals))
                success += 1
                print(f"[INFO] Sent to {recipient}")
            except requests.RequestException as exc:
                failed += 1
                print(f"[ERROR] Email failed for {recipient}: {exc}")

        print(f"[INFO] Completed. Success={success}, Failed={failed}")
        if failed == 0:
            return (f"Reports sent successfully: {success}", 200)
        if success:
            return (f"Partial failure. Success={success}, Failed={failed}", 207)
        return (f"All email deliveries failed: {failed}", 500)

    except Exception as exc:
        print(f"[ERROR] Pipeline failed: {exc}")
        return ("Field4D report pipeline failed", 500)
