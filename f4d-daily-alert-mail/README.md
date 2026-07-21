# Field 4D - Sensor Network Health & Synchronization Engine

An automated analytics and reporting microservice deployed as an HTTP Google Cloud Function (Python 3.10+). The service combines recent BigQuery telemetry with real-time Firestore metadata to generate system-administration sensor health reports and send them by email.

## Cloud Function Entry Point

```text
send_daily_reports
```

The function is triggered through HTTPS, runs the telemetry and metadata checks, builds an HTML report for each target administrator, and submits the report to the Field 4D email-sender service.

## Core Architecture

### 1. Cost-Optimized BigQuery Scan

The BigQuery query reads only the most recent **25 hours** of sensor telemetry. This window supports:

- Rolling 24-hour packet-loss calculations.
- Sensor activity checks based on the last 15 minutes.
- Battery analysis using recent voltage measurements.
- Detection of experiments that stopped within the last 24 hours.

The normal expected transmission rate is one packet every 3 minutes:

```text
480 packets per 24 hours
```

### 2. Permissions-Based Report Routing

The function reads `F4D_permissions` and creates report rows only for authorized administrator and experiment combinations.

The current permission logic includes:

- Users with `Role = 'system_admin'`.
- Explicitly listed administrator email addresses.
- Experiment-specific access through `Experiment`.
- Wildcard access through `Experiment = '*'`.

### 3. BigQuery Telemetry Metrics

For every sensor LLA, experiment, device, and report recipient, the function calculates:

- `Last_Seen`
- `Is_Active`
- Actual packets received during the rolling 24-hour window.
- Expected packet count.
- Packet-loss percentage.
- Battery status.

A sensor is marked active when BigQuery received a packet during the last 15 minutes.

### 4. Battery Health Logic

Battery voltage is evaluated independently for each email and LLA.

The report uses the following statuses:

- **OK** - no battery alert.
- **POSSIBLE BATTERY ISSUE** - at least 3 readings below 2700 mV during the last hour, or at least 6 during the last 3 hours.
- **REPLACE BATTERY** - more than 20% of the last 20 battery readings are below 2700 mV.

### 5. Firestore Ground-Truth Synchronization

The function performs HTTP `GET` requests to two centralized API endpoints:

- **`/metadata/experiments`** - returns active experiments and the expected active sensor count.
- **`/last-package`** - returns the current Firestore document for every sensor LLA.

Firestore metadata is used to determine:

- Which experiments are currently active.
- Which LLAs are currently active.
- Which sensors were physically replaced.
- Which active sensors disappeared from the 25-hour BigQuery scan.
- The last known transmission time for vanished sensors.

Only LLAs currently marked active in Firestore are retained in the active experiment analysis. Replaced or inactive LLAs are excluded from the normal report rows.

## Sensor Replacement Logic

### Replacement Detection

A replaced sensor is identified through a Firestore location ending in:

```text
-replaced
```

For example:

```text
43-replaced
```

The base location is therefore:

```text
43
```

The replacement event is stored by the combined key:

```text
(experiment, location)
```

This prevents an identically named location in another experiment from receiving the wrong replacement timestamp.

If the Firestore sensor document does not contain an experiment name, the function stores a location-only fallback for that device.

If more than one replaced sensor document matches the same experiment and location, the function uses the most recent `updated_at` timestamp.

### Rounding `updated_at`

The Firestore `updated_at` value is converted to `Asia/Jerusalem` and rounded **upward** to the next fixed 3-minute transmission point:

```text
00, 03, 06, 09, 12, 15, 18, 21, ...
```

Examples:

```text
16:19:59 -> 16:21:00
16:20:10 -> 16:21:00
16:21:00 -> 16:21:00
16:21:01 -> 16:24:00
```

Rounding upward prevents the system from expecting a packet before the replacement sensor could begin transmitting.

### Packet Loss After Replacement

During the first 24 hours after a replacement, the expected packet count is calculated from the rounded replacement time rather than from a full 24-hour window.

The expected count is always an integer:

```text
completed 3-minute intervals + the first scheduled timestamp
```

Conceptually:

```python
completed_intervals = elapsed_time // 3 minutes
expected_packets = completed_intervals + 1
```

Examples:

```text
3 hours after replacement  -> 61 scheduled timestamps
12 hours after replacement -> 241 scheduled timestamps
```

The first rounded timestamp itself is included as an expected transmission point.

The packet-loss value is bounded between 0% and 100%.

After the replacement timestamp is more than 24 hours old, the sensor returns to the standard rolling 24-hour packet-loss calculation.

## Vanished Sensor Detection

An active Firestore sensor may be absent from BigQuery because it did not transmit during the 25-hour scan window.

For each active experiment, the function compares:

- Active LLAs from Firestore.
- Active LLAs present in the BigQuery result.

A Firestore sensor missing from BigQuery is added manually to the report with:

- Its Firestore location.
- Its device name.
- Its Firestore `last_seen` value.
- `Is Active = X`.
- No calculated battery or packet-loss value.

The Firestore `last_seen` timestamp is rounded upward to a 3-minute interval for display.

## Experiment Lifecycle Detection

Experiments are classified using both BigQuery and Firestore.

### Active

The experiment is currently included in the Firestore active experiment list. Its active sensors are evaluated normally.

### Recently Stopped

The experiment is missing from Firestore's active list but has BigQuery telemetry from the last 24 hours.

The report shows a neutral stopped-experiment notice and its final BigQuery transmission time. Sensor-health alerts are not generated for that experiment.

### Ignored

An experiment that is not active in Firestore and has no BigQuery transmission during the last 24 hours is omitted from the report.

## Alert Rules

A sensor requires attention when at least one of these conditions is true:

- `Is Active = X`
- Battery status is `REPLACE BATTERY`
- Battery status is `POSSIBLE BATTERY ISSUE`
- Packet loss is greater than 5%

Packet-loss formatting uses two alert levels:

- Greater than 5% - warning.
- Greater than 90% - critical.

Only problematic sensors are included in the email table. If no sensor requires attention, the report displays an all-healthy message for that experiment.

## HTML Reporting

The report is grouped hierarchically:

```text
Recipient
  Owner
    Device / MAC
      Experiment
        Sensor alerts
```

Presentation features include:

- Natural alphanumeric sorting, so location 2 appears before location 10.
- Device-name and MAC deduplication.
- Experiment-level healthy or attention badges.
- Conditional formatting for activity, battery, and packet-loss alerts.
- A metric explanation section at the bottom of the email.

## Data Access and Write Behavior

### Firestore

The Cloud Function accesses Firestore metadata only through HTTP `GET` requests.

It does not perform:

- `POST`
- `PUT`
- `PATCH`
- `DELETE`

against the Firestore synchronization APIs.

### BigQuery

The Cloud Function executes a read-only `SELECT` query.

It does not execute:

- `INSERT`
- `UPDATE`
- `DELETE`
- `MERGE`
- `CREATE`
- `DROP`

### Email Service

The function performs one intentional outbound write operation:

```text
POST to the Field 4D email-sender service
```

This POST submits the generated email payload. It does not update Firestore or BigQuery.

## Error Handling

The function returns:

- `200` when all reports are sent successfully.
- `200` when no report data is found.
- `207` when some emails fail and others succeed.
- `500` when BigQuery initialization or query execution fails.

Firestore API failures are logged per device. The function continues processing other devices using empty metadata for the failed request.

## Deployment Instructions

### Google Cloud Function

Deploy as a 1st- or 2nd-generation HTTP Cloud Function.

Recommended configuration:

- **Runtime:** Python 3.10+
- **Entry point:** `send_daily_reports`
- **Trigger:** HTTPS
- **Authentication:** Required
- **Memory:** 512 MB
- **Timeout:** At least 120 seconds

### Service Account IAM

The Cloud Function service account requires read access to the referenced BigQuery datasets and permission to run query jobs.

Recommended minimum roles:

- **BigQuery Data Viewer**
- **BigQuery Job User**

The service account must also be authorized to invoke any protected internal APIs used by the deployment.

### Cloud Scheduler

The function can be triggered by Google Cloud Scheduler using an authenticated HTTP request and OIDC token.

Example daily cron schedule:

```text
0 9 * * *
```

The Scheduler timezone should be configured explicitly according to the required report-delivery time.

## Main External Dependencies

```text
requests
pandas
google-cloud-bigquery
```

These packages should be included in `requirements.txt` using versions compatible with the selected Cloud Functions Python runtime.
