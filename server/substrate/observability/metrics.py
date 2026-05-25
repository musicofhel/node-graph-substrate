from __future__ import annotations

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

METRICS_ENABLED = os.getenv("NGS_METRICS_ENABLED", "").lower() == "true"


def setup_metrics(app: FastAPI) -> None:
    if not METRICS_ENABLED:
        return

    import time

    from fastapi import Request, Response
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        Counter,
        Gauge,
        Histogram,
        generate_latest,
    )
    from starlette.middleware.base import BaseHTTPMiddleware

    REQUEST_COUNT = Counter(
        "ngs_http_requests_total",
        "Total HTTP requests",
        ["method", "endpoint", "status"],
    )
    REQUEST_LATENCY = Histogram(
        "ngs_http_request_duration_seconds",
        "HTTP request latency",
        ["method", "endpoint"],
    )
    # Exported for WS manager to inc/dec — wired in a follow-up step
    app.state.ws_connections_gauge = Gauge(
        "ngs_ws_connections_active",
        "Active WebSocket connections",
    )

    class MetricsMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):  # type: ignore[override]
            start = time.perf_counter()
            response = await call_next(request)
            duration = time.perf_counter() - start
            endpoint = request.url.path
            REQUEST_COUNT.labels(
                method=request.method,
                endpoint=endpoint,
                status=response.status_code,
            ).inc()
            REQUEST_LATENCY.labels(
                method=request.method,
                endpoint=endpoint,
            ).observe(duration)
            return response

    app.add_middleware(MetricsMiddleware)

    @app.get("/metrics")
    async def metrics_endpoint() -> Response:
        return Response(
            content=generate_latest(),
            media_type=CONTENT_TYPE_LATEST,
        )
