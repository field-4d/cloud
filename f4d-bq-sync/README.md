# F4D BigQuery Sync

Small HTTP service for syncing Field4D data into BigQuery.

The service exposes one POST endpoint implemented with `functions-framework`. It supports:

- `get_last_timestamp`: get the most recent timestamp for a specific owner/device/experiment stream
- `upload_rows`: validate and append rows into BigQuery

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
      "Exp_ID": 1,
      "Exp_Name": "test_exp",
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

### `F4D_sensors_data`

Required fields:

- `row_id`
- `Timestamp`
- `LLA`
- `Variable`

Important optional fields commonly used by clients:

- `Owner`
- `Mac_Address`
- `Exp_ID`
- `Exp_Name`
- `Value`
- `Package_Count_3min`
- `Source`

Partitioning and clustering:

- Partitioned by `Timestamp`
- Clustered by `Owner`, `Mac_Address`, `Exp_Name`, `LLA`

### `F4D_packet_events`

Required fields:

- `row_id`
- `Interval_Timestamp`
- `LLA`

Important optional fields commonly used by clients:

- `Owner`
- `Mac_Address`
- `Exp_ID`
- `Exp_Name`
- `Packet_Arrival_Time`
- `Packet_Order_In_LLA_Interval`
- `Packet_Order_Global_Interval`
- `Packet_Count_3min`
- `Source`

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
- There is currently no authentication layer in the function itself.

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
  -d "{\"action\":\"upload_rows\",\"table_name\":\"F4D_sensors_data\",\"rows\":[{\"row_id\":\"demo-row-1\",\"Timestamp\":\"2026-03-20T12:00:00\",\"TimeBucket\":202603201200,\"Last_Packet_Time\":\"2026-03-20T11:59:50\",\"LLA\":\"demo_lla\",\"Owner\":\"demo_owner\",\"Mac_Address\":\"demo_mac\",\"Exp_ID\":1,\"Exp_Name\":\"demo_exp\",\"Variable\":\"temperature\",\"Value\":25.5,\"Package_Count_3min\":1,\"Source\":\"curl\"}]}"
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

## Test Scripts

The file `test_bq/test_bq_sync.py` contains manual API checks against the deployed URL. It covers scenarios such as:

- querying a missing stream
- owner/mac/experiment isolation
- duplicate row uploads
- missing required fields
- packet event inserts

Run it with:

```bash
python test_bq/test_bq_sync.py
```

The file `test_bq/test_table_creation_and_last_timestamp.py` is a focused workflow test for:

- checking the `table_exists` and `stream_exists` flags
- uploading a first row to a unique stream
- verifying that `get_last_timestamp` returns the uploaded timestamp
- demonstrating how to skip duplicate uploads on the client side

Run it with:

```bash
python test_bq/test_table_creation_and_last_timestamp.py
```

It already points to:

```txt
https://f4d-bq-sync-1000435921680.me-west1.run.app
```

## Main Entry Point

The deployed HTTP function entry point is:

```python
f4d_bq_sync
```

This is the symbol to use when deploying with Google Cloud Functions or when running locally with `functions-framework`.
