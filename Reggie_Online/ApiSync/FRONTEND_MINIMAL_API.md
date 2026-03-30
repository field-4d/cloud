# Frontend Minimal API Guide

Minimal endpoint guide for frontend development, ordered exactly like Swagger tags in `backend/src/main.py`:

1. `system`
2. `permissions`
3. `metadata`
4. `sensors`

## Base URL and Example Values

- Base URL (GCP): `https://apisync-1000435921680.us-central1.run.app`
- Email: `nir.averbuch@mail.huji.ac.il`
- Owner: `f4dv2`
- MAC examples: `d83adde260d1`, `d83adde261b0`
- `exp_name` is optional and dynamic during testing.

## 1) System

### GET /health

**What it does**  
Checks backend health quickly.

**Endpoint**  
`GET /health`

**Request example**

```bash
curl "https://apisync-1000435921680.us-central1.run.app/health"
```

**Response**

```json
{
  "status": "ok"
}
```

### GET /

**What it does**  
Serves frontend HTML page from backend.

**Endpoint**  
`GET /`

**Request example**

```bash
curl -I "https://apisync-1000435921680.us-central1.run.app/"
```

**Response**  
HTTP `200` with HTML content (`text/html`).

## 2) Permissions

### GET /GCP-FS/permissions/resolve

**What it does**  
Resolves all owner/MAC combinations available for a user email.

**Endpoint**  
`GET /GCP-FS/permissions/resolve?email={email}`

**Request example**

```bash
curl "https://apisync-1000435921680.us-central1.run.app/GCP-FS/permissions/resolve?email=nir.averbuch@mail.huji.ac.il"
```

**Response**

```json
{
  "success": true,
  "email": "nir.averbuch@mail.huji.ac.il",
  "owners": [
    {
      "owner": "f4dv2",
      "mac_addresses": ["d83adde260d1", "d83adde261b0"]
    }
  ]
}
```

Note: if canonical `/api/permissions/resolve` is enabled later, it belongs to this same section.

## 3) Metadata (Read-only Queries)

### GET /GCP-FS/metadata/active

**What it does**  
Returns one sensor metadata record by `owner` + `mac_address` + `lla`.

**Endpoint**  
`GET /GCP-FS/metadata/active?owner={owner}&mac_address={mac_address}&lla={lla}`

**Request example**

```bash
curl "https://apisync-1000435921680.us-central1.run.app/GCP-FS/metadata/active?owner=f4dv2&mac_address=d83adde260d1&lla=fd002124b001204bd42"
```

**Response**

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "Owner": "f4dv2",
      "Mac_Address": "d83adde260d1",
      "LLA": "fd002124b001204bd42",
      "Active_Exp": false
    }
  ]
}
```

### GET /GCP-FS/metadata/sensors

**What it does**  
Returns all sensors metadata for an owner/MAC, optionally filtered by `exp_name`.

**Endpoint**  
`GET /GCP-FS/metadata/sensors?owner={owner}&mac_address={mac_address}&exp_name={exp_name}`

**Request example**

```bash
curl "https://apisync-1000435921680.us-central1.run.app/GCP-FS/metadata/sensors?owner=f4dv2&mac_address=d83adde260d1&exp_name=YOUR_DYNAMIC_EXPERIMENT_NAME"
```

**Response**

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "LLA": "fd002124b001204bd42",
      "Label": ["plot_a"],
      "Active_Exp": true
    },
    {
      "LLA": "fd002124b00ccf7399a",
      "Label": [],
      "Active_Exp": false
    }
  ]
}
```

### GET /GCP-FS/last-package

**What it does**  
Returns metadata plus latest Last_Package data for each matching sensor.

**Endpoint**  
`GET /GCP-FS/last-package?owner={owner}&mac_address={mac_address}&exp_name={exp_name}`

**Request example**

```bash
curl "https://apisync-1000435921680.us-central1.run.app/GCP-FS/last-package?owner=f4dv2&mac_address=d83adde260d1"
```

**Response**

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "LLA": "fd002124b001204bd42",
      "Last_Package": {
        "temperature": 21.5,
        "humidity": 63.2
      }
    }
  ]
}
```

### GET /GCP-FS/metadata/experiments

**What it does**  
Returns experiments list and active/inactive statistics for selected owner/MAC.

**Endpoint**  
`GET /GCP-FS/metadata/experiments?owner={owner}&mac_address={mac_address}`

**Request example**

```bash
curl "https://apisync-1000435921680.us-central1.run.app/GCP-FS/metadata/experiments?owner=f4dv2&mac_address=d83adde260d1"
```

**Response**

```json
{
  "success": true,
  "count": 2,
  "experiments": [
    {
      "exp_name": "Experiment_A",
      "total_sensors": 10,
      "active_count": 6,
      "inactive_count": 4
    },
    {
      "exp_name": "",
      "total_sensors": 2,
      "active_count": 0,
      "inactive_count": 2
    }
  ]
}
```

## 4) Sensors (Write/Update Actions)

---
> **IMPORTANT - STOP**
>
> **DEVICE INSTALLATION REQUIRED BEFORE ANY WRITE ACTIONS**
>
> **DO NOT USE** `POST /FS/sensor/register`, `POST /FS/sensor/update`, or `POST /FS/sensor/update-metadata`
> for her environment until a device is installed.
>
> Until installation is complete, use read-only endpoints only.
---

### POST /FS/sensor/register

**What it does**  
Registers a new sensor document if not already registered.

**Endpoint**  
`POST /FS/sensor/register`

**Request example**

```bash
curl -X POST "https://apisync-1000435921680.us-central1.run.app/FS/sensor/register" ^
  -H "Content-Type: application/json" ^
  -d "{\"hostname\":\"f4dv2\",\"mac_address\":\"d83adde260d1\",\"lla\":\"fd002124b001204bd42\"}"
```

**Response**

```json
{
  "success": true,
  "status": "created",
  "message": "Created new sensor document for fd002124b001204bd42"
}
```

### POST /FS/sensor/update

**What it does**  
Updates sensor heartbeat/last_seen for an already-registered sensor.

**Endpoint**  
`POST /FS/sensor/update`

**Request example**

```bash
curl -X POST "https://apisync-1000435921680.us-central1.run.app/FS/sensor/update" ^
  -H "Content-Type: application/json" ^
  -d "{\"hostname\":\"f4dv2\",\"mac_address\":\"d83adde260d1\",\"lla\":\"fd002124b001204bd42\"}"
```

**Response**

```json
{
  "success": true,
  "status": "updated",
  "message": "Updated last_seen timestamp for sensor fd002124b001204bd42"
}
```

### POST /FS/sensor/update-metadata

**What it does**  
Updates metadata for one sensor (single mode) or many sensors (batch mode).

**Endpoint**  
`POST /FS/sensor/update-metadata`

**Request example (single)**

```bash
curl -X POST "https://apisync-1000435921680.us-central1.run.app/FS/sensor/update-metadata" ^
  -H "Content-Type: application/json" ^
  -d "{\"owner\":\"f4dv2\",\"mac_address\":\"d83adde260d1\",\"lla\":\"fd002124b001204bd42\",\"updates\":{\"label_options\":[\"plot_a\",\"plot_b\",\"irrigation_zone_1\"],\"label\":[\"plot_a\",\"irrigation_zone_1\"],\"coordinates\":{\"x\":12.5,\"y\":4.8,\"z\":1.1}}}"
```

**Response (single)**

```json
{
  "success": true,
  "status": "updated",
  "message": "Updated metadata for sensor fd002124b001204bd42",
  "updated_fields": ["label_options", "label", "coordinates"]
}
```

**Request example (batch)**

```bash
curl -X POST "https://apisync-1000435921680.us-central1.run.app/FS/sensor/update-metadata" ^
  -H "Content-Type: application/json" ^
  -d "{\"sensors\":[{\"lla\":\"fd002124b001204bd42\",\"hostname\":\"f4dv2\",\"mac_address\":\"d83adde260d1\",\"updates\":{\"label\":[\"plot_a\"],\"coordinates\":{\"x\":10.0,\"y\":20.0,\"z\":0.0}}},{\"lla\":\"fd002124b00ccf7399a\",\"hostname\":\"f4dv2\",\"mac_address\":\"d83adde261b0\",\"updates\":{\"label\":[\"plot_b\"],\"coordinates\":{\"x\":11.0,\"y\":21.0,\"z\":0.2}}}]}"
```

**Response (batch)**

```json
{
  "success": true,
  "status": "updated",
  "updated_llas": ["fd002124b001204bd42", "fd002124b00ccf7399a"],
  "failed_llas": {}
}
```

Note: frontend currently sends `owner` in single mode and `hostname` in batch mode. Backend supports both for compatibility.

## Metadata Editing Rules for Frontend

### Active experiment (`active_exp = true`)

Allowed:
- `label`
- `coordinates`

Do not update directly:
- `exp_name`
- `exp_location`
- `location`
- `active_exp`, `exp_started_at`, `exp_ended_at` (except via dedicated start/end experiment actions)

### Inactive experiment (`active_exp = false`)

Allowed:
- `exp_name` (dynamic/testing value is fine)
- `exp_location`
- `location`
- `label`
- `coordinates`

## Label and Label Options (Multi-Select Contract)

Use arrays for both fields:

- `label_options`: all selectable labels
- `label`: selected labels for this sensor

Example:

```json
{
  "updates": {
    "label_options": ["plot_a", "plot_b", "north_block", "south_block"],
    "label": ["plot_a", "north_block"]
  }
}
```

Suggested frontend parsing for text input:

- delimiters: `,` `;` `|`
- trim spaces
- drop empty values
- dedupe values (keep first occurrence)
- send result as `updates.label` array

Input:

`plot_a | north_block; plot_a, irrigation_zone_1`

Parsed:

`["plot_a", "north_block", "irrigation_zone_1"]`
