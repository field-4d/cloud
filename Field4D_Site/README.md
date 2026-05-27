# Field4D Global Web App

> **Note:** Active development may live on a `Dev` branch and can be unstable. Prefer `main` for stable snapshots.

**Last updated:** May 27, 2026

Web application for visualizing and analyzing **long-format sensor data** stored in **Google BigQuery**. The **React** frontend talks to a **Python FastAPI** backend; BigQuery credentials stay on the server.

---

## Repository layout

```
Field4D_Site/
├── backend_fastapi/          # Python FastAPI + BigQuery (primary API)
│   ├── main.py
│   ├── routers/              # auth, permissions, experiment-summary, fetch-data, analytics-health
│   ├── config/settings.py
│   ├── services/bigquery_client.py
│   ├── requirements.txt
│   ├── .env                  # local secrets (not committed)
│   ├── README.md             # API payloads, env vars, run instructions
│   └── INTEGRATION.md        # Short env + run checklist
├── frontend/                 # React + Vite + TypeScript
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── README.md             # UI structure, VITE_* env, scripts
├── README.md                 # This file
└── …
```

A legacy **Node/Express** backend may exist in older branches or folders; the maintained backend for this layout is **`backend_fastapi`**.

---

## Architecture (summary)

1. User signs in with **Firebase Auth** (frontend identity provider).
2. Frontend sends Firebase ID token as `Authorization: Bearer <token>`.
3. FastAPI verifies the token, extracts email, and checks permissions in **BigQuery `F4D_permissions`**.
4. **`GET /api/permissions`** loads allowed `(owner, mac_address, experiment)` rows from BigQuery.
5. **`POST /api/experiment-summary`** returns experiment metadata keyed by real identity: `experimentId` (`Exp_ID`) + display `experimentName` (`Exp_Name`), with sensors, parameters, **latest label per sensor (LLA)**, locations, counts.
6. **`POST /api/fetch-data`** returns long-format rows for selected sensors/parameters/date range; each row includes the **current label assignment** for that sensor (see backend README). Filtering prefers `experimentId` and falls back to name only for legacy clients.
7. **Management routes** (FastAPI) proxy to the access-manager service and normalize responses for frontend JSON usage (Cloud Function responses are plain text). Permission writes continue through the existing Access Manager / BigQuery write flow.

**Current decision:** Permissions are **not** moved to Firestore in this phase.  
- Identity/login: Firebase Auth  
- Permission source of truth: BigQuery `F4D_permissions`  
- Optional legacy registry/audit: BigQuery `F4D_user_table`  
- Legacy `POST /api/auth` may remain available for backward compatibility during transition

**Sensor labels** are **assignment-based** (latest non-empty `Label` per experiment + LLA in BigQuery), not “whatever text was on that row at that timestamp.” Grouping and filtering follow that model.

**Virtual freezer thermocouple sensors** (LLA contains `_freezer_thermo_`) are recognized in the UI: sensor pickers show a secondary subtitle (`Freezer Thermocouple · {lla}`), and their parameters appear under **Freezer Thermocouple Sensors** in the parameter selector (`thermocouple_temperature_c`, board/delta temperatures, and `freezer_reader_ok` status).

---

## Getting started

### 1. Backend (FastAPI)

```bash
cd backend_fastapi
pip install -r requirements.txt
# Add backend_fastapi/.env with GCP + GCP_AUTH_URL (see backend_fastapi/README.md)
uvicorn main:app --reload --host 0.0.0.0 --port 3001
```

Health check: `GET http://localhost:3001/health` → `{"status":"ok"}`

### 2. Frontend (Vite)

```bash
cd frontend
npm install
# Optional: frontend/.env with VITE_USE_LOCAL_BACKEND=true for local API
npm run dev
```

Default dev URL: `http://localhost:5173` (CORS must allow this origin on the backend, or set `CORS_ALLOW_ORIGINS`).

### 3. Connect frontend to local API

In `frontend/.env.development.local` (or `.env`):

```env
VITE_USE_LOCAL_BACKEND=true
```

Alternatively set `VITE_API_BASE_URL` to your deployed API origin.

Important: `VITE_USE_LOCAL_BACKEND=true` only applies in `npm run dev` (`import.meta.env.DEV` mode).  
`npm run preview` uses production-style env resolution and will call `VITE_API_BASE_URL`.

---

## Deployment (GCP)

Validated production endpoints:

- Frontend: `https://field4d.com`
- Backend: `https://f4d-fastapi-backend-1000435921680.us-central1.run.app`

For deployment steps, use the guides under `Deploy_Guide/`:

- `Deploy_Guide/FrontEnd_Update_Short.md` — fast frontend-only update (build, backup, upload, CDN invalidate)
- `Deploy_Guide/BackEnd_Deploy_Short.md` — fast backend-only update (build/push/redeploy Cloud Run)
- `Deploy_Guide/FrontEnd-Update_Site.md` — full frontend update flow with rollback
- `Deploy_Guide/BackEnd_Deploy.md` — full backend deploy/redeploy flow
- `Deploy_Guide/FrontEnd-full_Deply.md` — full infra + deployment reference for frontend

Cloud Run note: after backend deploy, confirm the new revision has traffic (100% for single-revision rollout).  
If traffic remains on an older revision, production API behavior will not reflect latest code.

Quick frontend live-site update (PowerShell):

```powershell
cd frontend
npm install
npm run build

$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
gcloud storage cp --recursive "gs://field4d-frontend-site/**" "gs://field4d-frontend-site-backups/backup_$TIMESTAMP/"
gcloud storage rsync --recursive --delete-unmatched-destination-objects .\dist gs://field4d-frontend-site
gcloud compute url-maps invalidate-cdn-cache frontend-https --path "/*" --project=iucc-f4d
```

Production env reminders before build:

```env
VITE_API_BASE_URL=https://f4d-fastapi-backend-1000435921680.us-central1.run.app
VITE_FIELD4D_ANALYTICS_URL=https://field4d-analytics-1000435921680.us-central1.run.app
```

Production CORS reminder:

- Backend must include `https://field4d.com` in `CORS_ALLOW_ORIGINS`.

---

## Main components (frontend)

| Path | Role |
|------|------|
| `src/components/Auth.tsx` | Login; brute-force lockout UX (see constants in file). |
| `src/components/Dashboard.tsx` | Sidebar module navigation (**Data Viewer** + **Management**), collapsible sections, Data Viewer controls, management page routing. Stable React keys for experiment dropdown entries that share the same `experimentId` across active/inactive runs. |
| `src/components/PermissionDashboard.tsx` | Embedded/modal management UI with `permissionMode` (`new_user` or `permission_assignment`), role-aware restrictions, searchable selectors, batch assignment UX. |
| `src/components/DataSelector.tsx` | Sensors (with optional type subtitle), parameters, date range, chunked **`POST /api/fetch-data`** (chunk size 20 sensors per request). Label Filter panel visibility vs. meaningful label tokens. |
| `src/components/LabelFilter.tsx` | Include/exclude labels (atomic tokens), drives which sensors stay selected. Disabled state when experiment has no meaningful labels (for example `labelOptions: ["[]"]`). |
| `src/components/VisualizationPanel.tsx` | Plotly charts, CSV export, hour-range filter for box plots. |
| `src/components/graph-components/*` | Scatter, histogram, box, correlation plots. Dual-axis scatter/box plots use **per-parameter** axis titles via `formatAxisTitle`. |
| `src/constants/parameterMetadata.ts` | Parameter catalog, display labels, units, categories (including **Freezer Thermocouple Sensors**), `formatAxisTitle`, and `formatParameterValue` for status parameters (`1` → OK). |
| `src/utils/labelGrouping.ts` | `getEffectiveLabel`, `collectLabelsFromRows` for label-grouped analytics. |
| `src/utils/labelAtomOptions.ts` | `hasMeaningfulLabelOptions`, atomic token helpers for label filter options. |
| `src/utils/sensorMetadata.ts` | Detects virtual freezer thermocouple LLAs and builds sensor dropdown subtitles. |

---

## API documentation (canonical)

Authoritative request/response JSON and semantics:

- **[backend_fastapi/README.md](backend_fastapi/README.md)** — all routes, payloads, label semantics, env vars.

Abbreviated index:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/api/auth` | Legacy login path (kept for compatibility during transition) |
| GET | `/api/permissions` | Firebase-authenticated permission lookup in BigQuery |
| POST | `/api/experiment-summary` | Per-experiment `experimentId`, sensors, parameters, **sensorLabelMap**, locations |
| POST | `/api/fetch-data` | Long-format sensor rows |
| GET | `/api/analytics-health` | Analytics service health proxy |
| GET | `/api/permissions/manage/devices` | Device scope for management UI (role-aware) |
| GET | `/api/permissions/manage/experiments` | Experiments for selected device (role-aware) |
| GET | `/api/users/search` | Search existing users (admin/system_admin only) |
| POST | `/api/permissions/check-existing` | Check existing user+experiment permissions for duplicate prevention |
| POST | `/api/permissions/manage/new-user` | Create user + initial permission (**system_admin only**) |
| POST | `/api/permissions/manage/existing-users/batch` | Batch add permissions for selected users/experiments |

**Authentication request (example):**

```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Experiment summary request (example):**

```json
{
  "owner": "owner_id",
  "mac_address": "aa:bb:cc:dd:ee:ff",
  "experiments": ["exp_1", "*"]
}
```

Use `"*"` inside the array to request all experiments for that device (see backend validation).

Password hashing for the external auth service matches SHA-256 → Base64 of the digest (documented in backend README; legacy Node examples in git history).

---

## Management and roles (current behavior)

- **Sidebar modules:** `Data Viewer` and `Management` are separate collapsible sections.
- **Data Viewer default:** opens by default and keeps existing filtering/graph behavior.
- **Management pages:**
  - `Users` → new-user flow (visible/usable only for `system_admin`)
  - `Permissions` → existing-user permission assignment
  - `Devices` → placeholder
- **Role enforcement (backend authoritative):**
  - `read` cannot manage users/permissions
  - `admin` can manage only within MACs where actor has admin scope
  - `system_admin` can manage globally
  - only `system_admin` can create new users
- **Wildcard behavior:** for `admin`/`system_admin`, permission assignment uses wildcard experiment (`*`) in management flow.
- **Duplicate UX protection:** frontend pre-checks existing permissions and skips duplicates; backend still enforces duplicate checks (409) as final safety.

---

## Label filter behavior (frontend)

The Label Filter panel appears when `experiment-summary` returns a non-empty `labelOptions` array, including placeholder values like `["[]"]`.

- **`hasMeaningfulLabelOptions`** (`labelAtomOptions.ts`) distinguishes real atomic tokens (clay, sand, etc.) from empty composite placeholders.
- When only empty placeholders exist, the panel stays visible but **`LabelFilter` is disabled**, shows “No labels available for this experiment”, and all sensors remain selectable.
- When meaningful tokens exist, include/exclude filters work as before (atomic tokens, AND/OR mode).

---

## Parameter metadata and sensor types (frontend)

Parameter display names, units, and picker grouping live in `frontend/src/constants/parameterMetadata.ts`.

- **`formatAxisTitle(parameter)`** — single-parameter Y-axis title (`Label (unit)` or `Label` when unit is empty). Used by scatter and box plots for each axis independently when two parameters are selected.
- **`formatParameterValue(parameter, value)`** — for parameters with `valueType: 'status'` (for example `freezer_reader_ok`), maps `1` → `OK` and other values → `Problem / no reading`.
- **Freezer thermocouple category** — `thermocouple_temperature_c`, `thermocouple_board_temperature_c`, `thermocouple_delta_c`, `freezer_reader_ok`.

Sensor type hints for virtual hardware are in `frontend/src/utils/sensorMetadata.ts`:

- LLAs containing `_freezer_thermo_` are treated as **Freezer Thermocouple** sensors.
- `getSensorTypeSubtitle()` adds a secondary line in the sensor multi-select dropdown.

---

## Data processing (frontend)

`DataSelector.tsx` loads selected sensors in chunks of **20** per `POST /api/fetch-data` request (`CHUNK_SIZE` in that file). Adjust there if your gateway limits differ.

---

## Login attempt protection (frontend)

`Auth.tsx` limits repeated failures (lockout duration, attempt window). Adjust `MAX_LOGIN_ATTEMPTS`, `LOCK_DURATION`, `ATTEMPT_WINDOW` there. State may be stored in `localStorage` for persistence across reloads.

---

## Graph / plot tuning

Layout and grouping options live in the respective files under `frontend/src/components/graph-components/` and `VisualizationPanel.tsx` (e.g. box plot hour filter, hierarchical date → label grouping).

Dual-parameter scatter and box plots assign **separate Y-axis titles** per selected parameter (first parameter → primary axis, second → `yaxis2`) instead of a single combined title. See `formatAxisTitle` in `parameterMetadata.ts`.

See **[frontend/README.md](frontend/README.md)** for the full file map.

---

## Contributing

- Graphics, UX, and visualization contributions are welcome.
- Backend work targets **Python** in `backend_fastapi/`.
- Please coordinate changes that affect API contracts with both **backend README** and **frontend** callers.

Contacts (examples): Nir Averbuch, Idan Ifrach, Prof. Menachem Moshelion — see project correspondence for current emails.

Fork from the appropriate branch (often `Dev` for features), open a PR, and describe API or env changes explicitly.

---

## Documentation index

| Document | Content |
|----------|---------|
| [backend_fastapi/README.md](backend_fastapi/README.md) | FastAPI routes, JSON schemas, BigQuery behavior, `.env` |
| [backend_fastapi/INTEGRATION.md](backend_fastapi/INTEGRATION.md) | Minimal integration checklist |
| [frontend/README.md](frontend/README.md) | Vite env vars, `src/` layout, scripts |
| [Deploy_Guide/FrontEnd_Update_Short.md](Deploy_Guide/FrontEnd_Update_Short.md) | Quick frontend update commands |
| [Deploy_Guide/BackEnd_Deploy_Short.md](Deploy_Guide/BackEnd_Deploy_Short.md) | Quick backend update commands |
| [Deploy_Guide/FrontEnd-Update_Site.md](Deploy_Guide/FrontEnd-Update_Site.md) | Frontend update + rollback guide |
| [Deploy_Guide/BackEnd_Deploy.md](Deploy_Guide/BackEnd_Deploy.md) | Backend Cloud Run deployment guide |
| [Deploy_Guide/FrontEnd-full_Deply.md](Deploy_Guide/FrontEnd-full_Deply.md) | Full frontend deployment setup |

---

## License

See [LICENSE](LICENSE) if present in the repository.
