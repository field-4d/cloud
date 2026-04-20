## Frontend Integration Notes (FastAPI)

Full API payloads and responses: **[README.md](README.md)**.

### Required `backend_fastapi/.env` variables
- `GCP_PROJECT_ID`
- `GCP_CLIENT_EMAIL`
- `GCP_PRIVATE_KEY`
- `GCP_AUTH_URL` (used by `POST /api/auth`)
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
