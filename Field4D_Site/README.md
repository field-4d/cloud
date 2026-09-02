# Field4D Global Web App

Field4D is a research data platform for authenticated access to native-resolution
plant, sensor, and environmental time series. The React frontend talks to a FastAPI
backend; the browser never queries BigQuery directly.

## Architecture

- **Identity:** Firebase Auth identifies the user.
- **Authorization:** FastAPI enforces access from BigQuery permission records. The
  frontend is not an authorization boundary.
- **Data:** BigQuery stores long-format measurements and metadata.
- **Frontend:** React 18, TypeScript, Vite, and Plotly.
- **Backend:** FastAPI, BigQuery query API, and BigQuery Storage Read API.

The application preserves exact native-resolution rows, ordering, duplicate
multiplicity, timestamps, values/nulls, labels, and experiment identity. Fetching does
not silently aggregate, downsample, resample, smooth, interpolate, or filter rows.

## Current data transport

- Current paged route: `POST /api/v2/fetch-data-page`
- Default page size: **100,000 rows**
- Maximum requested page size: **100,000 rows**
- Bounded uncompressed row-body ceiling: **24 MiB**
- Continuation: signed, selection-bound cursor over one fixed snapshot and deterministic
  total order
- Legacy compatibility: `POST /api/fetch-data` remains available, including for the
  F4D Agent

The 24 MiB ceiling is finite and was selected to allow the validated 100K production
page without reverting to an unlimited response body.

## Repository layout

| Path | Purpose |
|---|---|
| `frontend/` | React/Vite application and frontend development guide |
| `backend_fastapi/` | FastAPI service, API contract, and backend development guide |
| `tests/auth/` | Authentication-routing Playwright tests |
| `tests/performance/` | Paging, rendering, and performance regressions |
| `tests/ux/` | Initial-load UX tests |
| `tests/playwright/config/` | Tracked Playwright configuration source |
| `docs/architecture/` | Current architecture and API-contract documents |
| `docs/benchmarks/` | Historical benchmark evidence and rollout reports |
| `tasks/` | Controlled task specifications |

## Local development

Backend:

```powershell
python -m pip install -r backend_fastapi/requirements.txt
python -m uvicorn main:app --app-dir backend_fastapi --host localhost --port 3001
```

Frontend:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev -- --host localhost --port 5173
```

Common local frontend settings:

```env
VITE_USE_LOCAL_BACKEND=true
VITE_USE_PAGED_FETCH=true
```

For a production-style build, use the intended `VITE_API_BASE_URL`; do not change or
commit environment files merely to run a test.

## Validation

Examples using the tracked config location:

```powershell
npx playwright test --config=tests/playwright/config/playwright.auth-routing.config.ts
npx playwright test --config=tests/playwright/config/playwright.phase4b.config.ts
npx playwright test --config=tests/playwright/config/playwright.fixed100k.config.ts
Push-Location backend_fastapi
python -m pytest tests/test_fetch_data_v2.py
Pop-Location
npm --prefix frontend run build
```

## Secrets and credentials

- Never commit service-account JSON, private keys, tokens, cookies, saved browser auth
  state, or populated `.env` files.
- Local Google clients use Application Default Credentials (ADC). If a credential file
  is required locally, keep it outside Git and point `GOOGLE_APPLICATION_CREDENTIALS`
  to it in the local process environment.
- Production Cloud Run uses its attached runtime service identity/ADC. It must not depend
  on a repository `serviceAccountKey.json` file.
- Runtime secrets belong in the existing managed secret/config mechanism, not source.

## Production model

The frontend is built as static Vite assets and served through Cloud Storage/CDN. The
backend runs as a revisioned Cloud Run service. Releases require gated tests, explicit
authorization, a rollback target, and post-release smoke validation. Repository changes
alone do not deploy either service.

## Documentation

- [Frontend development and testing](frontend/README.md)
- [Backend API and local development](backend_fastapi/README.md)
- [Backend integration checklist](backend_fastapi/INTEGRATION.md)
- [Current v2 cursor/page contract](docs/architecture/FIELD4D_PHASE4B_CURSOR_PAGE_CONTRACT_2026-08-10.md)
