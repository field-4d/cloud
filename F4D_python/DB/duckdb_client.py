from pathlib import Path
from datetime import datetime, timezone
import duckdb
import json
import uuid


DB_PATH = "/home/pi/F4D/DB/local.duckdb"

def now_local():
    return datetime.now()

def now_local_seconds():
    return datetime.now().replace(microsecond=0)

def now_local_millis():
    now = datetime.now()
    return now.replace(microsecond=(now.microsecond // 1000) * 1000)



def get_connection():
    Path("/home/pi/F4D/DB").mkdir(parents=True, exist_ok=True)
    return duckdb.connect(DB_PATH)


def parse_timestamp(value, trim_to_seconds=False):
    """
    Normalize incoming timestamps to LOCAL naive Python datetime objects
    for storage in DuckDB TIMESTAMP columns.

    Rules:
    - Accept Python datetime or ISO-like string
    - Convert trailing Z to +00:00
    - If timezone-aware, convert to local timezone and drop tzinfo
    - If naive, keep as-is
    - Optionally trim to second precision
    """
    if value in (None, "", "null"):
        return None

    if isinstance(value, datetime):
        dt = value
    else:
        try:
            text = str(value).strip()
            if text.endswith("Z"):
                text = text.replace("Z", "+00:00")
            dt = datetime.fromisoformat(text)
        except Exception:
            return None

    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)

    if trim_to_seconds:
        dt = dt.replace(microsecond=0)

    return dt



def to_json_text(value):
    if value is None:
        return None
    try:
        return json.dumps(value)
    except Exception:
        return str(value)


def make_timebucket(ts: datetime | None):
    if ts is None:
        return None
    return int(ts.strftime("%Y%m%d%H%M"))


def init_db():
    con = get_connection()
    
    con.execute("""
    CREATE TABLE IF NOT EXISTS sensors_metadata (
        metadata_id TEXT PRIMARY KEY,
        LLA TEXT NOT NULL,
        Owner TEXT,
        Mac_Address TEXT,
        Exp_ID INTEGER,
        Exp_Name TEXT,
        Exp_Location TEXT,
        Active_Exp BOOLEAN,
        Label TEXT,
        Label_Options TEXT,
        Location TEXT,
        RFID TEXT,
        Coordinates_X DOUBLE,
        Coordinates_Y DOUBLE,
        Coordinates_Z DOUBLE,
        Frequency DOUBLE,
        Is_Active BOOLEAN,
        Is_Valid BOOLEAN,
        Alerted BOOLEAN,
        Battery_Percentage DOUBLE,
        Email_Sent BOOLEAN,
        Last_Seen TIMESTAMP,
        Exp_Started_At TIMESTAMP,
        Exp_Ended_At TIMESTAMP,
        Created_At TIMESTAMP,
        Updated_At TIMESTAMP,
        Snapshot_At TIMESTAMP DEFAULT current_timestamp,
        Source TEXT
    );
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_sensors_metadata_lla
    ON sensors_metadata (LLA);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_sensors_metadata_exp_id
    ON sensors_metadata (Exp_ID);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_sensors_metadata_exp_name
    ON sensors_metadata (Exp_Name);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_sensors_metadata_lla_exp_id
    ON sensors_metadata (LLA, Exp_ID);
    """)

    return con


def get_next_exp_id(con):
    row = con.execute(
        "SELECT COALESCE(MAX(Exp_ID), 0) FROM sensors_metadata"
    ).fetchone()
    return int(row[0]) + 1


def get_active_experiment(con):
    row = con.execute("""
        SELECT Exp_Name, Exp_ID
        FROM sensors_metadata
        WHERE Active_Exp = true
          AND Exp_ID > 0
        ORDER BY Exp_ID DESC
        LIMIT 1
    """).fetchone()
    return row


def deactivate_experiment(con, exp_name):
    if not exp_name:
        return 0

    count_row = con.execute("""
        SELECT COUNT(*)
        FROM sensors_metadata
        WHERE Exp_Name = ?
          AND Active_Exp = true
    """, [exp_name]).fetchone()

    rows_to_update = int(count_row[0]) if count_row else 0

    con.execute("""
        UPDATE sensors_metadata
        SET Active_Exp = false,
            Exp_Ended_At = ?,
            Snapshot_At = current_timestamp
        WHERE Exp_Name = ?
          AND Active_Exp = true
    """, [now_local(), exp_name])

    return rows_to_update


def deactivate_experiment(con, exp_name):
    if not exp_name:
        return 0

    count_row = con.execute("""
        SELECT COUNT(*)
        FROM sensors_metadata
        WHERE Exp_Name = ?
          AND Active_Exp = true
    """, [exp_name]).fetchone()

    rows_to_update = int(count_row[0]) if count_row else 0

    con.execute("""
        UPDATE sensors_metadata
        SET Active_Exp = false,
            Exp_Ended_At = ?,
            Snapshot_At = current_timestamp
        WHERE Exp_Name = ?
          AND Active_Exp = true
    """, [now_local(), exp_name])

    return rows_to_update
    
def ensure_boot_row(con, item):
    lla = item.get("LLA")
    if not lla:
        return False

    exists = con.execute("""
        SELECT 1
        FROM sensors_metadata
        WHERE LLA = ?
          AND Exp_ID = 0
        LIMIT 1
    """, [lla]).fetchone()

    if exists:
        return False

    con.execute("""
        INSERT INTO sensors_metadata (
            metadata_id,
            LLA,
            Owner,
            Mac_Address,
            Exp_ID,
            Exp_Name,
            Active_Exp,
            Created_At,
            Snapshot_At,
            Source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, current_timestamp, ?)
    """, [
        str(uuid.uuid4()),
        lla,
        item.get("Owner"),
        item.get("Mac_Address"),
        0,
        "BOOT",
        False,
        now_local(),
        "boot"
    ])

    return True



def find_existing_active_row(con, lla, exp_id, exp_name):
    if not lla:
        return None

    return con.execute("""
        SELECT metadata_id
        FROM sensors_metadata
        WHERE LLA = ?
          AND Exp_ID = ?
          AND Exp_Name = ?
          AND Active_Exp = true
        LIMIT 1
    """, [lla, exp_id, exp_name]).fetchone()


def update_existing_experiment_row(con, item, exp_id, exp_name):
    lla = item.get("LLA")
    existing = find_existing_active_row(con, lla, exp_id, exp_name)

    if not existing:
        return False

    metadata_id = existing[0]

    con.execute("""
        UPDATE sensors_metadata
        SET
            Owner = ?,
            Mac_Address = ?,
            Exp_Location = ?,
            Active_Exp = ?,
            Label = ?,
            Label_Options = ?,
            Location = ?,
            RFID = ?,
            Coordinates_X = ?,
            Coordinates_Y = ?,
            Coordinates_Z = ?,
            Frequency = ?,
            Is_Active = ?,
            Is_Valid = ?,
            Alerted = ?,
            Battery_Percentage = ?,
            Email_Sent = ?,
            Last_Seen = ?,
            Exp_Started_At = ?,
            Exp_Ended_At = ?,
            Created_At = ?,
            Updated_At = ?,
            Snapshot_At = current_timestamp,
            Source = ?
        WHERE metadata_id = ?
    """, [
        item.get("Owner"),
        item.get("Mac_Address"),
        item.get("Exp_Location"),
        True,
        item.get("Label"),
        to_json_text(item.get("Label_Options")),
        item.get("Location"),
        item.get("RFID"),
        item.get("Coordinates_X"),
        item.get("Coordinates_Y"),
        item.get("Coordinates_Z"),
        item.get("Frequency"),
        item.get("Is_Active"),
        item.get("Is_Valid"),
        item.get("Alerted"),
        item.get("Battery_Percentage"),
        item.get("Email_Sent"),
        parse_timestamp(item.get("Last_Seen")),
        parse_timestamp(item.get("Exp_Started_At")),
        None,
        parse_timestamp(item.get("Created_At")),
        parse_timestamp(item.get("Updated_At")),
        "firestore",
        metadata_id
    ])

    return True


def insert_new_experiment_row(con, item, exp_id, exp_name):
    con.execute("""
        INSERT INTO sensors_metadata (
            metadata_id,
            LLA,
            Owner,
            Mac_Address,
            Exp_ID,
            Exp_Name,
            Exp_Location,
            Active_Exp,
            Label,
            Label_Options,
            Location,
            RFID,
            Coordinates_X,
            Coordinates_Y,
            Coordinates_Z,
            Frequency,
            Is_Active,
            Is_Valid,
            Alerted,
            Battery_Percentage,
            Email_Sent,
            Last_Seen,
            Exp_Started_At,
            Exp_Ended_At,
            Created_At,
            Updated_At,
            Snapshot_At,
            Source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp, ?)
    """, [
        str(uuid.uuid4()),
        item.get("LLA"),
        item.get("Owner"),
        item.get("Mac_Address"),
        exp_id,
        exp_name,
        item.get("Exp_Location"),
        True,
        item.get("Label"),
        to_json_text(item.get("Label_Options")),
        item.get("Location"),
        item.get("RFID"),
        item.get("Coordinates_X"),
        item.get("Coordinates_Y"),
        item.get("Coordinates_Z"),
        item.get("Frequency"),
        item.get("Is_Active"),
        item.get("Is_Valid"),
        item.get("Alerted"),
        item.get("Battery_Percentage"),
        item.get("Email_Sent"),
        parse_timestamp(item.get("Last_Seen")),
        parse_timestamp(item.get("Exp_Started_At")),
        None,
        parse_timestamp(item.get("Created_At")),
        parse_timestamp(item.get("Updated_At")),
        "firestore"
    ])


def upsert_active_experiment_rows(con, rows, exp_id, exp_name):
    inserted = 0
    updated = 0
    skipped_missing_lla = 0

    for item in rows:
        lla = item.get("LLA")
        if not lla:
            skipped_missing_lla += 1
            continue

        was_updated = update_existing_experiment_row(con, item, exp_id, exp_name)

        if was_updated:
            updated += 1
        else:
            insert_new_experiment_row(con, item, exp_id, exp_name)
            inserted += 1

    return inserted, updated, skipped_missing_lla


def get_active_experiment_by_name(con, exp_name):
    if not exp_name:
        return None

    return con.execute("""
        SELECT Exp_Name, Exp_ID
        FROM sensors_metadata
        WHERE Exp_Name = ?
          AND Active_Exp = true
          AND Exp_ID > 0
        ORDER BY Exp_ID DESC
        LIMIT 1
    """, [exp_name]).fetchone()

def get_active_experiment_name_by_lla(con, lla):
    if not lla:
        return None

    row = con.execute("""
        SELECT Exp_Name
        FROM sensors_metadata
        WHERE LLA = ?
          AND Active_Exp = true
          AND Exp_ID > 0
        ORDER BY Exp_ID DESC
        LIMIT 1
    """, [lla]).fetchone()

    return row[0] if row else None


def apply_sensor_metadata_payload(response_payload):
    if not response_payload.get("ok"):
        raise ValueError(f"Firestore request failed: {response_payload}")

    con = init_db()

    body = response_payload.get("data", {})
    rows = body.get("data", [])

    if not rows:
        return {"status": "no rows"}

    def get_active_experiment_name_by_lla(lla):
        if not lla:
            return None

        row = con.execute("""
            SELECT Exp_Name
            FROM sensors_metadata
            WHERE LLA = ?
              AND Active_Exp = true
              AND Exp_ID > 0
              AND Exp_Name IS NOT NULL
              AND Exp_Name <> ''
            ORDER BY Exp_ID DESC
            LIMIT 1
        """, [lla]).fetchone()

        return row[0] if row else None

    grouped = {}
    skipped_unresolved_rows = 0

    for row in rows:
        exp_name = row.get("Exp_Name")
        active_exp = row.get("Active_Exp")
        lla = row.get("LLA")

        if not exp_name and active_exp is not True:
            exp_name = get_active_experiment_name_by_lla(lla)

        if not exp_name:
            skipped_unresolved_rows += 1
            continue

        grouped.setdefault(exp_name, []).append(row)

    if not grouped:
        return {
            "status": "no_resolved_experiments",
            "experiments_processed": 0,
            "skipped_unresolved_rows": skipped_unresolved_rows,
            "results": []
        }

    results = []

    for exp_name, exp_rows in grouped.items():
        has_inactive = any(r.get("Active_Exp") is not True for r in exp_rows)
        active_rows = [r for r in exp_rows if r.get("Active_Exp") is True]

        if has_inactive:
            deactivated_count = deactivate_experiment(con, exp_name)

            boot_rows_added = 0
            existing_boot_rows = 0
            skipped_missing_lla = 0

            for item in exp_rows:
                if not item.get("LLA"):
                    skipped_missing_lla += 1
                    continue

                if ensure_boot_row(con, item):
                    boot_rows_added += 1
                else:
                    existing_boot_rows += 1

            results.append({
                "experiment_name": exp_name,
                "status": "inactive_payload_processed",
                "deactivated_rows": deactivated_count,
                "boot_rows_added": boot_rows_added,
                "existing_boot_rows": existing_boot_rows,
                "skipped_missing_lla": skipped_missing_lla
            })
            continue

        current_active = get_active_experiment_by_name(con, exp_name)

        if current_active:
            _, exp_id = current_active
        else:
            exp_id = get_next_exp_id(con)

        inserted, updated, skipped_missing_lla = upsert_active_experiment_rows(
            con=con,
            rows=active_rows,
            exp_id=exp_id,
            exp_name=exp_name
        )

        results.append({
            "experiment_name": exp_name,
            "status": "active_experiment_processed",
            "Exp_ID": exp_id,
            "rows_inserted": inserted,
            "rows_updated": updated,
            "skipped_missing_lla": skipped_missing_lla
        })

    return {
        "status": "multi_experiment_payload_processed",
        "experiments_processed": len(results),
        "skipped_unresolved_rows": skipped_unresolved_rows,
        "results": results
    }


def init_sensors_data_table(con):
    """
    Initialize the sensors_data table if it does not exist.
    """
    con.execute("""
    CREATE TABLE IF NOT EXISTS sensors_data (
        row_id TEXT PRIMARY KEY,
        Timestamp TIMESTAMP,
        TimeBucket BIGINT,
        Last_Packet_Time TIMESTAMP,
        LLA TEXT NOT NULL,
        Owner TEXT,
        Mac_Address TEXT,
        Exp_ID INTEGER,
        Exp_Name TEXT,
        Exp_Location TEXT,
        Label TEXT,
        Label_Options TEXT,
        Location TEXT,
        RFID TEXT,
        Coordinates_X DOUBLE,
        Coordinates_Y DOUBLE,
        Coordinates_Z DOUBLE,
        Variable TEXT NOT NULL,
        Value DOUBLE,
        Package_Count_3min INTEGER,
        Source TEXT
    );
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_sensors_data_lla
    ON sensors_data (LLA);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_sensors_data_exp_id
    ON sensors_data (Exp_ID);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_sensors_data_variable
    ON sensors_data (Variable);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_sensors_data_timestamp
    ON sensors_data (Timestamp);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_sensors_data_timebucket
    ON sensors_data (TimeBucket);
    """)

def init_packet_events_table(con):
    con.execute("""
    CREATE TABLE IF NOT EXISTS packet_events (
        row_id TEXT PRIMARY KEY,
        Interval_Timestamp TIMESTAMP,
        TimeBucket BIGINT,
        Packet_Arrival_Time TIMESTAMP,
        LLA TEXT NOT NULL,
        Owner TEXT,
        Mac_Address TEXT,
        Exp_ID INTEGER,
        Exp_Name TEXT,
        Exp_Location TEXT,
        Label TEXT,
        Label_Options TEXT,
        Location TEXT,
        RFID TEXT,
        Coordinates_X DOUBLE,
        Coordinates_Y DOUBLE,
        Coordinates_Z DOUBLE,
        Packet_Order_In_LLA_Interval INTEGER,
        Packet_Order_Global_Interval INTEGER,
        Packet_Count_3min INTEGER,
        Source TEXT
    );
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_packet_events_lla
    ON packet_events (LLA);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_packet_events_exp_id
    ON packet_events (Exp_ID);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_packet_events_interval
    ON packet_events (Interval_Timestamp);
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_packet_events_timebucket
    ON packet_events (TimeBucket);
    """)


def get_active_metadata_by_lla(con, lla: str):
    if not lla:
        return None

    return con.execute("""
        SELECT
            LLA,
            Owner,
            Mac_Address,
            Exp_ID,
            Exp_Name,
            Exp_Location,
            Label,
            Label_Options,
            Location,
            RFID,
            Coordinates_X,
            Coordinates_Y,
            Coordinates_Z,
            Active_Exp
        FROM sensors_metadata
        WHERE LLA = ?
          AND Active_Exp = true
          AND Exp_ID > 0
        LIMIT 1
    """, [lla]).fetchone()

def write_flash_buffer_to_sensors_data(flash_buffer: dict, interval_timestamp: datetime) -> dict:
    """
    Writes one frozen 3-minute interval snapshot into:
    - sensors_data
    - packet_events

    Rules:
    - only sensors with active metadata rows are written
    - sensors_data uses latest packet values
    - packet_events stores one row per packet arrival
    """
    con = init_db()
    init_sensors_data_table(con)
    init_packet_events_table(con)

    sensors_rows_inserted = 0
    packet_event_rows_inserted = 0
    skipped_missing_metadata = 0
    skipped_inactive = 0
    skipped_invalid_value = 0
    processed_sensors = 0
    
    interval_timestamp = parse_timestamp(interval_timestamp, trim_to_seconds=True)
    timebucket = make_timebucket(interval_timestamp)

    active_sensor_rows = []
    all_packet_events = []

    for lla, sensor_info in flash_buffer.items():
        metadata = get_active_metadata_by_lla(con, lla)

        if not metadata:
            skipped_missing_metadata += 1
            continue

        (
            meta_lla,
            owner,
            mac_address,
            exp_id,
            exp_name,
            exp_location,
            label,
            label_options,
            location,
            rfid,
            coord_x,
            coord_y,
            coord_z,
            active_exp
        ) = metadata

        if not active_exp or exp_id is None or exp_id <= 0:
            skipped_inactive += 1
            continue

        packet_count = sensor_info.get("packet_count", 0)
        last_packet_time = parse_timestamp(sensor_info.get("last_packet_time"))
        packet = sensor_info.get("packet", {})
        packet_events = sensor_info.get("packet_events", [])

        active_sensor_rows.append({
            "LLA": meta_lla,
            "Owner": owner,
            "Mac_Address": mac_address,
            "Exp_ID": exp_id,
            "Exp_Name": exp_name,
            "Exp_Location": exp_location,
            "Label": label,
            "Label_Options": label_options,
            "Location": location,
            "RFID": rfid,
            "Coordinates_X": coord_x,
            "Coordinates_Y": coord_y,
            "Coordinates_Z": coord_z,
            "packet_count": packet_count,
            "last_packet_time": last_packet_time,
            "packet": packet,
            "packet_events": packet_events,
        })

    for sensor_row in active_sensor_rows:
        for event in sensor_row["packet_events"]:
            all_packet_events.append({
                "LLA": sensor_row["LLA"],
                "Owner": sensor_row["Owner"],
                "Mac_Address": sensor_row["Mac_Address"],
                "Exp_ID": sensor_row["Exp_ID"],
                "Exp_Name": sensor_row["Exp_Name"],
                "Exp_Location": sensor_row["Exp_Location"],
                "Label": sensor_row["Label"],
                "Label_Options": sensor_row["Label_Options"],
                "Location": sensor_row["Location"],
                "RFID": sensor_row["RFID"],
                "Coordinates_X": sensor_row["Coordinates_X"],
                "Coordinates_Y": sensor_row["Coordinates_Y"],
                "Coordinates_Z": sensor_row["Coordinates_Z"],
                "Packet_Arrival_Time": parse_timestamp(event.get("Packet_Arrival_Time")),
                "Packet_Order_In_LLA_Interval": event.get("Packet_Order_In_LLA_Interval"),
                "Packet_Count_3min": sensor_row["packet_count"],
            })

    all_packet_events.sort(
        key=lambda x: (
            x["Packet_Arrival_Time"] or datetime.min,
            x["LLA"]
        )
    )

    for idx, event in enumerate(all_packet_events, start=1):
        event["Packet_Order_Global_Interval"] = idx

    for sensor_row in active_sensor_rows:
        processed_sensors += 1
        lla = sensor_row["LLA"]

        for variable, value in sensor_row["packet"].items():
            # Skip items / non-srnros fields if needed (when opt_3001 not connected and sends null)
            if value is None:
                # print(f"[Debug null sensor] {lla} | {variable} is null in this interval, skipping")
                skipped_invalid_value += 1
                continue
                

            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                print(f"[Debug invalid value] {lla} | {variable} = {value}, skipping")
                skipped_invalid_value += 1
                continue

            con.execute("""
                INSERT INTO sensors_data (
                    row_id,
                    Timestamp,
                    TimeBucket,
                    Last_Packet_Time,
                    LLA,
                    Owner,
                    Mac_Address,
                    Exp_ID,
                    Exp_Name,
                    Exp_Location,
                    Label,
                    Label_Options,
                    Location,
                    RFID,
                    Coordinates_X,
                    Coordinates_Y,
                    Coordinates_Z,
                    Variable,
                    Value,
                    Package_Count_3min,
                    Source
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                str(uuid.uuid4()),
                interval_timestamp,
                timebucket,
                sensor_row["last_packet_time"],
                sensor_row["LLA"],
                sensor_row["Owner"],
                sensor_row["Mac_Address"],
                sensor_row["Exp_ID"],
                sensor_row["Exp_Name"],
                sensor_row["Exp_Location"],
                sensor_row["Label"],
                sensor_row["Label_Options"],
                sensor_row["Location"],
                sensor_row["RFID"],
                sensor_row["Coordinates_X"],
                sensor_row["Coordinates_Y"],
                sensor_row["Coordinates_Z"],
                variable,
                numeric_value,
                sensor_row["packet_count"],
                "flash_buffer"
            ])

            sensors_rows_inserted += 1

    for event in all_packet_events:
        con.execute("""
            INSERT INTO packet_events (
                row_id,
                Interval_Timestamp,
                TimeBucket,
                Packet_Arrival_Time,
                LLA,
                Owner,
                Mac_Address,
                Exp_ID,
                Exp_Name,
                Exp_Location,
                Label,
                Label_Options,
                Location,
                RFID,
                Coordinates_X,
                Coordinates_Y,
                Coordinates_Z,
                Packet_Order_In_LLA_Interval,
                Packet_Order_Global_Interval,
                Packet_Count_3min,
                Source
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            str(uuid.uuid4()),
            interval_timestamp,
            timebucket,
            event["Packet_Arrival_Time"],
            event["LLA"],
            event["Owner"],
            event["Mac_Address"],
            event["Exp_ID"],
            event["Exp_Name"],
            event["Exp_Location"],
            event["Label"],
            event["Label_Options"],
            event["Location"],
            event["RFID"],
            event["Coordinates_X"],
            event["Coordinates_Y"],
            event["Coordinates_Z"],
            event["Packet_Order_In_LLA_Interval"],
            event["Packet_Order_Global_Interval"],
            event["Packet_Count_3min"],
            "flash_buffer"
        ])

        packet_event_rows_inserted += 1

    return {
        "status": "ok",
        "processed_sensors": processed_sensors,
        "sensors_data_rows_inserted": sensors_rows_inserted,
        "packet_event_rows_inserted": packet_event_rows_inserted,
        "skipped_missing_metadata": skipped_missing_metadata,
        "skipped_inactive": skipped_inactive,
        "skipped_invalid_value": skipped_invalid_value
    }