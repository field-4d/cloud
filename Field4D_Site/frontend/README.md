# Field4D Frontend

**Author:** Nir Averbuch  
**Last updated:** 2026-04-27

Single-page application (**React 18**, **TypeScript**, **Vite**) for Field4D: login, pick a permitted system and experiment, select sensors/parameters/dates, fetch long-format data from the **FastAPI** backend, and visualize it with **Plotly**. The browser **never** talks to BigQuery directly.

**Canonical API schemas:** [../backend_fastapi/README.md](../backend_fastapi/README.md)  
**Project overview:** [../README.md](../README.md)

---

## Features

- **Auth** — Login via `POST /api/auth`; response includes token + role + permissions; JWT stored for the session (see `authUtils.ts`)
- **Permissions** — `GET /api/permissions` drives which owner / MAC / experiments appear in the dashboard
- **Role-aware management** — Embedded management UI (Users/Permissions/Devices) with backend-enforced scopes
- **Batch assignment** — Existing-user permission assignment supports multi-user/multi-experiment batch flow
- **Duplicate prevention UX** — Existing-permission checks disable/skip duplicates before submit
- **Experiment summary** — `POST /api/experiment-summary` loads sensors, parameters, **sensor label map**, locations, and label counts
- **Data fetch** — `POST /api/fetch-data` loads time-series rows; requests are **chunked** (20 sensors per request) in `DataSelector.tsx`
- **Label-aware UI** — Include/exclude labels (`LabelFilter.tsx`), atomic token helpers (`labelTokenUtils.ts`, `labelAtomOptions.ts`), effective label for charts (`labelGrouping.ts`)
- **Visualizations** — Scatter, histogram, box plot, correlation matrix/scatter, ANOVA scatter, CSV export (`VisualizationPanel.tsx` + `graph-components/`)
- **Advanced tools** — Outlier toggle, artifact filter, analytics health check (proxied through backend for CORS)

---

## Project Structure

```
frontend/
├── index.html                 # Vite HTML shell
├── package.json               # Scripts: dev, build, preview, lint
├── vite.config.ts             # React plugin; optional /api proxy (see note below)
├── tailwind.config.js         # (if present) Tailwind customization
├── postcss.config.js
├── public/                    # Static files served as-is (favicon, logo, …)
└── src/
    ├── main.tsx               # React root
    ├── App.tsx                # Routes / layout
    ├── App.css
    ├── index.css              # Global styles + Tailwind entry
    ├── vite-env.d.ts          # Vite client types; extend for VITE_* vars
    ├── config.ts              # API_BASE_URL, API_ENDPOINTS, analytics URL
    ├── config/
    │   └── logger.ts          # Centralized logging (ENABLE_LOGGING, levels)
    ├── utils/
    │   ├── authUtils.ts       # Login, JWT cookie helpers
    │   ├── labelGrouping.ts   # getEffectiveLabel, collectLabelsFromRows
    │   ├── labelTokenUtils.ts  # Atomic label tokens, include/exclude matching
    │   ├── labelAtomOptions.ts # Options derived from sensorLabelMap
    │   └── labelDisplay.ts     # Display helpers for sensor + location labels
    ├── components/
    │   ├── Auth.tsx
    │   ├── Dashboard.tsx       # Sidebar modules (Data Viewer / Management), collapsible sections
    │   ├── PermissionDashboard.tsx  # Users/Permissions management UI (embedded/modal)
    │   ├── DataSelector.tsx    # Sensors, parameters, dates, fetch-data POST (chunked)
    │   ├── LabelFilter.tsx
    │   ├── VisualizationPanel.tsx
    │   ├── analytics/
    │   │   ├── HealthCheckButton.tsx
    │   │   ├── healthCheck.ts
    │   │   └── index.ts
    │   ├── Advanced-function/
    │   │   ├── OutlierToggle.tsx
    │   │   └── ArtifactFilterToggle.tsx
    │   └── graph-components/
    │       ├── ScatterPlot.tsx
    │       ├── Histogram.tsx
    │       ├── BoxPlot.tsx
    │       ├── CorrelationMatrix.tsx
    │       ├── CorrelationScatter.tsx
    │       ├── ANOVAResultsScatterPlot.tsx
    │       ├── LabelWarningPlaceholder.tsx
    │       └── LoadingSpinner.tsx
```

---

## Prerequisites

- **Node.js** 18+ (or 20+ LTS recommended)
- **npm** (or pnpm/yarn if you adapt commands)
- **Running FastAPI backend** for full flows (default local: `http://localhost:3001`) — see [backend_fastapi/README.md](../backend_fastapi/README.md)

---

## Installation

```bash
cd frontend
npm install
```

---

## Environment Variables (Vite)

Only variables prefixed with **`VITE_`** are exposed to client code.

Create **`frontend/.env`**, **`.env.local`**, or **`.env.development.local`** (gitignored) as needed.

| Variable | When to use | Effect |
|----------|-------------|--------|
| `VITE_USE_LOCAL_BACKEND` | Local development | If set to `true` **and** `import.meta.env.DEV` is true, `API_BASE_URL` in `config.ts` becomes **`http://localhost:3001`**. |
| `VITE_API_BASE_URL` | Production / staging / custom API | Used when **not** taking the local-dev shortcut above (e.g. deployed API origin). Must include scheme: `https://your-api.run.app`. |

**Resolution order in `src/config.ts`:**

1. Dev + `VITE_USE_LOCAL_BACKEND=true` → `http://localhost:3001`
2. Else if `VITE_API_BASE_URL` is non-empty → use it
3. Else → fallback `http://localhost:3001` and a **warning** in the console

**Example `.env.development.local` for local FastAPI:**

```env
VITE_USE_LOCAL_BACKEND=true
```

**Example production build:**

```env
VITE_API_BASE_URL=https://your-field4d-backend.example.com
```

### Note on `vite.config.ts` proxy

The dev server may define a `proxy` for `/api` to a hosted backend. The app’s **`fetch` calls use absolute URLs** built from `API_BASE_URL` (`config.ts`), so they **do not** automatically use that proxy unless you change `config.ts` to use relative paths. For local development, prefer **`VITE_USE_LOCAL_BACKEND=true`** pointing at `localhost:3001`.

---

## Running the Application

All commands assume `cd frontend` first.

### Development (`npm run dev`)

```bash
npm run dev
```

- Starts **Vite** dev server (default **http://localhost:5173**).
- Hot module replacement (HMR) for fast iteration.
- Ensure the FastAPI backend is running if you need API calls (e.g. port **3001** with `VITE_USE_LOCAL_BACKEND=true`).

### Production build (`npm run build`)

```bash
npm run build
```

- Output: **`dist/`** (static HTML, JS, CSS, hashed assets).
- Deploy `dist/` to any static host (nginx, Cloud Storage + CDN, etc.).
- Set **`VITE_API_BASE_URL`** at build time to the real API origin (Vite bakes env into the bundle).

### Preview production build locally (`npm run preview`)

```bash
npm run preview
```

- Serves **`dist/`** locally (default **http://localhost:4173** — Vite default).
- Use this to verify production bundles and API connectivity before deployment.

### Lint

```bash
npm run lint
```

Runs ESLint on `.ts` / `.tsx` files.

---

## How the Frontend Calls the API

### Pattern

- Uses the browser **`fetch`** API.
- **POST** requests send **`Content-Type: application/json`** and **`JSON.stringify(body)`**.
- **GET** requests use query strings where required (e.g. permissions).

Central URL constants live in **`src/config.ts`**:

```ts
export const API_BASE_URL = /* … */;
export const API_ENDPOINTS = {
  AUTH: `${API_BASE_URL}/api/auth`,
  PERMISSIONS: `${API_BASE_URL}/api/permissions`,
  PERMISSION_MANAGE_DEVICES: `${API_BASE_URL}/api/permissions/manage/devices`,
  PERMISSION_MANAGE_EXPERIMENTS: `${API_BASE_URL}/api/permissions/manage/experiments`,
  PERMISSION_MANAGE_NEW_USER: `${API_BASE_URL}/api/permissions/manage/new-user`,
  PERMISSION_MANAGE_EXISTING_USERS_BATCH: `${API_BASE_URL}/api/permissions/manage/existing-users/batch`,
  PERMISSION_CHECK_EXISTING: `${API_BASE_URL}/api/permissions/check-existing`,
  USERS_SEARCH: `${API_BASE_URL}/api/users/search`,
  EXPERIMENT_SUMMARY: `${API_BASE_URL}/api/experiment-summary`,
  FETCH_DATA: `${API_BASE_URL}/api/fetch-data`,
};
```

### Example: POST with JSON (same pattern as `DataSelector.tsx`)

```ts
const response = await fetch(API_ENDPOINTS.FETCH_DATA, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    owner,
    mac_address,
    experiment: selectedExperiment,
    selectedSensors: sensorChunk,
    selectedParameters: selectedParameters,
    dateRange: utcRange, // { start, end } ISO timestamps
  }),
});

if (!response.ok) throw new Error(`HTTP ${response.status}`);
const data = await response.json();
```

---

## Request / Response Payloads (frontend contract)

Types below match the FastAPI models. Field names are **camelCase** in JSON where the backend defines them (e.g. `experimentName`, `sensorLabelMap`).

### `POST /api/auth`

**Request:**

```json
{
  "email": "user@example.com",
  "password": "plain text"
}
```

**Response (success):**

```json
{
  "success": true,
  "message": "Authentication successful",
  "userData": { "email": "user@example.com" },
  "jwtToken": "<jwt string>",
  "access_token": "<jwt string>",
  "token_type": "bearer",
  "email": "user@example.com",
  "role": "admin",
  "permissions": [
    {
      "owner": "owner_id",
      "mac_address": "aa:bb:cc",
      "experiment": "exp_1",
      "role": "admin"
    }
  ]
}
```

Handled in **`authUtils.ts`** / **`Auth.tsx`**.

---

### `GET /api/permissions?email=...`

**Query:** `email` URL-encoded.

**Response:**

```json
{
  "success": true,
  "permissions": [
    {
      "email": "user@example.com",
      "owner": "owner_id",
      "mac_address": "mac",
      "experiment": "exp_1",
      "role": "user",
      "valid_from": "...",
      "valid_until": null,
      "created_at": "...",
      "device_name": "...",
      "description": null
    }
  ]
}
```

Used in **`Dashboard.tsx`** to build system and experiment choices.

---

### `POST /api/experiment-summary`

**Request:**

```json
{
  "owner": "owner_id",
  "mac_address": "mac_address_string",
  "experiments": ["exp_1", "exp_2"]
}
```

Use **`["*"]`** to request all experiments for that device (server-side).

**Response:** `ExperimentSummaryRow[]` — array of:

| Field | Type | Meaning |
|-------|------|---------|
| `experimentName` | string | Experiment id/name |
| `experimentId` | number \| null | Numeric experiment id (`Exp_ID`) used for ordering/display |
| `firstTimestamp` / `lastTimestamp` | string (ISO) \| null | Data time bounds (UTC from backend) |
| `sensorCount` | number | Distinct LLA |
| `rowCount` | number | Total rows |
| `sensors` | string[] | LLA list |
| `labelOptions` | string[] | Distinct **latest** labels (per sensor assignment) |
| `locationOptions` | string[] | Distinct locations |
| `parameters` | string[] | Variable names |
| `sensorLabelMap` | `Record<string, string[]>` | LLA → `[composite label]` |
| `labelCounts` | `Record<string, number>` | Label → sensor count |
| `sensorLocationMap` | `Record<string, string>` | LLA → latest location |

Fetched when the user selects an experiment in **`Dashboard.tsx`** and passed down to **`DataSelector`** / **`VisualizationPanel`**.

UI behavior in `Dashboard.tsx`:
- Dropdown label uses `#<experimentId> - <experimentName>` when id exists.
- Sorting priority is `experimentId` (desc), then `lastTimestamp` (desc), then legacy name fallback.
- Active/inactive grouping uses recency: **active = lastTimestamp within last 1 hour**.
- Date picker min/max is based on UTC calendar days derived from `firstTimestamp` and `lastTimestamp`.

---

### `POST /api/fetch-data`

**Request:**

```json
{
  "owner": "owner_id",
  "mac_address": "mac_address_string",
  "experiment": "exp_1",
  "selectedSensors": ["LLA_1", "LLA_2"],
  "selectedParameters": ["temperature", "humidity"],
  "dateRange": {
    "start": "2025-03-01T00:00:00.000Z",
    "end": "2025-03-31T23:59:59.999Z"
  }
}
```

- **`selectedLabels`:** optional; **ignored by the backend**. Do not rely on it for filtering.
- **Chunking:** `DataSelector.tsx` splits `selectedSensors` into chunks of **20** per request to limit payload size.
- **Date semantics:** `DataSelector.tsx` sends UTC day bounds (`00:00:00.000Z` → `23:59:59.999Z`) for selected calendar dates.

**Response:** array of rows:

| Field | Type | Meaning |
|-------|------|---------|
| `timestamp` | string (ISO) | Row time |
| `sensor` | string | LLA |
| `parameter` | string | Variable name |
| `value` | number \| null | Measurement |
| `label` | string \| null | **Current** assignment (latest non-empty Label for that LLA in BQ) |
| `location` | string \| null | Location column |
| `experiment` | string | Experiment name |
| `owner` | string | Owner |
| `mac_address` | string | MAC |

Long-format rows are stored in React state and consumed by **`VisualizationPanel`** and graph components.

---

### Analytics (optional)

- **`API_ENDPOINTS_ANALYTICS`** in `config.ts` — direct Cloud Run URL for analytics services (where used).
- **`GET {API_BASE_URL}/api/analytics-health`** — proxied health check; used by **`HealthCheckButton`** to avoid CORS issues.

---

## Management API usage (frontend)

Used by `PermissionDashboard.tsx`:

- `GET /api/permissions/manage/devices?actor_email=...`
- `GET /api/permissions/manage/experiments?actor_email=...&owner=...&mac_address=...`
- `GET /api/users/search?q=...&actor_email=...` (search only, min 2 chars)
- `POST /api/permissions/check-existing` (duplicate pre-check)
- `POST /api/permissions/manage/new-user` (**system_admin only**)
- `POST /api/permissions/manage/existing-users/batch` (multi-user/multi-experiment)

### Management role behavior

- `read`: cannot access management actions
- `admin`: can assign permissions only within admin-scoped MACs
- `system_admin`: can assign globally and create new users

### Wildcard behavior

For `admin` and `system_admin`, assignment uses wildcard experiment:

```json
{
  "exp_name": "*",
  "role_val": "admin"
}
```

or in batch:

```json
{
  "exp_names": ["*"],
  "role_val": "system_admin"
}
```

---

## Application Flow (for developers)

1. **`Auth.tsx`** — User logs in → JWT stored (cookie / memory per `authUtils.ts`).
2. **`Dashboard.tsx`** — Sidebar defaults to **Data Viewer**; loads permissions → user picks **owner/MAC** (system) and **experiment** → calls **`POST /api/experiment-summary`** → passes `sensorLabelMap`, `sensorLocationMap`, parameters, sensors into children.
3. **Management module** — Sidebar `Management` section renders `PermissionDashboard` in page mode:
   - `Users` page: new-user flow (system_admin only)
   - `Permissions` page: existing-user assignment flow
   - `Devices` page: placeholder
4. **`DataSelector.tsx`** — User selects sensors, parameters, date range → **`POST /api/fetch-data`** (chunked) → sets long-format **`sensorData`**.
5. **`VisualizationPanel.tsx`** — Renders plots and CSV export from **`sensorData`**, using **`getEffectiveLabel`** / maps for label grouping.

---

## Sensor Labels (frontend rules)

- **`sensorLabelMap`** from experiment summary is the primary **assignment** map (latest label per LLA).
- **`getEffectiveLabel` (`labelGrouping.ts`)** — Prefers a single entry in `sensorLabelMap[sensor]`, then falls back to **`row.label`** from fetch (same assignment from API).
- **Label filter** — Adjusts **which sensors remain selected** (atomic include/exclude); the API does **not** filter historical rows by old `Label` text.

---

## Troubleshooting

| Issue | Things to check |
|-------|-----------------|
| **CORS errors** | Backend `CORS_ALLOW_ORIGINS` includes `http://localhost:5173` (or your dev URL). |
| **Network tab shows wrong host** | `VITE_USE_LOCAL_BACKEND` / `VITE_API_BASE_URL` and rebuild after env changes. |
| **401 on login** | Auth service URL and credentials; password hashing is server-side. |
| **Empty plots** | Date range, selected sensors/parameters, and successful `fetch-data` (check status 200 and array length). |

---

## Contributing & License

See the root [README.md](../README.md) for contacts and license. Prefer small, focused PRs; when changing API shapes, update **`backend_fastapi/README.md`** and this file together.
