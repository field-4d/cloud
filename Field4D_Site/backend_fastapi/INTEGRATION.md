## Frontend Integration Notes (FastAPI)

Full API payloads and responses: **[README.md](README.md)**.

### Required `backend_fastapi/.env` variables
- `GCP_PROJECT_ID`
- `GCP_CLIENT_EMAIL`
- `GCP_PRIVATE_KEY`
- `FIREBASE_PROJECT_ID` (optional but recommended, for Firebase token audience validation)
- `GCP_AUTH_URL` (used by legacy `POST /api/auth` path)
- `GCP_ANALYTICS_URL` (used by `GET /api/analytics-health`)

Optional:
- `CORS_ALLOW_ORIGINS` (comma-separated). If not set, backend allows `http://localhost:5173`.

### Run backend locally
1. `cd backend_fastapi`
2. `pip install -r requirements.txt`
3. Ensure `backend_fastapi/.env` is present (copied from the legacy backend and adjusted).
4. `uvicorn main:app --reload --host 0.0.0.0 --port 3001`

Health:
- `GET /health`

### Expected frontend base URL usage
- The frontend chooses the backend URL via `VITE_USE_LOCAL_BACKEND`.
- In local dev, set `VITE_USE_LOCAL_BACKEND=true` so `API_BASE_URL` becomes `http://localhost:3001`.
- The frontend will call these fixed routes (do not change):
  - `/api/auth`
  - `/api/permissions`
  - `/api/experiment-summary`
  - `/api/fetch-data`
  - `/api/analytics-health`

### Current auth + permissions model
- Identity/login: Firebase Auth
- FastAPI: verifies Firebase bearer token and extracts email
- Permissions source of truth: BigQuery `F4D_permissions`
- Permission writes: existing Access Manager / BigQuery flow
- Firestore is not used for permissions in this phase
