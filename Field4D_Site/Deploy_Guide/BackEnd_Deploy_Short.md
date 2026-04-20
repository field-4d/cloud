# Backend Quick Update (Small Changes)

Use this for small backend changes (bug fix, small function update, or adding one endpoint).

- Service: `f4d-fastapi-backend`
- Project: `iucc-f4d`
- Region: `us-central1`
- Image: `gcr.io/iucc-f4d/f4d-fastapi-backend:latest`

## 1) Go to backend folder

```powershell
cd "C:\Users\nir\Documents\xps drive\PhD\8. Field 4D\21. Field4D Site- FastAPI (Long)\backend_fastapi"
```

## 2) If `.env` changed, upload new secret version

```powershell
gcloud secrets versions add apisync-env --data-file=".env" --project iucc-f4d
```

## 3) Build and push image

```powershell
docker build -t gcr.io/iucc-f4d/f4d-fastapi-backend:latest .
docker push gcr.io/iucc-f4d/f4d-fastapi-backend:latest
```

## 4) Redeploy Cloud Run

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

## 5) Quick verify

```powershell
curl.exe "https://f4d-fastapi-backend-1000435921680.us-central1.run.app/health"
```

Optional endpoint check:

```powershell
gcloud run services logs read f4d-fastapi-backend --region us-central1 --project iucc-f4d --limit 50
```
