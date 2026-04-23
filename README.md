# Field4D Google Cloud Monorepo

This repository contains Field4D cloud services, data pipelines, frontend/backend applications, Raspberry Pi ingestion code, and legacy Cloud Functions.

## Repository Structure

Current top-level folders:

- `Field4D_Site/` - main web application (frontend + backend)
- `Reggie_Online/` - ApiSync service and related tooling
- `f4d-auth-service/` - auth service for issuing/verifying access
- `f4d-bq-sync/` - BigQuery synchronization service
- `field4d_analytics/` - analytics and statistics APIs/jobs
- `fetch_google/` - BigQuery/data pull scripts and notebooks
- `legacy gcp cloud function/` - archived legacy Cloud Functions (migrated under one folder):
  - `login_and_issue_jwt/`
  - `process_files/`
  - `query_last_timestamp/`
  - `update-labels/`
  - `upload_To_bucket/`
  - `users-devices-permission/`
- `F4D/` - original Field4D processing utilities
- `F4D_python/` - Python ingestion/runtime stack
- `F4D_Pi_V2/` - Raspberry Pi v2 runtime/project
- `f4d-register-device/` - device registration components
- `cloud_upload_alerts/` - alert/upload cloud workflows
- `SPAC automatic Pull/` - SPAC automation utilities

## Notes on Folder Renames / Reorganization

The project was reorganized and some historical roots were moved/renamed, for example:

- `f4d_bq_sync/` -> `f4d-bq-sync/`
- `login_and_issue_jwt/` and other old function folders -> `legacy gcp cloud function/...`

When adding new top-level directories, update `.gitignore` allowlist rules accordingly because this repo uses a default-ignore pattern (`*`) with explicit include paths.

## Security and Credentials

- Never commit secrets, service account keys, or `.env` files.
- The repository ignore rules block common secret files and Python-generated artifacts.
- `fetch_google/read_BQ.json` is explicitly ignored and must stay local-only.
- If a credential was ever committed, rotate/revoke it immediately in Google Cloud.
- GitHub Push Protection is enabled and will block pushes containing detected credentials.

## Getting Started

1. Go into the specific module you want to run.
2. Read that module's local `README.md`.
3. Install dependencies from that module's `requirements.txt` / `package.json`.
4. Configure credentials locally (environment variables or local key files outside git-tracked paths).
5. Run the module-specific start command.

Example:

```bash
cd Field4D_Site/frontend
npm install
npm run dev
```

## Contributing

- Keep changes scoped to one module when possible.
- Avoid committing generated files (`__pycache__`, `*.pyc`, virtual env folders, notebook outputs unless intentional).
- If you add or move top-level folders, update `.gitignore` allowlist entries.

## License

See `LICENSE`.
