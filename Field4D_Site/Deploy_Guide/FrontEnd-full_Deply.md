# Field4D Frontend Full Deploy Guide (GCP + GoDaddy)

This guide documents the full working setup and deployment flow for `https://field4d.com`.

- Project: `iucc-f4d`
- Live bucket: `gs://field4d-frontend-site`
- Backup bucket: `gs://field4d-frontend-site-backups`
- URL map: `frontend-https`
- Frontend runtime API: `https://f4d-fastapi-backend-1000435921680.us-central1.run.app`

## 1) Build Frontend

From `frontend/`:

```powershell
npm install
npm run build
```

Output must contain at least:

- `dist/index.html`
- `dist/assets/*`

## 2) GCS Buckets

### 2.1 Live bucket (one-time)

```powershell
gcloud storage buckets create gs://field4d-frontend-site --location=us-central1 --uniform-bucket-level-access --project=iucc-f4d
gcloud storage buckets update gs://field4d-frontend-site --web-main-page-suffix=index.html --web-error-page=404.html
gcloud storage buckets add-iam-policy-binding gs://field4d-frontend-site --member=allUsers --role=roles/storage.objectViewer --project=iucc-f4d
```

### 2.2 Backup bucket (one-time)

```powershell
gcloud storage buckets create gs://field4d-frontend-site-backups --location=us-central1 --project=iucc-f4d
```

## 3) HTTPS Load Balancer + CDN (one-time)

Use GCP External Application Load Balancer (global):

- Backend bucket: `field4d-frontend-site`
- URL map: `frontend-https`
- Cloud CDN enabled
- Managed certificate for `field4d.com`
- Global static IP

Expected current backend-bucket name in LB:

- `frontend-bucket` -> `field4d-frontend-site`

## 4) DNS (GoDaddy)

Set:

- `A` record for `@` -> LB global IP
- `CNAME` for `www` -> `field4d.com`

## 5) Deploy/Update Live Site

### 5.1 Backup current live site

```powershell
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
gcloud storage cp --recursive "gs://field4d-frontend-site/**" "gs://field4d-frontend-site-backups/backup_$TIMESTAMP/"
```

### 5.2 Upload new build

From `frontend/`:

```powershell
gcloud storage rsync --recursive --delete-unmatched-destination-objects .\dist gs://field4d-frontend-site
```

### 5.3 Invalidate CDN

```powershell
gcloud compute url-maps invalidate-cdn-cache frontend-https --path "/*" --project=iucc-f4d
```

## 6) Frontend Env Requirements

### Production

`frontend/.env.production` should contain:

```env
VITE_API_BASE_URL=https://f4d-fastapi-backend-1000435921680.us-central1.run.app
VITE_FIELD4D_ANALYTICS_URL=https://field4d-analytics-1000435921680.us-central1.run.app
```

### Development

Use either local backend or cloud backend intentionally in `frontend/.env.development`.

## 7) Backend/CORS Requirement for Production Frontend

Backend must include `https://field4d.com` in `CORS_ALLOW_ORIGINS`, then redeploy backend with refreshed `apisync-env` secret.

Example:

```env
CORS_ALLOW_ORIGINS=http://localhost:5173,http://localhost:5174,https://field4d.com
```

## 8) Rollback

```powershell
$TIMESTAMP = "yyyy-MM-dd_HH-mm-ss"
gcloud storage rsync --recursive --delete-unmatched-destination-objects "gs://field4d-frontend-site-backups/backup_$TIMESTAMP/" gs://field4d-frontend-site
gcloud compute url-maps invalidate-cdn-cache frontend-https --path "/*" --project=iucc-f4d
```

## 9) Validation Checklist

- `https://field4d.com` loads the expected version
- Login works without CORS errors
- Network calls go to `https://f4d-fastapi-backend-1000435921680.us-central1.run.app`
- Test in incognito and hard refresh (`Ctrl+Shift+R`)

## Notes

- Direct IP access is not reliable with managed cert hostname validation.
- CDN and browser caches can delay changes without invalidation.
- Legacy-path hosting (`/legacy`) was explored and then removed; this guide keeps only the approved live deployment flow.


