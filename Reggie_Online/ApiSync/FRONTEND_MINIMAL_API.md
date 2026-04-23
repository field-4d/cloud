# Frontend Minimal API

Contract for the **`reggie_online`** SPA when talking to the **ApiSync** FastAPI backend (`backend/src`). All HTTP paths are appended to the env **`VITE_API_BASE`** (no trailing slash). Real-time pings use a separate full WebSocket URL **`VITE_WS_PING`** (for example `wss://<host>/ws/ping`).

| Env var | Purpose |
|--------|---------|
| `VITE_API_BASE` | Prefix for REST `fetch` calls |
| `VITE_WS_PING` | Full WebSocket URL for `/ws/ping` |

Code references: `reggie_online/src/api/apisyncClient.ts`, `reggie_online/src/api/permissions.ts`, `reggie_online/src/api/metadata.ts`, `reggie_online/src/pages/DashboardPage.tsx`, `reggie_online/src/hooks/useDeviceDashboard.ts`, `reggie_online/src/utils/replaceSensor.ts`, `backend/src/api/firestore_endpoints.py`, `backend/src/api/websocket_endpoints.py`.

---

## Authentication Roadmap

- **Current (development):** No authentication. Plain `fetch` / `WebSocket` with JSON bodies only where noted.
- **Planned (pre-production / production):** **JWT Bearer** authentication on protected routes.
- **Suggested header once enabled:**

  `Authorization: Bearer <token>`

Until JWT is implemented, omit the header. After rollout, the backend team will document which routes require a token and error shapes (`401` / `403`).

---

## Resolve permissions (owner / MAC list for an email)

### Purpose

Map a user email to the list of **owners** and **MAC addresses** they may use (home screen device picker).

### Endpoint

`GET /GCP-FS/permissions/resolve`

### Current Auth

None required.

### Future Auth

JWT Bearer token planned.

### Query Params

| Param | Required | Description |
|-------|----------|-------------|
| `email` | Yes | User email (URL-encoded in the client). |

Frontend: `reggie_online/src/api/permissions.ts` — `encodeURIComponent(email)`.

### Request Payload

None.

### Example Response

```json
{
  "success": true,
  "email": "user@example.com",
  "owners": [
    {
      "owner": "f4d_test",
      "mac_addresses": ["aaaaaaaaaaaa"]
    }
  ]
}
```

Shape from `PermissionsResolveResponse` in `backend/src/api/firestore_endpoints.py`.

### Notes

- On failure the backend may return **`404`** with detail `"No permissions found for this email"` (`PermissionsNotFoundError`).
- **`500` / `502` / `503`** are possible for upstream or format errors; the frontend surfaces a generic error string from `apiGet` (`reggie_online/src/api/apisyncClient.ts`).

---

## List sensors for owner + MAC

### Purpose

Load all sensor rows for a device (dashboard grid, refresh, CSV validation).

### Endpoint

`GET /GCP-FS/metadata/sensors`

### Current Auth

None required.

### Future Auth

JWT Bearer token planned.

### Query Params

| Param | Required | Description |
|-------|----------|-------------|
| `owner` | Yes | Owner / hostname id (e.g. `f4d_test`). |
| `mac_address` | Yes | MAC address (lowercase hex as stored). |
| `exp_name` | No | Exact `exp_name` filter; **not** sent by `reggie_online` today. |

### Request Payload

None.

### Example Response

```json
{
  "success": true,
  "project": "my-gcp-project",
  "dataset": "f4d_test",
  "table": "aaaaaaaaaaaa_metadata",
  "full_table": "my-gcp-project.f4d_test.aaaaaaaaaaaa_metadata",
  "count": 2,
  "data": [
    {
      "Owner": "f4d_test",
      "Mac_Address": "aaaaaaaaaaaa",
      "LLA": "fd002124b00ccf7399b",
      "Exp_Name": "Demo",
      "Active_Exp": false,
      "Label": [],
      "Location": "Lab A",
      "Last_Seen": "2026-04-19T10:00:00+00:00"
    }
  ]
}
```

Rows use **PascalCase** API field names from `_map_firestore_to_api_format` in `backend/src/api/firestore_repository.py`. The frontend types also allow **lowercase** aliases for some fields (`reggie_online/src/api/metadata.ts`).

### Notes

- **`500`** on Firestore or unexpected errors.
- Optional `exp_name` is supported by the backend for filtered queries; the current dashboard always loads the full list for the pair `(owner, mac_address)`.

---

## List experiments (names + counts)

### Purpose

Populate experiment pills and statistics for the selected owner/MAC.

### Endpoint

`GET /GCP-FS/metadata/experiments`

### Current Auth

None required.

### Future Auth

JWT Bearer token planned.

### Query Params

| Param | Required |
|-------|----------|
| `owner` | Yes |
| `mac_address` | Yes |

### Request Payload

None.

### Example Response

```json
{
  "success": true,
  "project": "my-gcp-project",
  "dataset": "f4d_test",
  "table": "aaaaaaaaaaaa_metadata",
  "count": 1,
  "experiments": [
    {
      "exp_name": "Demo",
      "total_sensors": 4,
      "active_count": 1,
      "inactive_count": 3
    }
  ]
}
```

### Notes

- Empty `exp_name` strings are grouped as their own bucket in the backend (`get_experiment_names`).

---

## Single-sensor metadata (details drawer)

### Purpose

Fetch one sensor document by LLA for the details modal (`getActiveMetadata`).

### Endpoint

`GET /GCP-FS/metadata/active`

### Current Auth

None required.

### Future Auth

JWT Bearer token planned.

### Query Params

| Param | Required | Description |
|-------|----------|-------------|
| `owner` | Yes* | Owner id. |
| `hostname` | Yes* | Backward-compatible alias for `owner` (frontend uses **`owner`** only). |
| `mac_address` | Yes | MAC address. |
| `lla` | Yes | Firestore document id (LLA). |

\*Exactly one of `owner` or `hostname` is required (`422` if both missing).

### Request Payload

None.

### Example Response

```json
{
  "success": true,
  "project": "my-gcp-project",
  "dataset": "f4d_test",
  "table": "aaaaaaaaaaaa_metadata",
  "full_table": "my-gcp-project.f4d_test.aaaaaaaaaaaa_metadata",
  "count": 1,
  "data": [
    {
      "Owner": "f4d_test",
      "Mac_Address": "aaaaaaaaaaaa",
      "LLA": "fd002124b00ccf7399b",
      "Exp_Name": "Demo",
      "Coordinates_X": 0,
      "Coordinates_Y": 0,
      "Coordinates_Z": 0
    }
  ]
}
```

### Notes

- **`404`** if the document does not exist.
- **`400`** if owner/MAC in the query does not match the document (`ValueError` from repository).
- Frontend uses the **first** element of `data` when present (`useDeviceDashboard.ts`).

---

## Update sensor metadata (batch — primary frontend contract)

### Purpose

Bulk Firestore updates used for:

- Start / end experiment (`DashboardPage.tsx` — `handleConfirmStartExperiment`, `handleConfirmEndExperiment`)
- CSV upload confirmation (`handleConfirmUpload`)
- Replace sensor (`buildReplaceSensorBatchPayload` in `replaceSensor.ts` + `postBatchMetadataUpdate`)
- Clear prepared experiment (`handleConfirmClearPreparedExperiment`)

### Endpoint

`POST /FS/sensor/update-metadata`

### Current Auth

None required.

### Future Auth

JWT Bearer token planned.

### Query Params

None.

### Request Payload

**Batch shape (used everywhere in `reggie_online`):**

```json
{
  "sensors": [
    {
      "lla": "fd002124b00ccf7399b",
      "hostname": "f4d_test",
      "mac_address": "aaaaaaaaaaaa",
      "updates": {
        "exp_name": "Demo",
        "active_exp": true,
        "is_active": true,
        "exp_started_at": "2026-04-19T12:34:56"
      }
    }
  ]
}
```

- **`hostname`** in payloads is the **owner** string (legacy name; repository still uses the parameter name `hostname`).
- **`updates`** is a loose object; known keys are mapped to Firestore in `batch_update_sensor_metadata` (`exp_name`, `exp_location`, `label`, `location`, `coordinates`, `label_options`, `rfid`, `frequency`, `is_active`, `is_valid`, `active_exp`, `exp_id`). Other keys are written through to Firestore (e.g. `exp_started_at`, `exp_ended_at`).

**Replace-sensor** sends two entries: old LLA (`location` suffixed with `-replaced`, `active_exp` / `is_active` false) and new LLA (copies `exp_id`, `exp_name`, `location`, etc.) — see `buildReplaceSensorBatchPayload`.

**Clear prepared** sets many fields to empty/false, including `label: []`, `coordinates: { "x": null, "y": null, "z": null }`.

**Single-sensor alternative (supported by backend, not used by current `reggie_online` HTTP helpers):**

```json
{
  "owner": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "lla": "fd002124b00ccf7399b",
  "updates": { "label": ["A", "B"] }
}
```

(`owner` may be omitted if `hostname` is provided; `lla` + `updates` are required for single mode.)

### Example Response (batch)

```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated 2 sensor(s)",
  "updated_llas": ["fd002124b00ccf7399b", "fd002124b00ccf7399a"],
  "failed_llas": null,
  "total_operations": 2
}
```

On partial failure, `success` may be `false`, `failed_llas` maps LLA → error string, HTTP **`400`** from the endpoint.

### Notes

- Headers: `Content-Type: application/json` (`DashboardPage.tsx`).
- When **`active_exp`** is true on a document, batch updates **enforce** matching `hostname` / `mac_address` against the stored owner/MAC; when inactive, owner/MAC may be updated from the payload (`batch_update_sensor_metadata` in `firestore_repository.py`).
- Timestamp strings for start/end in the UI use `toISOString().slice(0, 19)` (no timezone suffix in the string).
- **Mismatch:** `postBatchMetadataUpdate` treats success as `response.ok && body.success`. **`handleConfirmUpload`** only checks `response.ok` (not `body.success`) — align error handling if the backend returns `200` with `success: false` (it should not on normal FastAPI paths).

---

## Delete sensor

### Purpose

Hard-delete a sensor document (`postSensorDelete` from sensor details).

### Endpoint

`POST /FS/sensor/delete`

### Current Auth

None required.

### Future Auth

JWT Bearer token planned.

### Query Params

None.

### Request Payload

Backend model: `SensorUpdateRequest` — same three fields as the frontend `DeleteSensorRequest`.

```json
{
  "hostname": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "lla": "fd002124b00ccf7399b"
}
```

Here **`hostname`** is the owner id (same as elsewhere).

### Example Response

```json
{
  "success": true,
  "status": "deleted",
  "message": "Deleted sensor document for fd002124b00ccf7399b"
}
```

### Notes

- **`404`** + `detail` if sensor missing (`status` `not_found` in repository before HTTP mapping).
- **`400`** on owner/MAC mismatch (`status` `mismatch`).
- Frontend parses error **`detail`** from JSON on failure (`metadata.ts`). Checks `body.success` on success.

---

## WebSocket `/ws/ping` (dashboard real-time)

### Purpose

The dashboard opens a **reconnecting** WebSocket (`createReconnectingPingSocket` in `useDeviceDashboard.ts`) to receive **broadcast** JSON messages when **other clients** send ping traffic to the server. The **`reggie_online` app does not send WebSocket messages** in the current code; it only listens.

### Endpoint

Full URL: **`VITE_WS_PING`** (must match the ApiSync host path `/ws/ping`).

### Current Auth

None required.

### Future Auth

JWT for WebSockets is not implemented in this repo; expect the same Bearer story to apply to connections or to an initial HTTP handshake before production—confirm with backend when available.

### Query Params

None (URL is fixed in env).

### Request Payload

N/A for the browser client today (no `WebSocket.send` in `reggie_online`).

### Example message (broadcast after server processes a client text frame)

Ping / validation broadcast shape:

```json
{
  "received": true,
  "timestamp": "2026-04-19T12:34:56Z",
  "payload": {
    "owner": "f4d_test",
    "hostname": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "type": "Ping",
    "LLA": "fd002124b00ccf7399b",
    "validation": {
      "is_valid": true,
      "message": "Sensor added",
      "error": null
    }
  }
}
```

The dashboard matches **`payload.LLA`** (or `lla`) to rows, and only for the **optimistic “new sensor”** path it requires owner/MAC to match the open dashboard context and `type` **`ping`** with validation message **`Sensor added`** (`useDeviceDashboard.ts`).

Invalid JSON sent **to** the server is broadcast as:

```json
{
  "received": false,
  "timestamp": "2026-04-19T12:34:56Z",
  "error": "Invalid JSON format"
}
```

### Notes

- **`Last_Package`** over WebSocket: backend may still persist data; with `LAST_PACKAGE_WS_ENABLED = False` in `websocket_endpoints.py`, broadcast behavior is limited and senders get a sender-only ack — the React app does not rely on Last_Package broadcasts today.

---

## Related backend endpoints (not called by `reggie_online` today)

These exist in `firestore_endpoints.py` if you need them later:

- `POST /FS/sensor/register`, `POST /FS/sensor/update` — device lifecycle; not used by the current SPA.
- `GET /GCP-FS/last-package` — same row shape as `/GCP-FS/metadata/sensors` with `Last_Package` populated.
- `GET /health` — liveness (used by ops, not the React app).

---

## Common mistakes

- **Wrong path prefix:** Read endpoints use **`/GCP-FS/...`**; writes use **`/FS/...`** (no `GCP-FS`). Mixing them returns **`404`**.
- **Owner field naming:** Query params and JSON use **`owner`** or **`hostname`** depending on endpoint; batch items use **`hostname`** for the owner string — keep consistent with existing payloads.
- **Case on API rows:** Metadata **GET** responses favor **PascalCase** keys; **POST** `updates` use **snake_case** Firestore-style keys (`active_exp`, `exp_name`, …).
