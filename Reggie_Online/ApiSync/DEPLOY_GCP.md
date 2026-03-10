# Deploy ApiSync to Google Cloud Run (Container)

Deploy the ApiSync backend as a container image. Credentials are provided at runtime via Secret Manager; `.env` is never baked into the image.

## Prerequisites

1. **Google Cloud SDK (gcloud)**  
   Install and authenticate: [Cloud SDK install guide](https://cloud.google.com/sdk/docs/install)

2. **Project and permissions**
   - Set your project: `gcloud config set project YOUR_PROJECT_ID`
   - Ensure you have Cloud Run Admin, Service Account User, and Secret Manager Admin roles

3. **Enable APIs**
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable artifactregistry.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   ```

## 1. Create secret from .env

Store `backend/auth/.env` in Secret Manager:

```bash
gcloud secrets create apisync-env --data-file=backend/auth/.env
```

If the secret already exists, add a new version:

```bash
gcloud secrets versions add apisync-env --data-file=backend/auth/.env
```

## 2. Build image

**Docker must be running** for `docker build` and `docker push`. Docker Desktop (or the Docker daemon) must be open.

From the ApiSync project root:

```bash
docker build -t gcr.io/YOUR_PROJECT_ID/apisync:latest .
```

Or use Artifact Registry:

```bash
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_REPO/apisync:latest .
```

## 3. Push image

Docker must be running. Cloud Run expects the image to already exist in the registry; it does not build or push for you.

```bash
docker push gcr.io/YOUR_PROJECT_ID/apisync:latest
```

Or with Artifact Registry:

```bash
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_REPO/apisync:latest
```

## 4. Deploy to Cloud Run

Mount the secret and set `ENV_FILE_PATH` so the app loads credentials at runtime:

```bash
gcloud run deploy apisync \
  --image gcr.io/YOUR_PROJECT_ID/apisync:latest \
  --region us-central1 \
  --set-secrets=/secrets/auth/.env=apisync-env:latest \
  --set-env-vars="ENV_FILE_PATH=/secrets/auth/.env" \
  --allow-unauthenticated
```

Replace `YOUR_PROJECT_ID` (and `YOUR_REPO` if using Artifact Registry) with your values.

## Future Updates (code changes)

When you change backend code and want to redeploy:

1. **Rebuild** the image (from project root):
   ```bash
   docker build -t gcr.io/iucc-f4d/apisync:latest .
   ```

2. **Push** to the registry:
   ```bash
   docker push gcr.io/iucc-f4d/apisync:latest
   ```

3. **Deploy** (Cloud Run will use the new image):
   ```bash
   gcloud run deploy apisync \
     --image gcr.io/iucc-f4d/apisync:latest \
     --region us-central1 \
     --set-secrets=/secrets/auth/.env=apisync-env:latest \
     --set-env-vars="ENV_FILE_PATH=/secrets/auth/.env" \
     --allow-unauthenticated \
     --project iucc-f4d
   ```

**Alternative – Cloud Build (Docker not required):**  
If Docker is not running or not installed, use Cloud Build. It builds in Google's cloud and pushes the image automatically:

```bash
gcloud builds submit --tag gcr.io/iucc-f4d/apisync:latest .
gcloud run deploy apisync --image gcr.io/iucc-f4d/apisync:latest --region us-central1 \
  --set-secrets=/secrets/auth/.env=apisync-env:latest \
  --set-env-vars="ENV_FILE_PATH=/secrets/auth/.env" \
  --allow-unauthenticated --project iucc-f4d
```

| Method | Docker must be running? | Push required? |
|--------|-------------------------|----------------|
| `docker build` + `docker push` + `deploy` | Yes | Yes |
| `gcloud builds submit` + `deploy` | No | No (Cloud Build pushes for you) |

**When to update the secret:** Run `gcloud secrets versions add apisync-env --data-file=backend/auth/.env` only if you change credentials in `backend/auth/.env`.

## Local Docker (testing)

Run the container with your local `.env` file:

```bash
docker build -t apisync:latest .
docker run --env-file backend/auth/.env -p 8080:8080 apisync:latest
```

## Source deploy (optional)

You can still deploy from source. The secret setup is the same:

```bash
gcloud secrets create apisync-env --data-file=backend/auth/.env
gcloud run deploy apisync --source . --region us-central1 \
  --set-secrets=/secrets/auth/.env=apisync-env:latest \
  --set-env-vars="ENV_FILE_PATH=/secrets/auth/.env" \
  --allow-unauthenticated
```

## Post-deploy

- Service URL: shown in the deploy output (e.g. `https://apisync-XXXXX-uc.a.run.app`)
- Health check: `curl https://YOUR_SERVICE_URL/health`
- WebSocket: `wss://YOUR_SERVICE_URL/ws/ping`

## References

- [Cloud Run deploy container](https://cloud.google.com/run/docs/deploying)
- [Cloud Run environment variables](https://cloud.google.com/run/docs/configuring/environment-variables)
- [Using Secret Manager with Cloud Run](https://cloud.google.com/run/docs/configuring/secrets)
