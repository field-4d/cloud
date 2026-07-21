import html
import re
from typing import Any

import pandas as pd
import requests
from google.cloud import bigquery

LOW_BATTERY_MV = 2700.0
PACKET_INTERVAL_MINUTES = 3
FULL_DAY_EXPECTED_PACKETS = 480
BQ_SCAN_HOURS = 25
CALCULATION_HOURS = 24
ACTIVE_MINUTES = 15
DEFAULT_TIMEZONE = "Asia/Jerusalem"

FS_EXPERIMENTS_API = "https://apisync-1000435921680.us-central1.run.app/GCP-FS/metadata/experiments"
FS_SENSORS_API = "https://apisync-1000435921680.us-central1.run.app/GCP-FS/last-package"
EMAIL_API_URL = "https://f4d-email-sender-1000435921680.europe-west1.run.app"

DISPLAY_COLUMNS = [
    "Location", "Device_Name", "Last_Seen", "Is Active [1]",
    "Battery Status [2]", "Packet Loss (%) [3]",
]


def natural_sort_key(value):
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", str(value))]


def text(value):
    return "" if value is None else str(value).strip()


def get(record, *keys, default=None):
    for key in keys:
        if key in record and record[key] is not None:
            return record[key]
    return default


def as_bool(value):
    return value is True or text(value).lower() == "true"


def extract_list(payload, key):
    if not isinstance(payload, dict):
        return []
    value = payload.get(key)
    if not isinstance(value, list):
        value = payload.get("data")
    return value if isinstance(value, list) else []


def fs_lla(sensor):
    return text(get(sensor, "LLA", "lla"))


def fs_location(sensor):
    return text(get(sensor, "Location", "location"))


def fs_exp_name(sensor):
    return text(get(sensor, "Exp_Name", "exp_name", "Experiment", "experiment"))


def fs_active(sensor):
    return as_bool(get(sensor, "Is_Active", "is_active", default=False))


def fs_active_exp(sensor):
    return as_bool(get(sensor, "Active_Exp", "active_exp", default=False))


def fs_timezone(sensor):
    return text(get(sensor, "Time_Zone", "time_zone", "timezone")) or DEFAULT_TIMEZONE


def fs_last_seen(sensor):
    return get(sensor, "Last_Seen", "last_seen")


def fs_battery(sensor):
    package = get(sensor, "Last_Package", "last_package", default={})
    if not isinstance(package, dict):
        return None
    return get(package, "battery", "Battery")


def same_experiment(sensor, exp_name):
    sensor_exp = fs_exp_name(sensor)
    return not sensor_exp or sensor_exp == exp_name


def parse_time(value, timezone=DEFAULT_TIMEZONE, naive_timezone=None):
    if value is None or value == "":
        return None
    timestamp = pd.to_datetime(value, errors="coerce")
    if pd.isna(timestamp):
        return None
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(naive_timezone or timezone)
    return timestamp


def format_time(value, timezone=DEFAULT_TIMEZONE, naive_timezone=None):
    timestamp = parse_time(value, timezone, naive_timezone)
    if timestamp is None:
        return "Unknown"
    return timestamp.tz_convert(timezone).strftime("%Y-%m-%d %H:%M:%S")


def format_battery(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "UNAVAILABLE"
    return f"{int(number)} mV" if number.is_integer() else f"{number:.1f} mV"


def packet_times(value):
    if value is None:
        return []
    if hasattr(value, "tolist"):
        value = value.tolist()
    if not isinstance(value, (list, tuple)):
        value = [value]
    parsed = [pd.to_datetime(x, utc=True, errors="coerce") for x in value]
    return sorted({x for x in parsed if pd.notna(x)})


def experiment_start(sensors, exp_name):
    starts = []
    for sensor in sensors:
        if not same_experiment(sensor, exp_name):
            continue
        raw = get(sensor, "Exp_Started_At", "exp_started_at")
        if not raw:
            continue
        timezone = fs_timezone(sensor)
        parsed = parse_time(raw, timezone, timezone)
        if parsed is not None:
            starts.append(parsed.ceil("3min"))
    if not starts:
        print(f"[WARNING] No Exp_Started_At for {exp_name}")
        return None
    unique = sorted({x.isoformat() for x in starts})
    if len(unique) > 1:
        print(f"[WARNING] Multiple Exp_Started_At values for {exp_name}: {unique}")
    return min(starts)


def replacement_times(sensors, exp_name):
    result = {}
    for sensor in sensors:
        if not same_experiment(sensor, exp_name):
            continue
        location = fs_location(sensor)
        if not location.endswith("-replaced"):
            continue
        raw = get(sensor, "Updated_At", "updated_at")
        parsed = parse_time(raw, fs_timezone(sensor), "UTC") if raw else None
        if parsed is None:
            continue
        base_location = location[:-len("-replaced")]
        parsed = parsed.ceil("3min")
        if base_location not in result or parsed > result[base_location]:
            result[base_location] = parsed
    return result


def expected_window(now_utc, exp_start, replacement):
    rolling_start = now_utc - pd.Timedelta(hours=24)
    starts = [rolling_start]
    if exp_start is not None and exp_start.tz_convert("UTC") > rolling_start:
        starts.append(exp_start.tz_convert("UTC"))
    if replacement is not None and replacement.tz_convert("UTC") > rolling_start:
        starts.append(replacement.tz_convert("UTC"))
    start = max(starts)
    if start == rolling_start:
        return start, FULL_DAY_EXPECTED_PACKETS
    elapsed = (now_utc - start).total_seconds()
    if elapsed < 0:
        return start, 0
    expected = int(elapsed // (PACKET_INTERVAL_MINUTES * 60)) + 1
    return start, min(expected, FULL_DAY_EXPECTED_PACKETS)


def packet_loss(actual, expected):
    if expected <= 0:
        return 0.0
    value = ((expected - actual) / expected) * 100
    return round(max(0.0, min(100.0, value)), 2)


def requires_attention(row):
    if row.get("Is Active [1]") == "X":
        return True
    if row.get("Battery Status [2]") in {"REPLACE BATTERY", "POSSIBLE BATTERY ISSUE"}:
        return True
    try:
        return float(row.get("Packet Loss (%) [3]", 0)) > 5
    except (TypeError, ValueError):
        return False


def activity_style(last_seen, now_utc):
    if last_seen is None:
        return "background:#f8d7da;color:#721c24;font-weight:bold;"
    age = now_utc - last_seen.tz_convert("UTC")
    if age > pd.Timedelta(hours=24):
        return "background:#f8d7da;color:#721c24;font-weight:bold;"
    if age > pd.Timedelta(minutes=15):
        return "background:#ffe6e6;color:#cc0000;font-weight:bold;"
    return ""


def html_table(dataframe, now_utc):
    if dataframe.empty:
        return ""
    df = dataframe.copy()
    df["_sort"] = df["Location"].apply(natural_sort_key)
    df = df.sort_values("_sort").drop(columns="_sort")
    out = '<div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;margin-bottom:30px;font-size:13px;"><tr>'
    for column in DISPLAY_COLUMNS:
        out += f'<th style="border:1px solid #ddd;text-align:center;padding:10px;background:#85c1ad;color:#fff;font-weight:bold;">{html.escape(column)}</th>'
    out += "</tr>"
    for _, row in df.iterrows():
        out += "<tr>"
        last_seen = row.get("Last_Seen_dt")
        if pd.isna(last_seen):
            last_seen = None
        for column in DISPLAY_COLUMNS:
            value = row.get(column, "-")
            if pd.isna(value):
                value = "-"
            style = "border:1px solid #ddd;text-align:center;padding:10px;"
            if column in {"Last_Seen", "Is Active [1]"}:
                style += activity_style(last_seen, now_utc)
            elif column == "Battery Status [2]":
                if value == "OK":
                    style += "background:#e8f5e9;color:#2e7d32;font-weight:bold;"
                elif value == "REPLACE BATTERY":
                    style += "background:#f8d7da;color:#721c24;font-weight:bold;"
                else:
                    style += "background:#fff3cd;color:#8a6500;font-weight:bold;"
            elif column == "Packet Loss (%) [3]":
                try:
                    loss = float(value)
                    if loss > 90:
                        style += "background:#f8d7da;color:#721c24;font-weight:bold;"
                    elif loss > 5:
                        style += "background:#fff3cd;color:#8a6500;font-weight:bold;"
                except (TypeError, ValueError):
                    pass
            out += f'<td style="{style}">{html.escape(str(value))}</td>'
        out += "</tr>"
    return out + "</table></div>"


def run_bigquery(client):
    query = f"""
    WITH Permissions_Raw AS (
      SELECT DISTINCT Email, Mac_Address, Experiment AS Allowed_Exp
      FROM `iucc-f4d.Field4D.F4D_permissions`
      WHERE Role = 'system_admin'
         OR Email IN ('ori1409@gmail.com', 'sara.post@mail.huji.ac.il')
    ),
    Permissions AS (
      SELECT Email, Mac_Address,
             LOGICAL_OR(Allowed_Exp = '*') AS Allow_All,
             ARRAY_AGG(DISTINCT Allowed_Exp IGNORE NULLS) AS Allowed_Exps
      FROM Permissions_Raw
      GROUP BY Email, Mac_Address
    ),
    Base_Data AS (
      SELECT p.Email, d.Owner, d.Mac_Address, d.Exp_Name, d.LLA,
             d.Location, SAFE_CAST(d.Value AS FLOAT64) AS Value,
             d.Timestamp, IFNULL(d.Time_Zone, '{DEFAULT_TIMEZONE}') AS Tz
      FROM `iucc-f4d.Field4D.F4D_sensors_data` d
      JOIN Permissions p
        ON d.Mac_Address = p.Mac_Address
       AND (p.Allow_All OR d.Exp_Name IN UNNEST(p.Allowed_Exps))
      WHERE d.Exp_Name IS NOT NULL
        AND d.Variable = 'battery'
        AND d.Timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {BQ_SCAN_HOURS} HOUR)
    ),
    Recent_24h AS (
      SELECT * FROM Base_Data
      WHERE Timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {CALCULATION_HOURS} HOUR)
    ),
    Ranked_Battery AS (
      SELECT Email, Owner, Mac_Address, Exp_Name, LLA, Value, Timestamp,
             ROW_NUMBER() OVER (
               PARTITION BY Email, Owner, Mac_Address, Exp_Name, LLA
               ORDER BY Timestamp DESC
             ) AS rn
      FROM Recent_24h
    ),
    Battery_Summary AS (
      SELECT Email, Owner, Mac_Address, Exp_Name, LLA,
             COUNTIF(rn <= 20 AND Value IS NOT NULL) AS Battery_Count,
             COUNTIF(rn <= 20 AND Value < {LOW_BATTERY_MV}) AS Low_Count
      FROM Ranked_Battery
      GROUP BY Email, Owner, Mac_Address, Exp_Name, LLA
    ),
    Battery_Logic AS (
      SELECT *,
        CASE
          WHEN Battery_Count <= 3 THEN
            IF(Low_Count >= 2, 'POSSIBLE BATTERY ISSUE', 'INSUFFICIENT BATTERY DATA')
          WHEN Battery_Count <= 9 THEN
            CASE
              WHEN SAFE_DIVIDE(Low_Count, Battery_Count) >= 0.60 THEN 'REPLACE BATTERY'
              WHEN Low_Count >= 2 THEN 'POSSIBLE BATTERY ISSUE'
              ELSE 'LIMITED BATTERY DATA'
            END
          WHEN Battery_Count <= 19 THEN
            CASE
              WHEN SAFE_DIVIDE(Low_Count, Battery_Count) >= 0.50 THEN 'REPLACE BATTERY'
              WHEN SAFE_DIVIDE(Low_Count, Battery_Count) >= 0.10 THEN 'POSSIBLE BATTERY ISSUE'
              ELSE 'LIMITED BATTERY DATA'
            END
          ELSE
            CASE
              WHEN SAFE_DIVIDE(Low_Count, Battery_Count) > 0.20 THEN 'REPLACE BATTERY'
              WHEN Low_Count >= 3 THEN 'POSSIBLE BATTERY ISSUE'
              ELSE 'OK'
            END
        END AS Battery_Status
      FROM Battery_Summary
    ),
    Distinct_Packets AS (
      SELECT DISTINCT Email, Owner, Mac_Address, Exp_Name, LLA, Timestamp
      FROM Recent_24h
    ),
    Packet_Summary AS (
      SELECT Email, Owner, Mac_Address, Exp_Name, LLA,
             COUNT(*) AS Actual_24h,
             ARRAY_AGG(Timestamp ORDER BY Timestamp) AS Packet_Timestamps_24h
      FROM Distinct_Packets
      GROUP BY Email, Owner, Mac_Address, Exp_Name, LLA
    ),
    Sensor_Metrics AS (
      SELECT Email, Owner, Mac_Address, Exp_Name, LLA,
             ARRAY_AGG(Location IGNORE NULLS ORDER BY Timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS Location,
             ARRAY_AGG(Tz ORDER BY Timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS Tz,
             MAX(Timestamp) AS Last_Seen
      FROM Base_Data
      GROUP BY Email, Owner, Mac_Address, Exp_Name, LLA
    ),
    Device_Mapping AS (
      SELECT Mac_Address, ANY_VALUE(Device_Name) AS Device_Name
      FROM `iucc-f4d.Field4D.F4D_mac_to_device`
      WHERE Device_Name IS NOT NULL
      GROUP BY Mac_Address
    )
    SELECT s.Email, s.Owner, IFNULL(d.Device_Name, s.Mac_Address) AS Device_Name,
           s.Mac_Address, s.Exp_Name, s.Location, s.LLA, s.Tz, s.Last_Seen,
           IFNULL(p.Actual_24h, 0) AS Actual_24h,
           COALESCE(p.Packet_Timestamps_24h, CAST([] AS ARRAY<TIMESTAMP>)) AS Packet_Timestamps_24h,
           IFNULL(b.Battery_Count, 0) AS Battery_Count,
           IFNULL(b.Low_Count, 0) AS Low_Count,
           IFNULL(b.Battery_Status, 'INSUFFICIENT BATTERY DATA') AS Battery_Status
    FROM Sensor_Metrics s
    LEFT JOIN Packet_Summary p USING (Email, Owner, Mac_Address, Exp_Name, LLA)
    LEFT JOIN Battery_Logic b USING (Email, Owner, Mac_Address, Exp_Name, LLA)
    LEFT JOIN Device_Mapping d ON s.Mac_Address = d.Mac_Address
    ORDER BY s.Email, s.Owner, s.Mac_Address, s.Exp_Name, s.Location
    """
    df = client.query(query).to_dataframe()
    if not df.empty:
        df["Last_Seen"] = pd.to_datetime(df["Last_Seen"], utc=True, errors="coerce")
    return df


def fetch_firestore(owner, mac, exp_name):
    params = {"owner": owner, "mac_address": mac, "exp_name": exp_name}
    try:
        exp_response = requests.get(FS_EXPERIMENTS_API, params=params, timeout=20)
        exp_response.raise_for_status()
        sensor_response = requests.get(FS_SENSORS_API, params=params, timeout=20)
        sensor_response.raise_for_status()
        return {
            "experiments": extract_list(exp_response.json(), "experiments"),
            "sensors": extract_list(sensor_response.json(), "data"),
            "fetch_ok": True,
        }
    except (requests.RequestException, ValueError) as exc:
        print(f"[ERROR] Firestore request failed for {owner}/{mac}/{exp_name}: {exc}")
        return {"experiments": [], "sensors": [], "fetch_ok": False}


def build_sensor_rows(exp_bq, sensors, exp_name, device_name, now_utc, fetch_ok):
    relevant = [s for s in sensors if same_experiment(s, exp_name)]
    active = [s for s in relevant if fs_active(s) and not fs_location(s).endswith("-replaced")]

    if not active and not fetch_ok:
        for _, row in exp_bq.iterrows():
            active.append({
                "LLA": row.get("LLA"), "Location": row.get("Location"),
                "Is_Active": True, "Active_Exp": True,
                "Time_Zone": row.get("Tz", DEFAULT_TIMEZONE),
            })

    exp_start = experiment_start(relevant, exp_name)
    replacements = replacement_times(relevant, exp_name)
    bq_by_lla = {text(row["LLA"]): row for _, row in exp_bq.iterrows()}
    rows = []

    for sensor in active:
        lla = fs_lla(sensor)
        location = fs_location(sensor) or "Unknown"
        timezone = fs_timezone(sensor)
        bq_row = bq_by_lla.get(lla)
        start, expected = expected_window(now_utc, exp_start, replacements.get(location))

        if bq_row is None:
            last_seen = parse_time(fs_last_seen(sensor), timezone, timezone)
            battery_status = f"FS LAST: {format_battery(fs_battery(sensor))} - NO BQ DATA IN 24H"
            loss = 100.0
        else:
            times = packet_times(bq_row.get("Packet_Timestamps_24h"))
            last_seen = bq_row.get("Last_Seen")
            if pd.isna(last_seen):
                last_seen = None
            if times:
                actual = sum(1 for timestamp in times if start <= timestamp <= now_utc)
                battery_status = text(bq_row.get("Battery_Status")) or "INSUFFICIENT BATTERY DATA"
                loss = packet_loss(actual, expected)
            else:
                battery_status = f"FS LAST: {format_battery(fs_battery(sensor))} - NO BQ DATA IN 24H"
                loss = 100.0

        if last_seen is None:
            last_seen_display = "Unknown"
            active_now = False
        else:
            last_seen_display = last_seen.tz_convert(timezone).strftime("%Y-%m-%d %H:%M:%S")
            active_now = now_utc - last_seen.tz_convert("UTC") <= pd.Timedelta(minutes=ACTIVE_MINUTES)

        rows.append({
            "Location": location,
            "Device_Name": device_name,
            "Last_Seen": last_seen_display,
            "Last_Seen_dt": last_seen,
            "Is Active [1]": "✓" if active_now else "X",
            "Battery Status [2]": battery_status,
            "Packet Loss (%) [3]": loss,
        })

    return pd.DataFrame(rows)


def build_email(recipient, recipient_df, firestore_data, now_utc):
    body = f"""
    <html><head><style>
      body {{ font-family:Arial,sans-serif;color:#333;direction:ltr; }}
      .owner-header {{ background:#2c3e50;color:white;padding:12px;margin-top:40px;border-radius:4px; }}
      .mac-header {{ background:#ecf0f1;border-left:5px solid #2980b9;padding:8px 12px;margin-top:20px;color:#2c3e50; }}
      .exp-box {{ background:#f9f9f9;border-left:6px solid #a8ab58;padding:10px 15px;border-radius:4px;margin:15px 0 10px; }}
      .stopped-exp-box {{ background:#f2f4f4;border-left:6px solid #7f8c8d;padding:10px 15px;border-radius:4px;margin:15px 0 10px; }}
      h2 {{ margin:0;font-size:20px; }} h3 {{ margin:0;font-size:16px; }}
      h4 {{ margin:0;color:#333;display:flex;justify-content:space-between;align-items:center;font-size:15px; }}
      .badge {{ font-size:13px;font-weight:bold;padding:5px 10px;border-radius:12px; }}
      .badge-issue {{ background:#f1f3f4;color:#5f6368; }}
      .badge-good {{ background:#e8f5e9;color:#2e7d32; }}
      .badge-neutral {{ background:#bdc3c7;color:#2c3e50; }}
      .completion-notice {{ background:#e8f5e9;color:#2e7d32;padding:12px;border-radius:4px;border:1px solid #c8e6c9;margin-bottom:30px;font-weight:bold;text-align:center; }}
    </style></head><body>
      <h1 style="color:#85c1ad;">Field 4D - System Administration Sensor Status Report</h1>
      <p>Ground-Truth Sync with Firestore. Target Administrator: <b>{html.escape(recipient)}</b>.</p><hr>
    """

    for owner in sorted(recipient_df["Owner"].dropna().astype(str).unique(), key=natural_sort_key):
        body += f'<div class="owner-header"><h2>Owner: {html.escape(owner)}</h2></div>'
        owner_df = recipient_df[recipient_df["Owner"].astype(str) == owner]

        for mac in sorted(owner_df["Mac_Address"].dropna().astype(str).unique(), key=natural_sort_key):
            mac_df = owner_df[owner_df["Mac_Address"].astype(str) == mac]
            device_name = text(mac_df["Device_Name"].iloc[0]) or mac
            device_display = device_name if mac in device_name else f"{device_name} (MAC: {mac})"
            body += f'<div class="mac-header"><h3>Device: {html.escape(device_display)}</h3></div>'

            for exp_name in sorted(mac_df["Exp_Name"].dropna().astype(str).unique(), key=natural_sort_key):
                scope = firestore_data.get((owner, mac, exp_name), {"experiments": [], "sensors": [], "fetch_ok": False})
                experiments, sensors, fetch_ok = scope["experiments"], scope["sensors"], scope["fetch_ok"]
                exp_bq = mac_df[mac_df["Exp_Name"].astype(str) == exp_name].copy()
                relevant = [s for s in sensors if same_experiment(s, exp_name)]
                returned_names = {text(get(x, "exp_name", "Exp_Name")) for x in experiments}
                active_exp = exp_name in returned_names or any(fs_active_exp(s) and fs_active(s) for s in relevant)
                last_bq = exp_bq["Last_Seen"].max()
                recently_stopped = fetch_ok and not active_exp and pd.notna(last_bq) and last_bq >= now_utc - pd.Timedelta(hours=24)

                if not active_exp and fetch_ok:
                    if recently_stopped:
                        body += f"""
                        <div class="stopped-exp-box"><h4>Experiment: {html.escape(exp_name)}
                        <span class="badge badge-neutral">Stopped</span></h4></div>
                        <div class="completion-notice">Experiment termination detected. Final system transmission recorded at: {html.escape(format_time(last_bq))}</div>
                        """
                    continue

                report_df = build_sensor_rows(exp_bq, sensors, exp_name, device_name, now_utc, fetch_ok)
                attention = int(report_df.apply(requires_attention, axis=1).sum()) if not report_df.empty else 0
                total = len(report_df)
                if attention:
                    badge_class = "badge badge-issue"
                    badge_text = f"{attention} / {total} sensors require attention"
                else:
                    badge_class = "badge badge-good"
                    badge_text = f"All {total} sensors are healthy"

                body += f"""
                <div class="exp-box"><h4>Experiment: {html.escape(exp_name)}
                <span class="{badge_class}">{html.escape(badge_text)}</span></h4></div>
                """
                body += html_table(report_df, now_utc)

    body += """
      <div style="margin-top:30px;padding:15px;background:#f8f9fa;border-left:4px solid #85c1ad;font-size:13px;color:#444;line-height:1.6;">
        <strong>Metrics Explanation:</strong><br>
        <strong>[1] Is Active:</strong> ✓ when a battery packet was received in BigQuery during the last 15 minutes; otherwise X.<br>
        <strong>[2] Battery Status:</strong> Uses battery measurements from the last 24 hours and at most the latest 20 measurements. If no BigQuery battery packet exists in the last 24 hours, the latest Firestore battery value is displayed.<br>
        <strong>[3] Packet Loss:</strong> One expected battery packet every 3 minutes. Experiments older than 24 hours use 480 expected packets. New experiments start from Exp_Started_At rounded upward to the next 3-minute point. A newly replaced sensor starts from the replaced record's Updated_At during the first 24 hours after replacement.
      </div></body></html>
    """
    return body


def send_daily_reports(request):
    print("[INFO] Cloud Function triggered: send_daily_reports")
    try:
        client = bigquery.Client()
        dataframe = run_bigquery(client)
    except Exception as exc:
        print(f"[ERROR] BigQuery failure: {exc}")
        return ("Database Error", 500)

    if dataframe.empty:
        return ("No data found", 200)

    scopes = dataframe[["Owner", "Mac_Address", "Exp_Name"]].drop_duplicates()
    firestore_data = {}
    for _, scope in scopes.iterrows():
        owner, mac, exp_name = text(scope["Owner"]), text(scope["Mac_Address"]), text(scope["Exp_Name"])
        firestore_data[(owner, mac, exp_name)] = fetch_firestore(owner, mac, exp_name)

    now_utc = pd.Timestamp.now(tz="UTC")
    success_count = 0
    fail_count = 0

    for recipient, recipient_df in dataframe.groupby("Email"):
        recipient = text(recipient)
        payload = {
            "to": recipient,
            "subject": "Field 4D: System Admin Network Status Report",
            "body": build_email(recipient, recipient_df, firestore_data, now_utc),
            "is_html": True,
        }
        try:
            response = requests.post(EMAIL_API_URL, json=payload, timeout=30)
            response.raise_for_status()
            success_count += 1
            print(f"[INFO] Report sent to {recipient}")
        except requests.RequestException as exc:
            fail_count += 1
            print(f"[ERROR] Email failed for {recipient}: {exc}")

    print(f"[INFO] Completed. Success: {success_count}, Failed: {fail_count}")
    if fail_count == 0:
        return ("Reports transmitted successfully", 200)
    return (f"Partial failure. Failed: {fail_count}", 207)
