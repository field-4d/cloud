# Field4D Frontend

React 18, TypeScript, Vite, and Plotly client for authenticated Field4D research-data
selection and visualization. Firebase Auth supplies identity; the FastAPI backend remains
the authorization and data-access boundary.

## Data flow

1. Firebase resolves the user session.
2. `GET /api/permissions` supplies fresh permission-derived selector metadata.
3. `POST /api/experiment-summary` supplies sensors, parameters, labels, locations, and
   experiment metadata.
4. `POST /api/v2/fetch-data-page` returns native-resolution rows in deterministic pages.
5. The browser validates cursor/page invariants, accumulates the complete result, and only
   then publishes it to Plotly and export tools.

Current paged policy:

- default: **100,000 rows per page**;
- maximum requested page size: **100,000 rows**;
- bounded backend row-body ceiling: **24 MiB**;
- route: `/api/v2/fetch-data-page`;
- legacy `/api/fetch-data` remains supported for compatibility.

No aggregation, downsampling, resampling, smoothing, interpolation, or silent filtering is
introduced by the paging client.

## Environment variables

Only `VITE_` variables are exposed to frontend code.

| Variable | Behavior |
|---|---|
| `VITE_USE_LOCAL_BACKEND=true` | In Vite development mode, use `http://localhost:3001`. |
| `VITE_USE_PAGED_FETCH=true` | Enable `/api/v2/fetch-data-page`. Local-backend development also enables paging. |
| `VITE_API_BASE_URL=https://...` | Backend origin for production, preview, or staging builds. |

Typical local frontend against local backend:

```env
VITE_USE_LOCAL_BACKEND=true
VITE_USE_PAGED_FETCH=true
```

Typical local frontend against the configured production backend:

```env
VITE_USE_LOCAL_BACKEND=false
VITE_USE_PAGED_FETCH=true
```

Do not modify `frontend/.env.production` for local validation. Never place tokens,
service-account keys, or private credentials in a `VITE_` variable.

## Commands

Run from the repository root:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run preview
npm --prefix frontend run lint
```

Production build output is `frontend/dist/`.

## Playwright

Tracked configs are under `tests/playwright/config/`; tests remain under `tests/auth/`,
`tests/performance/`, and `tests/ux/`.

```powershell
npx playwright test --config=tests/playwright/config/playwright.initial-load-ux.config.ts
npx playwright test --config=tests/playwright/config/playwright.auth-routing.config.ts
npx playwright test tests/performance/frontend-pipeline-smoke.spec.ts --config=tests/playwright/config/playwright.phase3.config.ts
npx playwright test tests/performance/large-dataset-loading-smoke.spec.ts --config=tests/playwright/config/playwright.phase4.config.ts
npx playwright test --config=tests/playwright/config/playwright.phase4b.config.ts
npx playwright test --config=tests/playwright/config/playwright.fixed100k.config.ts
```

Playwright reports, traces, screenshots, videos, and saved local authentication state are
runtime artifacts and must not be committed. Playwright configuration `.ts` files are
source and must remain tracked.

## Important source paths

| Path | Responsibility |
|---|---|
| `src/App.tsx` | Auth-resolution routing and application shell |
| `src/components/Dashboard.tsx` | Permission-derived selectors and dashboard layout |
| `src/components/DataSelector.tsx` | Selection validation, paged fetch, progress, cancellation, and completed-data publication |
| `src/components/VisualizationPanel.tsx` | Plot selection, interactions, and export |
| `src/utils/fetchDataPages.ts` | 100K default, page/cursor validation, retry, and stream accumulation |
| `src/config.ts` | Backend URL, feature flags, and API endpoint constants |

## Contract and security notes

- The backend API contract is documented in
  [backend_fastapi/README.md](../backend_fastapi/README.md).
- The cursor contract is documented in
  [FIELD4D_PHASE4B_CURSOR_PAGE_CONTRACT_2026-08-10.md](../docs/architecture/FIELD4D_PHASE4B_CURSOR_PAGE_CONTRACT_2026-08-10.md).
- Frontend selector visibility is UX, not authorization. Backend permission enforcement is
  authoritative.
- Permission metadata is fetched fresh on application boot; no persistent permission SWR
  cache is used.
