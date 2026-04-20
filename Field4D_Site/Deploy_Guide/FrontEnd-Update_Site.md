# Updating Field4D Frontend on GCS

This is the working update flow for the live frontend at `https://field4d.com`.

- Live bucket: `gs://field4d-frontend-site`
- Backup bucket: `gs://field4d-frontend-site-backups`
- URL map / CDN: `frontend-https`
- Production API: `https://f4d-fastapi-backend-1000435921680.us-central1.run.app`

## Before You Start

Make sure `frontend/.env.production` points to the live FastAPI backend:

```env
VITE_API_BASE_URL=https://f4d-fastapi-backend-1000435921680.us-central1.run.app
VITE_FIELD4D_ANALYTICS_URL=https://field4d-analytics-1000435921680.us-central1.run.app
```

Also make sure the backend allows the production origin:

```env
CORS_ALLOW_ORIGINS=http://localhost:5173,http://localhost:5174,https://field4d.com
```

## 1) Build Frontend

From `frontend/`:

```powershell
npm install
npm run build
```

What it does: installs exact project dependencies and compiles optimized static assets into `dist/`.

## 2) Backup Current Live Site

```powershell
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
gcloud storage cp --recursive "gs://field4d-frontend-site/**" "gs://field4d-frontend-site-backups/backup_$TIMESTAMP/"
gcloud storage ls "gs://field4d-frontend-site-backups/backup_$TIMESTAMP/"
```

What it does: snapshots current production files to a timestamped backup prefix for rollback.

## 3) Upload New Build to Live Bucket

From `frontend/`:

```powershell
gcloud storage rsync --recursive --delete-unmatched-destination-objects .\dist gs://field4d-frontend-site
```

What it does: syncs `dist/` to the live bucket and deletes removed local files from remote.

Why `rsync`:

- updates changed files
- removes stale old files
- is safer than copying `dist/*` on top of the bucket

## 4) Invalidate CDN Cache

```powershell
gcloud compute url-maps invalidate-cdn-cache frontend-https --path "/*" --project=iucc-f4d
```

What it does: purges cached edge objects so clients fetch the newly uploaded files.

## 5) Verify Deployment

Open:

- `https://field4d.com`

Recommended checks:

- open in incognito
- hard refresh with `Ctrl+Shift+R`
- verify login works
- verify API calls go to `https://f4d-fastapi-backend-1000435921680.us-central1.run.app`

What it does: confirms traffic serves the new frontend build and API routing remains correct.

## 6) Rollback If Needed

Use the timestamp from the backup step:

```powershell
$TIMESTAMP = "yyyy-MM-dd_HH-mm-ss"
gcloud storage rsync --recursive --delete-unmatched-destination-objects "gs://field4d-frontend-site-backups/backup_$TIMESTAMP/" gs://field4d-frontend-site
gcloud compute url-maps invalidate-cdn-cache frontend-https --path "/*" --project=iucc-f4d
```

What it does: restores a known-good backup to production and refreshes CDN content.

## Notes

- GCS upload is immediate, but users may still see cached content until CDN invalidation completes.
- Backups are stored under `gs://field4d-frontend-site-backups/backup_<timestamp>/`.
- The `/legacy` experiment was abandoned; this guide documents only the live-site update flow that worked.
