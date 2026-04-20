import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config.settings import get_settings


router = APIRouter()


class AnalyticsHealthResponse(BaseModel):
    success: bool
    data: dict[str, Any] | None = None
    responseTime: int


@router.get("/analytics-health", response_model=AnalyticsHealthResponse)
def get_analytics_health() -> AnalyticsHealthResponse:
    settings = get_settings()
    base_url = settings.analytics_url or settings.gcp_analytics_url
    if not base_url:
        raise HTTPException(status_code=500, detail="Analytics service URL is not configured")

    analytics_url = f"{base_url.rstrip('/')}/health"
    start_time = time.perf_counter()

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(
                analytics_url,
                headers={"accept": "application/json", "Content-Type": "application/json"},
            )
    except httpx.RequestError:
        response_time_ms = int((time.perf_counter() - start_time) * 1000)
        raise HTTPException(
            status_code=503,
            detail={
                "success": False,
                "data": None,
                "responseTime": response_time_ms,
            },
        )

    response_time_ms = int((time.perf_counter() - start_time) * 1000)

    if not response.is_success:
        raise HTTPException(
            status_code=response.status_code,
            detail={
                "success": False,
                "data": None,
                "responseTime": response_time_ms,
            },
        )

    try:
        data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Invalid analytics service response")

    return AnalyticsHealthResponse(success=True, data=data, responseTime=response_time_ms)
