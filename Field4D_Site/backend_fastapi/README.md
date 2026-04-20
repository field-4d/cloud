# Field4D FastAPI Backend

**Author:** Nir Averbuch  
**Last updated:** 2026-03-29

Python **FastAPI** service that reads long-format sensor data from **Google BigQuery** and exposes REST endpoints for authentication (via an external GCP auth service), permissions, experiment summaries, and time-series fetch. The browser never queries BigQuery directly.

**See also:** [INTEGRATION.md](INTEGRATION.md) (minimal env + run checklist) · [../frontend/README.md](../frontend/README.md) (client)

---

## Features

- **REST API** — JSON endpoints under `/api` for auth, permissions, experiment metadata, and sensor data
- **BigQuery integration** — Fixed tables for sensor data, permissions, and MAC→device display names (`config/settings.py`)
- **Sensor label semantics** — Labels are **assignment metadata** per `(Exp_Name, LLA)`: the **latest non-empty `Label`** in BigQuery drives `sensorLabelMap`, `labelOptions`, `labelCounts`, and the `label` field on each fetched row (not historical row text alone)
- **External auth proxy** — `POST /api/auth` hashes the password (SHA-256 → Base64) and forwards to `GCP_AUTH_URL`
- **Analytics health proxy** — `GET /api/analytics-health` calls `{GCP_ANALYTICS_URL}/health` for CORS-safe monitoring from the SPA
- **CORS** — Configurable via `CORS_ALLOW_ORIGINS` (default includes Vite dev origin)
- **OpenAPI** — Interactive docs at `/docs` when the server is running

---

## Project Structure

```
backend_fastapi/
├── main.py                      # FastAPI app, CORS, router includes, GET /health
├── requirements.txt             # Python dependencies
├── .env                         # Local secrets (not in git): GCP, auth URL, analytics URL, CORS
├── README.md                    # This file
├── INTEGRATION.md               # Short integration checklist for frontend devs
├── config/
│   └── settings.py              # Pydantic BaseSettings: project, table IDs, URLs, CORS
├── services/
│   └── bigquery_client.py       # run_query() helper for parameterized BigQuery jobs
├── routers/
│   ├── auth.py                  # POST /api/auth
│   ├── permissions.py           # GET /api/permissions
│   ├── experiment_summary.py    # POST /api/experiment-summary
│   ├── fetch_data.py            # POST /api/fetch-data
│   └── analytics_health.py      # GET /api/analytics-health
└── utils/                       # Optional shared helpers (e.g. label parsing)
```

---

## Installation

1. **Python** 3.11+ recommended.

2. **Install dependencies**

   ```bash
   cd backend_fastapi
   pip install -r requirements.txt
   ```

3. **Credentials**

   Create `backend_fastapi/.env` with at least:

   - GCP project and service account fields used by the BigQuery client (`GOOGLE_CLOUD_PROJECT` / `GCP_PROJECT_ID`, `GCP_CLIENT_EMAIL`, `GCP_PRIVATE_KEY`, etc.)
   - `GCP_AUTH_URL` (or `AUTH_URL`) for login
   - Optionally `GCP_ANALYTICS_URL` for analytics health
   - Optionally `CORS_ALLOW_ORIGINS` (comma-separated origins, or `*`)

   **Private key:** In `.env`, newlines in the private key are often escaped as `\n`; the Google client libraries accept this.

   **Do not commit `.env`.**

   **Cloud Run note:** You can also mount a Secret Manager file and point the app at it with
   `ENV_FILE_PATH`. The backend will use that file instead of the local `backend_fastapi/.env`.

---

## Running the Application

### Start the FastAPI server (local)

```bash
cd backend_fastapi
uvicorn main:app --reload --host 0.0.0.0 --port 3001
```

The API listens on **`http://localhost:3001`**.

This matches the frontend dev flow in `npm run dev` when `VITE_USE_LOCAL_BACKEND=true`.

### Access Points (local)

| URL | Description |
|-----|-------------|
| `http://localhost:3001/health` | Liveness JSON |
| `http://localhost:3001/docs` | Swagger UI (try requests) |
| `http://localhost:3001/redoc` | ReDoc |

### Quick health check (curl)

```bash
curl -s http://localhost:3001/health
```

Expected:

```json
{"status":"ok"}
```

---

## API Endpoints

All business routes are prefixed with **`/api`** (see `main.py`).

### `GET /health`

Liveness probe (no `/api` prefix).

**Response:**

```json
{ "status": "ok" }
```

---

### `POST /api/auth`

Authenticates against the external service at `GCP_AUTH_URL`. Request body uses **plain** `password`; the backend hashes it before forwarding.

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Success response (200):**

```json
{
  "success": true,
  "message": "Authentication successful",
  "userData": { "email": "user@example.com" },
  "jwtToken": "<token string>"
}
```

**Typical errors:** `400` missing fields, `401` invalid credentials, `503` auth service unreachable.

**Example (curl):**

```bash
curl -s -X POST http://localhost:3001/api/auth \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"password\":\"secret\"}"
```

---

### `GET /api/permissions`

**Query parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `email` | Yes | User email |

**Success response:**

```json
{
  "success": true,
  "permissions": [
    {
      "email": "user@example.com",
      "owner": "owner_id",
      "mac_address": "aa:bb:cc:dd:ee:ff",
      "experiment": "exp_1",
      "role": "user",
      "valid_from": "2025-01-01T00:00:00",
      "valid_until": null,
      "created_at": "2025-01-01T00:00:00",
      "device_name": "Greenhouse A",
      "description": null
    }
  ]
}
```

**Example (curl):**

```bash
curl -s "http://localhost:3001/api/permissions?email=user%40example.com"
```

---

### `POST /api/experiment-summary`

Returns one summary object per experiment for a given **device** (`owner` + `mac_address`).

**Request body:**

```json
{
  "owner": "owner_id",
  "mac_address": "aa:bb:cc:dd:ee:ff",
  "experiments": ["exp_1", "exp_2"]
}
```

- To load **all** experiments for that device, include **`"*"`** inside the array (e.g. `["*"]`).

**Success response:** JSON **array** of objects:

```json
[
  {
    "experimentName": "exp_1",
    "experimentId": 42,
    "firstTimestamp": "2025-01-01T00:00:00",
    "lastTimestamp": "2025-06-01T00:00:00",
    "sensorCount": 12,
    "rowCount": 1000000,
    "sensors": ["LLA_1", "LLA_2"],
    "labelOptions": ["north Z0", "south Z1"],
    "locationOptions": ["Greenhouse A"],
    "parameters": ["temperature", "humidity"],
    "sensorLabelMap": {
      "LLA_1": ["north Z0"],
      "LLA_2": ["south Z1"]
    },
    "labelCounts": { "north Z0": 5, "south Z1": 7 },
    "sensorLocationMap": { "LLA_1": "Greenhouse A" }
  }
]
```

**Label semantics:** `sensorLabelMap`, `labelOptions`, and `labelCounts` derive from the **latest non-empty `Label` per `(Exp_Name, LLA)`** in BigQuery.
`experimentId` is derived from `Exp_ID` (cast to INT64) per experiment.

**Example (curl):**

```bash
curl -s -X POST http://localhost:3001/api/experiment-summary \
  -H "Content-Type: application/json" \
  -d "{\"owner\":\"owner_id\",\"mac_address\":\"aa:bb:cc:dd:ee:ff\",\"experiments\":[\"*\"]}"
```

---

### `POST /api/fetch-data`

Returns **long-format** rows for charts and CSV export.
The backend applies a half-open timestamp window internally: `Timestamp >= start` and `Timestamp < endExclusive` (`end + 1ms`) to avoid day-end precision issues.

**Request body:**

```json
{
  "owner": "owner_id",
  "mac_address": "aa:bb:cc:dd:ee:ff",
  "experiment": "exp_1",
  "selectedSensors": ["LLA_1", "LLA_2"],
  "selectedParameters": ["temperature", "humidity"],
  "dateRange": {
    "start": "2025-03-01T00:00:00Z",
    "end": "2025-03-31T23:59:59Z"
  }
}
```

- **`selectedLabels`** (optional) — **Deprecated.** Ignored if present. Label-based analysis is driven by **which sensors** the client selects (see frontend README).
- **Date semantics:** clients should send UTC timestamps; frontend currently sends UTC day bounds (`00:00:00.000Z` → `23:59:59.999Z`) for selected dates.

**Success response:** JSON array of rows:

```json
[
  {
    "timestamp": "2025-03-15T12:00:00",
    "sensor": "LLA_1",
    "parameter": "temperature",
    "value": 23.4,
    "label": "north Z0",
    "location": "Greenhouse A",
    "experiment": "exp_1",
    "owner": "owner_id",
    "mac_address": "aa:bb:cc:dd:ee:ff"
  }
]
```

**`label` field:** Latest non-empty `Label` for that `LLA` in the experiment (from all history in BigQuery for that experiment), not only rows inside `dateRange`.

**Example (curl):**

```bash
curl -s -X POST http://localhost:3001/api/fetch-data \
  -H "Content-Type: application/json" \
  -d "{\"owner\":\"owner_id\",\"mac_address\":\"aa:bb:cc:dd:ee:ff\",\"experiment\":\"exp_1\",\"selectedSensors\":[\"LLA_1\"],\"selectedParameters\":[\"temperature\"],\"dateRange\":{\"start\":\"2025-03-01T00:00:00Z\",\"end\":\"2025-03-02T00:00:00Z\"}}"
```

---

### `GET /api/analytics-health`

Proxies to `{GCP_ANALYTICS_URL}/health`.

**Success response:**

```json
{
  "success": true,
  "data": {},
  "responseTime": 42
}
```

`data` is the upstream JSON body. If `GCP_ANALYTICS_URL` is missing, the server returns **500**.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLOUD_PROJECT` / `GCP_PROJECT_ID` | GCP project |
| `GCP_CLIENT_EMAIL`, `GCP_PRIVATE_KEY`, … | Service account for BigQuery |
| `GCP_AUTH_URL` / `AUTH_URL` | External login service |
| `GCP_ANALYTICS_URL` / `ANALYTICS_URL` | Analytics base URL for health |
| `CORS_ALLOW_ORIGINS` | Comma-separated list or `*`. Default in code: `http://localhost:5173` |
| `ENV_FILE_PATH` | Optional path to a mounted `.env` file (useful on Cloud Run with Secret Manager) |

Default **BigQuery table IDs** are set in `config/settings.py` (`sensors_data_table`, `permissions_table`, `mac_to_device_table`).

---

## Dependencies

| Package | Role |
|---------|------|
| `fastapi` | Web framework |
| `uvicorn[standard]` | ASGI server |
| `google-cloud-bigquery` | BigQuery client |
| `pydantic-settings` | `.env` + typed settings |
| `python-dotenv` | Env loading (via pydantic-settings) |
| `httpx` | HTTP client for auth + analytics proxies |

See `requirements.txt` for pinned versions in your environment.

---

## Development

### Adding or changing endpoints

1. Add a router module under `routers/` or extend an existing one.
2. Register the router in `main.py` with `app.include_router(..., prefix="/api", ...)`.
3. Use `services/bigquery_client.run_query` for SQL with **parameterized** queries (avoid string interpolation of user input).
4. Document request/response models with Pydantic `BaseModel` classes.

### CORS

Edit `main.py` / `Settings.cors_allow_origins` so the frontend origin (e.g. `http://localhost:5173`) is allowed when testing from a browser.

### Cloud Run deployment

If you want Cloud Run to use the same single-file env style as the legacy backend:

```powershell
docker build -t gcr.io/iucc-f4d/f4d-fastapi-backend:latest .
docker push gcr.io/iucc-f4d/f4d-fastapi-backend:latest

gcloud run deploy f4d-fastapi-backend `
  --image gcr.io/iucc-f4d/f4d-fastapi-backend:latest `
  --region us-central1 `
  --allow-unauthenticated `
  --project iucc-f4d `
  --set-secrets=/secrets/backend/.env=apisync-env:latest `
  --set-env-vars="ENV_FILE_PATH=/secrets/backend/.env"
```

For smooth local frontend dev after deployment, keep the local backend available on
`http://localhost:3001` and set `CORS_ALLOW_ORIGINS` in the env file to include your dev origin,
for example:

```env
CORS_ALLOW_ORIGINS=http://localhost:5173,http://localhost:5174,https://field4d.com
```

---

## Architecture (high level)

```
Browser (React)
    → HTTPS/JSON → FastAPI (this service)
                        → BigQuery (sensor data, permissions, device names)
                        → HTTP → External auth service (login)
                        → HTTP → Analytics service (health)
```

---

## Historical Note

Older branches may reference a Node/Express backend. The maintained API for this repository layout is **`backend_fastapi`**. Legacy documentation may live in git history.
