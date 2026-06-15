# Field 4D - Sensor Network Health & Synchronization Engine

An automated analytics and reporting microservice deployed as a Google Cloud Function (Python 3.10+). This service merges BigQuery telemetry logs with real-time Firestore ground-truth metadata to provide highly accurate, cost-optimized system administration reports.

## Core Architectural Features

### 1. Cost-Optimized Telemetry Scans (BigQuery)
The SQL engine limits its scan strictly to the last **25 hours**. This narrow window is sufficient to calculate daily packet loss (based on an expected 480 pings/day) and evaluate real-time hardware voltage metrics (the last 20 pings/1 hour of data), drastically reducing BigQuery processing costs compared to full-week table scans.

### 2. Dual-API Firestore Synchronization 
To compensate for the narrow BigQuery window and prevent the "Vanishing Sensor" issue, the script queries two centralized FastAPI endpoints:
* **`/metadata/experiments`:** Establishes the ground-truth baseline of which experiments are actively intended to be running, and the absolute `active_count` expected for each.
* **`/last-package`:** Retrieves real-time metadata for every sensor. If a sensor is required to be active but has not transmitted telemetry in over 25 hours (absent from BigQuery), the engine extracts its true `Last_Seen` time from Firestore, rounds it to the nearest 3-minute transmission interval, and explicitly forces it into the alert report.

### 3. Experiment Lifecycle Detection
By cross-referencing BigQuery streams with Firestore states, the engine intelligently categorizes experiment lifecycles:
* **Active:** Normal telemetry evaluation.
* **Stopped:** If an experiment emitted telemetry within the last 24 hours but is now missing from Firestore's active list, it is marked as gracefully terminated. The report outputs a clean, neutral notification displaying its final transmission timestamp, bypassing unnecessary error analyses.
* **Ignored:** Sensors structurally flagged as `Is_Active: false` (e.g., physically replaced hardware) are entirely filtered out of calculations to prevent false-positive alerts.

### 4. Human-Centric Reporting
* **Natural Sorting Algorithm:** Device strings and sensor labels are sorted alphanumerically (e.g., `Sensor 2` correctly precedes `Sensor 10`).
* **UI Deduplication:** MAC addresses are dynamically evaluated; if a MAC is already present within a customized Device Name, it will not be redundantly printed.
* **Targeted Escalation:** For active experiments, only problematic sensors are printed to the report table, preventing alert fatigue.

## Deployment Instructions

1. **Host Environment:** Deploy to Google Cloud Functions (1st or 2nd Gen).
2. **Runtime Configuration:**
   * **Language:** `Python 3.10+`
   * **Entry Point:** `send_daily_reports`
   * **Trigger:** HTTPS (Require authentication)
   * **Memory:** `512 MB` (Scales comfortably to thousands of sensors)
   * **Timeout:** `120 seconds`
3. **IAM Requirements:** Ensure the assigned Service Account holds the `BigQuery Data Viewer` and `BigQuery Job User` roles.
4. **Automation:** Connect the HTTP trigger to Google Cloud Scheduler using a standard Cron expression (e.g., `0 9 * * *` for daily execution) combined with an OIDC token matching the service account permissions.