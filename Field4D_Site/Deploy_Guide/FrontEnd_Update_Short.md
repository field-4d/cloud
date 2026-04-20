# Frontend Quick Update (Small Changes)

Use this for small frontend updates (UI tweak, small fix, minor component change).

- Live URL: `https://field4d.com`
- Live bucket: `gs://field4d-frontend-site`
- Backup bucket: `gs://field4d-frontend-site-backups`
- URL map/CDN: `frontend-https`

## 1) Build frontend

From `frontend/`:

```powershell
npm install
npm run build
```

## 2) Backup current live site

```powershell
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
gcloud storage cp --recursive "gs://field4d-frontend-site/**" "gs://field4d-frontend-site-backups/backup_$TIMESTAMP/"
```

## 3) Upload new build

```powershell
gcloud storage rsync --recursive --delete-unmatched-destination-objects .\dist gs://field4d-frontend-site
```

## 4) Invalidate CDN cache

```powershell
gcloud compute url-maps invalidate-cdn-cache frontend-https --path "/*" --project=iucc-f4d
```

## 5) Quick verify

- Open `https://field4d.com`
- Test in incognito
- Hard refresh (`Ctrl+Shift+R`)
- Confirm login/API calls work

## Rollback (if needed)

```powershell
$TIMESTAMP = "yyyy-MM-dd_HH-mm-ss"
gcloud storage rsync --recursive --delete-unmatched-destination-objects "gs://field4d-frontend-site-backups/backup_$TIMESTAMP/" gs://field4d-frontend-site
gcloud compute url-maps invalidate-cdn-cache frontend-https --path "/*" --project=iucc-f4d
```
