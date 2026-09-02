## Frontend Integration Notes (FastAPI)

Full API payloads and responses: **[README.md](README.md)**.

### Local configuration and credentials
- `GCP_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT`
- Google Application Default Credentials (ADC); if a local credential file is needed,
  store it outside Git and set `GOOGLE_APPLICATION_CREDENTIALS` in the local process
- `FIREBASE_PROJECT_ID` (optional but recommended, for Firebase token audience validation)
- `GCP_AUTH_URL` (used by legacy `POST /api/auth` path)
- `GCP_ANALYTICS_URL` (used by `GET /api/analytics-health`)

Optional:
- `CORS_ALLOW_ORIGINS` (comma-separated). If not set, backend allows `http://localhost:5173`.

### Run backend locally
1. `cd backend_fastapi`
2. `pip install -r requirements.txt`
3. Ensure ADC is available and add only required application settings to
   `backend_fastapi/.env`.
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
  - `/api/v2/fetch-data-page`
  - `/api/analytics-health`

### Current auth + permissions model
- Identity/login: Firebase Auth
- FastAPI: verifies Firebase bearer token and extracts email
- Permissions source of truth: BigQuery `F4D_permissions`
- Permission writes: existing Access Manager / BigQuery flow
- Firestore is not used for permissions in this phase
