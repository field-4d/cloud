from __future__ import annotations

import logging
import time
import uuid
from typing import Any


logger = logging.getLogger("field4d.fetch_metrics")
FETCH_PATHS = {
    "/api/fetch-data": "v1",
    "/api/v2/fetch-data-page": "v2",
}


class FetchMetricsMiddleware:
    """Record bounded, value-free transport metrics for Field4D fetch routes."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or scope.get("path") not in FETCH_PATHS:
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        state = scope.setdefault("state", {})
        metrics = state.setdefault("fetch_metrics", {})
        metrics.update(
            {
                "event": "field4d_fetch_transport",
                "request_id": uuid.uuid4().hex,
                "endpoint": scope["path"],
                "version": FETCH_PATHS[scope["path"]],
                "retry_state": "initial",
                "cancellation_state": "not_cancelled",
                "timeout_state": "not_timed_out",
                "complete": False,
            }
        )
        status_code = 500
        response_bytes = 0
        content_encoding: str | None = None

        async def measured_send(message: dict[str, Any]) -> None:
            nonlocal status_code, response_bytes, content_encoding
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", metrics["request_id"].encode("ascii")))
                metric_headers = {
                    "x-field4d-bq-duration-ms": metrics.get("bigquery_duration_ms"),
                    "x-field4d-bq-server-ms": metrics.get("bigquery_server_ms"),
                    "x-field4d-bq-bytes": metrics.get("bigquery_bytes_processed"),
                    "x-field4d-materialization-ms": metrics.get(
                        "materialization_duration_ms"
                    ),
                    "x-field4d-normalization-ms": metrics.get(
                        "model_normalization_duration_ms"
                    ),
                    "x-field4d-serialization-ms": metrics.get("serialization_duration_ms"),
                    "x-field4d-serialized-bytes": metrics.get("serialized_bytes"),
                    "x-field4d-materialization-method": metrics.get(
                        "materialization_method"
                    ),
                }
                for name, value in metric_headers.items():
                    if value is not None:
                        headers.append((name.encode("ascii"), str(value).encode("ascii")))
                message["headers"] = headers
                for name, value in headers:
                    if name.lower() == b"content-encoding":
                        content_encoding = value.decode("latin-1")
            elif message["type"] == "http.response.body":
                response_bytes += len(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, receive, measured_send)
        except BaseException:
            metrics["terminal_state"] = "exception"
            raise
        finally:
            metrics.update(
                {
                    "status_code": status_code,
                    "response_duration_ms": round((time.perf_counter() - started) * 1000, 3),
                    "wire_response_bytes": response_bytes,
                    "content_encoding": content_encoding,
                }
            )
            logger.info(metrics)
