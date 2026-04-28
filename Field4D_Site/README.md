# Field4D Global Web App

> **Note:** Active development may live on a `Dev` branch and can be unstable. Prefer `main` for stable snapshots.

**Last updated:** April 27, 2026

Web application for visualizing and analyzing **long-format sensor data** stored in **Google BigQuery**. The **React** frontend talks to a **Python FastAPI** backend; BigQuery credentials stay on the server.

---

## Repository layout

```
Field4D Site- FastAPI (Long)/
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

1. User signs in via **`POST /api/auth`** (FastAPI forwards to external GCP auth service).
2. **`GET /api/permissions`** loads allowed `(owner, mac_address, experiment)` rows.
3. **`POST /api/experiment-summary`** returns experiment metadata: `experimentId` (`Exp_ID`), sensors, parameters, **latest label per sensor (LLA)**, locations, counts.
4. **`POST /api/fetch-data`** returns long-format rows for selected sensors/parameters/date range; each row includes the **current label assignment** for that sensor (see backend README). Date windows are handled as UTC timestamps.
5. **Management routes** (FastAPI) proxy to the access-manager service and normalize responses for frontend JSON usage (Cloud Function responses are plain text).

**Sensor labels** are **assignment-based** (latest non-empty `Label` per experiment + LLA in BigQuery), not “whatever text was on that row at that timestamp.” Grouping and filtering follow that model.

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

Production CORS reminder:

- Backend must include `https://field4d.com` in `CORS_ALLOW_ORIGINS`.

---

## Main components (frontend)

| Path | Role |
|------|------|
| `src/components/Auth.tsx` | Login; brute-force lockout UX (see constants in file). |
| `src/components/Dashboard.tsx` | Sidebar module navigation (**Data Viewer** + **Management**), collapsible sections, Data Viewer controls, management page routing. |
| `src/components/PermissionDashboard.tsx` | Embedded/modal management UI with `permissionMode` (`new_user` or `permission_assignment`), role-aware restrictions, searchable selectors, batch assignment UX. |
| `src/components/DataSelector.tsx` | Sensors, parameters, date range, chunked **`POST /api/fetch-data`** (chunk size 20 sensors per request). |
| `src/components/LabelFilter.tsx` | Include/exclude labels (atomic tokens), drives which sensors stay selected. |
| `src/components/VisualizationPanel.tsx` | Plotly charts, CSV export, hour-range filter for box plots. |
| `src/components/graph-components/*` | Scatter, histogram, box, correlation plots. |
| `src/utils/labelGrouping.ts` | `getEffectiveLabel`, `collectLabelsFromRows` for label-grouped analytics. |

---

## API documentation (canonical)

Authoritative request/response JSON and semantics:

- **[backend_fastapi/README.md](backend_fastapi/README.md)** — all routes, payloads, label semantics, env vars.

Abbreviated index:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/api/auth` | Login → JWT |
| GET | `/api/permissions` | Permissions for `email` |
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

## Data processing (frontend)

`DataSelector.tsx` loads selected sensors in chunks of **20** per `POST /api/fetch-data` request (`CHUNK_SIZE` in that file). Adjust there if your gateway limits differ.

---

## Login attempt protection (frontend)

`Auth.tsx` limits repeated failures (lockout duration, attempt window). Adjust `MAX_LOGIN_ATTEMPTS`, `LOCK_DURATION`, `ATTEMPT_WINDOW` there. State may be stored in `localStorage` for persistence across reloads.

---

## Graph / plot tuning

Layout and grouping options live in the respective files under `frontend/src/components/graph-components/` and `VisualizationPanel.tsx` (e.g. box plot hour filter, hierarchical date → label grouping). See **[frontend/README.md](frontend/README.md)** for the full file map.

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
