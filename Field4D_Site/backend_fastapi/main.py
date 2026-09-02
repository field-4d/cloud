"""Field4D FastAPI application entrypoint.

Current API groups:
- auth: login proxy + role/permission enrichment
- permissions: read user permissions
- permission-management: role-aware management endpoints
  (devices/experiments lookup, users search, duplicate checks,
  new-user creation, existing-user assignment, batch assignment)
- experiment-summary / fetch-data: data-viewer API
- analytics-health: analytics service proxy health endpoint
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from config.settings import get_settings
from middleware.fetch_metrics import FetchMetricsMiddleware

from routers.analytics_health import router as analytics_health_router
from routers.auth import router as auth_router
from routers.experiment_summary import router as experiment_summary_router
from routers.fetch_data import router as fetch_data_router
from routers.fetch_data_v2 import router as fetch_data_v2_router
from routers.permission_management import router as permission_management_router
from routers.permissions import router as permissions_router



app = FastAPI(title="Field4D FastAPI Backend")

settings = get_settings()

allowed_origins: list[str]
if settings.cors_allow_origins:
    if settings.cors_allow_origins.strip() == "*":
        allowed_origins = ["*"]
    else:
        allowed_origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
else:
    allowed_origins = ["http://localhost:5173","http://localhost:5174"]
allow_origin_regex = r"^https?://(localhost|127\.0\.0\.1):\d+$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Request-ID",
        "X-Field4D-BQ-Duration-Ms",
        "X-Field4D-BQ-Server-Ms",
        "X-Field4D-BQ-Bytes",
        "X-Field4D-Materialization-Ms",
        "X-Field4D-Normalization-Ms",
        "X-Field4D-Serialization-Ms",
        "X-Field4D-Serialized-Bytes",
        "X-Field4D-Materialization-Method",
        "Content-Encoding",
        "Content-Length",
    ],
)
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=3)
app.add_middleware(FetchMetricsMiddleware)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

app.include_router(analytics_health_router, prefix="/api", tags=["analytics-health"])
app.include_router(auth_router, prefix="/api", tags=["auth"])
app.include_router(experiment_summary_router, prefix="/api", tags=["experiment-summary"])
app.include_router(fetch_data_router, prefix="/api", tags=["fetch-data"])
app.include_router(fetch_data_v2_router, prefix="/api", tags=["fetch-data-v2"])
app.include_router(permissions_router, prefix="/api", tags=["permissions"])
app.include_router(permission_management_router, prefix="/api", tags=["permission-management"])
