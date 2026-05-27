# F4D BigQuery Sync

Small HTTP service for syncing Field4D data into BigQuery.

The service exposes one POST endpoint implemented with `functions-framework`. It supports:

- `get_last_timestamp`: get the most recent timestamp for a specific owner/device/experiment stream
- `upload_rows`: validate and append rows into BigQuery

Rows uploaded from Field4D devices include sensor metadata enriched on the Pi (experiment location, labels, coordinates, timezone, and related fields) so BigQuery stores the same context as local DuckDB.

## What It Writes To

Project and dataset are currently hardcoded in `main.py`:

- Project: `iucc-f4d`
- Dataset: `Field4D`
- Region for dataset creation: `me-west1`

Supported tables:

- `F4D_sensors_data`
- `F4D_packet_events`

If the dataset or target table does not exist, the service creates it automatically before inserts.

## Requirements

Python dependencies:

```txt
functions-framework==3.*
google-cloud-bigquery==3.*
```

You also need Google Cloud credentials with permission to:

- read and create BigQuery datasets
- read and create BigQuery tables
- insert rows into BigQuery
- run query jobs

For local development, authenticate with Google Cloud before starting the app.

## Install

```bash
pip install -r requirements.txt
```

## Run Locally

Start the local Functions Framework server:

```bash
functions-framework --target=f4d_bq_sync --debug
```

Default local URL:

```txt
http://localhost:8080
```

Deployed URL:

```txt
https://f4d-bq-sync-1000435921680.me-west1.run.app
```

## API

Only `POST` is supported. The request body must be a JSON object.

### 1. Get Last Timestamp

Returns the newest timestamp already stored for a logical data stream identified by:

- `owner`
- `mac_address`
- `experiment_name`

Example request:

```json
{
  "action": "get_last_timestamp",
  "table_name": "F4D_sensors_data",
  "owner": "f4dv2",
  "mac_address": "d83adde260d1",
  "experiment_name": "Big_Query"
}
```

Example success response:

```json
{
  "status": "success",
  "action": "get_last_timestamp",
  "table_name": "F4D_sensors_data",
  "table_exists": true,
  "stream_exists": true,
  "last_timestamp": "2026-03-20T12:03:00+00:00"
}
```

If the table does not exist yet, the service returns success with:

- `table_exists: false`
- `stream_exists: false`
- `last_timestamp: null`

### 2. Upload Rows

Validates and inserts rows into one of the supported tables.

Example request for `F4D_sensors_data`:

```json
{
  "action": "upload_rows",
  "table_name": "F4D_sensors_data",
  "rows": [
    {
      "row_id": "test-row-1",
      "Timestamp": "2026-03-20T12:00:00",
      "TimeBucket": 202603201200,
      "Last_Packet_Time": "2026-03-20T11:59:50",
      "LLA": "test_lla",
      "Owner": "nir_test",
      "Mac_Address": "test_mac",
      "Time_Zone": "Asia/Jerusalem",
      "Exp_ID": 1,
      "Exp_Name": "test_exp",
      "Exp_Location": "Greenhouse A",
      "Label": "Plant 1",
      "Label_Options": "{\"species\":[\"tomato\"]}",
      "Location": "Bench 3",
      "RFID": null,
      "Coordinates_X": 1.2,
      "Coordinates_Y": 0.5,
      "Coordinates_Z": 0.0,
      "Variable": "temperature",
      "Value": 25.5,
      "Package_Count_3min": 1,
      "Source": "test"
    }
  ]
}
```

Example success response:

```json
{
  "status": "success",
  "action": "upload_rows",
  "table_name": "F4D_sensors_data",
  "requested_rows": 1,
  "validated_rows": 1,
  "inserted_rows": 1
}
```

Possible validation error response:

```json
{
  "status": "error",
  "action": "upload_rows",
  "message": "Row validation failed.",
  "validation_error_count": 1,
  "validation_errors": [
    "Row index 0: missing required fields ['LLA', 'Variable']"
  ]
}
```

## Supported Schemas

Both tables share the same metadata columns. Only the time/order columns differ.

### Shared metadata columns

Present on both `F4D_sensors_data` and `F4D_packet_events`:

| Column | Type | Notes |
|---|---|---|
| `row_id` | STRING | Required stable row identifier |
| `LLA` | STRING | Required sensor identifier |
| `Owner` | STRING | Device hostname / owner |
| `Mac_Address` | STRING | Device MAC without colons |
| `Time_Zone` | STRING | IANA timezone from the uploading Pi (for example `Asia/Jerusalem`) |
| `Exp_ID` | INT64 | Experiment ID |
| `Exp_Name` | STRING | Experiment name; used by `get_last_timestamp` stream filter |
| `Exp_Location` | STRING | Experiment location from metadata |
| `Label` | STRING | Sensor label |
| `Label_Options` | STRING | JSON text of label options |
| `Location` | STRING | Sensor location |
| `RFID` | STRING | Optional RFID value |
| `Coordinates_X` | FLOAT64 | X coordinate |
| `Coordinates_Y` | FLOAT64 | Y coordinate |
| `Coordinates_Z` | FLOAT64 | Z coordinate |
| `Source` | STRING | Upload source (for example device hostname) |

### `F4D_sensors_data`

Required fields:

- `row_id`
- `Timestamp`
- `LLA`
- `Variable`

Additional table-specific columns:

| Column | Type | Notes |
|---|---|---|
| `Timestamp` | TIMESTAMP | Required interval timestamp |
| `TimeBucket` | INT64 | Compact bucket derived from timestamp |
| `Last_Packet_Time` | TIMESTAMP | Latest packet arrival in the interval |
| `Variable` | STRING | Required measured variable name |
| `Value` | FLOAT64 | Measured value |
| `Package_Count_3min` | INT64 | Number of packets in the 3-minute interval |

Partitioning and clustering:

- Partitioned by `Timestamp`
- Clustered by `Owner`, `Mac_Address`, `Exp_Name`, `LLA`

### `F4D_packet_events`

Required fields:

- `row_id`
- `Interval_Timestamp`
- `LLA`

Additional table-specific columns:

| Column | Type | Notes |
|---|---|---|
| `Interval_Timestamp` | TIMESTAMP | Required flush interval timestamp |
| `TimeBucket` | INT64 | Compact bucket derived from interval timestamp |
| `Packet_Arrival_Time` | TIMESTAMP | Individual packet arrival time |
| `Packet_Order_In_LLA_Interval` | INT64 | Order within sensor interval |
| `Packet_Order_Global_Interval` | INT64 | Order across all sensors in interval |
| `Package_Count_3min` | INT64 | Total packets for sensor in interval |

Partitioning and clustering:

- Partitioned by `Interval_Timestamp`
- Clustered by `Owner`, `Mac_Address`, `Exp_Name`, `LLA`

## Behavior Notes

- Request bodies must be valid JSON objects.
- Unsupported `table_name` values are rejected.
- `upload_rows` requires `rows` to be a non-empty list.
- Datetime values are converted to ISO strings before insert.
- `NaN` and `Inf` float values are converted to `null`.
- Inserts are chunked in batches of `500` rows.
- If one or more insert chunks fail, the API returns `207` with partial error details.
- Dataset and table creation use `exists_ok=True` and return clearer `500` errors if creation fails.
- During upload, if BigQuery reports `NotFound` for the target table, the service attempts to recreate the table once and retries the insert chunk.
- There is currently no authentication layer in the function itself.

### `get_last_timestamp` query strategy

**Deployed `main.py`:** runs one `MAX(timestamp_column)` query filtered by `Owner`, `Mac_Address`, and `Exp_Name`.

**Cost-effective variant (`main - cost efective.py`):** optional two-step lookup intended to reduce BigQuery scan cost for active devices:

1. **Fast path:** `MAX(...)` over the last 14 days only (`timestamp_column >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)`).
2. **Fallback:** if the fast path returns no rows, run the full-table `MAX(...)` query. This covers devices that were offline for more than 14 days.

The cost-effective handler is a drop-in replacement for `handle_get_last_timestamp` in `main.py`. Merge it when you want the 14-day optimization in production.

## Quick Test With curl

```bash
curl -X POST http://localhost:8080 ^
  -H "Content-Type: application/json" ^
  -d "{\"action\":\"get_last_timestamp\",\"table_name\":\"F4D_sensors_data\",\"owner\":\"nir_test\",\"mac_address\":\"test_mac\",\"experiment_name\":\"test_exp\"}"
```

## More Request Examples

### Example: get last timestamp from deployed service

```bash
curl -X POST "https://f4d-bq-sync-1000435921680.me-west1.run.app" ^
  -H "Content-Type: application/json" ^
  -d "{\"action\":\"get_last_timestamp\",\"table_name\":\"F4D_sensors_data\",\"owner\":\"nir_test\",\"mac_address\":\"test_mac\",\"experiment_name\":\"test_exp\"}"
```

Example response when the stream already has data:

```json
{
  "status": "success",
  "action": "get_last_timestamp",
  "table_name": "F4D_sensors_data",
  "table_exists": true,
  "stream_exists": true,
  "last_timestamp": "2026-03-20T12:03:00+00:00"
}
```

Example response when the table or stream is not there yet:

```json
{
  "status": "success",
  "action": "get_last_timestamp",
  "table_name": "F4D_sensors_data",
  "table_exists": false,
  "stream_exists": false,
  "last_timestamp": null
}
```

### Example: upload sensor rows to deployed service

```bash
curl -X POST "https://f4d-bq-sync-1000435921680.me-west1.run.app" ^
  -H "Content-Type: application/json" ^
  -d "{\"action\":\"upload_rows\",\"table_name\":\"F4D_sensors_data\",\"rows\":[{\"row_id\":\"demo-row-1\",\"Timestamp\":\"2026-03-20T12:00:00\",\"TimeBucket\":202603201200,\"Last_Packet_Time\":\"2026-03-20T11:59:50\",\"LLA\":\"demo_lla\",\"Owner\":\"demo_owner\",\"Mac_Address\":\"demo_mac\",\"Time_Zone\":\"Asia/Jerusalem\",\"Exp_ID\":1,\"Exp_Name\":\"demo_exp\",\"Variable\":\"temperature\",\"Value\":25.5,\"Package_Count_3min\":1,\"Source\":\"curl\"}]}"
```

Example response:

```json
{
  "status": "success",
  "action": "upload_rows",
  "table_name": "F4D_sensors_data",
  "requested_rows": 1,
  "validated_rows": 1,
  "inserted_rows": 1
}
```

### Example: upload packet event rows

```bash
curl -X POST "https://f4d-bq-sync-1000435921680.me-west1.run.app" ^
  -H "Content-Type: application/json" ^
  -d "{\"action\":\"upload_rows\",\"table_name\":\"F4D_packet_events\",\"rows\":[{\"row_id\":\"packet-demo-1\",\"Interval_Timestamp\":\"2026-03-20T12:15:00\",\"TimeBucket\":202603201215,\"Packet_Arrival_Time\":\"2026-03-20T12:14:10.100\",\"LLA\":\"demo_lla\",\"Owner\":\"demo_owner\",\"Mac_Address\":\"demo_mac\",\"Exp_ID\":1,\"Exp_Name\":\"demo_exp\",\"Packet_Order_In_LLA_Interval\":1,\"Packet_Order_Global_Interval\":1,\"Packet_Count_3min\":1,\"Source\":\"curl\"}]}"
```

### Example: duplicate-safe client flow

Use `get_last_timestamp` before uploading new data for a stream.

1. Query the latest stored timestamp for `owner + mac_address + experiment_name`.
2. Compare the next candidate row timestamp on the client side.
3. Skip upload if the candidate timestamp is older than or equal to the returned `last_timestamp`.
4. Upload only rows newer than the returned timestamp.

Pseudo-flow:

```python
last_timestamp = api_get_last_timestamp(...)

if last_timestamp is not None and row_timestamp <= last_timestamp:
    print("Skip duplicate or older row")
else:
    api_upload_rows([row])
```

Example:

- `last_timestamp = 2026-03-20T12:03:00+00:00`
- next row timestamp = `2026-03-20T12:02:59+00:00`
- result: do not upload

Example:

- `last_timestamp = 2026-03-20T12:03:00+00:00`
- next row timestamp = `2026-03-20T12:03:30+00:00`
- result: upload

## Project Layout

```text
f4d-bq-sync/
├── main.py                    # Deployed HTTP function (entry point: f4d_bq_sync)
├── main - cost efective.py    # Optional cost-optimized get_last_timestamp handler
├── requirements.txt
└── README.md
```

Field devices call this service through `F4D_python/DB/f4d_bq_sync.py`, which reads local DuckDB rows and uploads incrementally using `get_last_timestamp` followed by `upload_rows`.

## Main Entry Point

The deployed HTTP function entry point is:

```python
f4d_bq_sync
```

This is the symbol to use when deploying with Google Cloud Functions or when running locally with `functions-framework`.
