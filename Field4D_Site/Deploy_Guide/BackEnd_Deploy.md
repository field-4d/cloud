# Field4D FastAPI Backend Deploy Guide

This guide reflects the working production flow validated in this project for deploying `backend_fastapi` to Cloud Run.

- Service: `f4d-fastapi-backend`
- Region: `us-central1`
- Project: `iucc-f4d`
- Image: `gcr.io/iucc-f4d/f4d-fastapi-backend:latest`
- Runtime service account: `f4d-fastapi-sa@iucc-f4d.iam.gserviceaccount.com`
- Secret-mounted env file: `apisync-env` at `/secrets/backend/.env`

## Prerequisites

- `backend_fastapi/Dockerfile` exists.
- `backend_fastapi/.dockerignore` excludes `.env`.
- `backend_fastapi/config/settings.py` supports `ENV_FILE_PATH` (already implemented in this repo).
- GCloud CLI authenticated and project selected.

## One-Time Setup

### 1) Authenticate and set project

```powershell
gcloud auth login
gcloud config set project iucc-f4d
```

### 2) Create runtime service account (if missing)

```powershell
gcloud iam service-accounts create f4d-fastapi-sa --display-name="F4D FastAPI Cloud Run SA"
```

### 3) Grant required IAM roles

```powershell
gcloud projects add-iam-policy-binding iucc-f4d `
  --member="serviceAccount:f4d-fastapi-sa@iucc-f4d.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding iucc-f4d `
  --member="serviceAccount:f4d-fastapi-sa@iucc-f4d.iam.gserviceaccount.com" `
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding iucc-f4d `
  --member="serviceAccount:f4d-fastapi-sa@iucc-f4d.iam.gserviceaccount.com" `
  --role="roles/bigquery.dataViewer"
```

## Deploy / Redeploy Backend

### 1) Go to backend directory

```powershell
cd "C:\Users\nir\Documents\xps drive\PhD\8. Field 4D\21. Field4D Site- FastAPI (Long)\backend_fastapi"
```

### 2) Upload latest `.env` to Secret Manager

```powershell
gcloud secrets versions add apisync-env --data-file=".env" --project iucc-f4d
```

### 3) Build and push image

```powershell
docker build -t gcr.io/iucc-f4d/f4d-fastapi-backend:latest .
docker push gcr.io/iucc-f4d/f4d-fastapi-backend:latest
```

### 4) Deploy to Cloud Run

```powershell
gcloud run deploy f4d-fastapi-backend `
  --image gcr.io/iucc-f4d/f4d-fastapi-backend:latest `
  --region us-central1 `
  --allow-unauthenticated `
  --project iucc-f4d `
  --service-account=f4d-fastapi-sa@iucc-f4d.iam.gserviceaccount.com `
  --set-secrets=/secrets/backend/.env=apisync-env:latest `
  --set-env-vars="ENV_FILE_PATH=/secrets/backend/.env"
```

Service URL:

`https://f4d-fastapi-backend-1000435921680.us-central1.run.app`

## Validation Checklist

### 1) Health

```powershell
curl.exe "https://f4d-fastapi-backend-1000435921680.us-central1.run.app/health"
```

Expected:

```json
{"status":"ok"}
```

### 2) CORS preflight from production frontend origin

```powershell
curl.exe -i -X OPTIONS "https://f4d-fastapi-backend-1000435921680.us-central1.run.app/api/auth" ^
  -H "Origin: https://field4d.com" ^
  -H "Access-Control-Request-Method: POST"
```

Expected header:

`access-control-allow-origin: https://field4d.com`

### 3) Auth endpoint

```powershell
$body = @{
  email    = "nir.averbuch@mail.huji.ac.il"
  password = "Aa123456"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://f4d-fastapi-backend-1000435921680.us-central1.run.app/api/auth" `
  -ContentType "application/json" `
  -Body $body
```

## Required `.env` Notes

- Keep secrets in `backend_fastapi/.env` locally; do not commit.
- Ensure this includes:
  - `GCP_PROJECT_ID`
  - `GCP_CLIENT_EMAIL`
  - `GCP_PRIVATE_KEY`
  - `GCP_AUTH_URL`
  - `GCP_ANALYTICS_URL`
  - `CORS_ALLOW_ORIGINS` (must include `https://field4d.com` for production frontend)

Example CORS line:

```env
CORS_ALLOW_ORIGINS=http://localhost:5173,http://localhost:5174,https://field4d.com
```

## Troubleshooting

- `Permission denied on secret`:
  - Grant `roles/secretmanager.secretAccessor` to runtime service account.

- `bigquery.jobs.create permission` / endpoint 500 on permissions:
  - Grant `roles/bigquery.jobUser` and `roles/bigquery.dataViewer`.

- CORS blocked from `field4d.com`:
  - Add `https://field4d.com` to `CORS_ALLOW_ORIGINS`, upload new secret version, redeploy.

- URL contains hidden `\r` / invalid URL errors:
  - Re-upload secret values with clean newline handling.