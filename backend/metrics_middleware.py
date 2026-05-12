import logging
import json
import time
from datetime import datetime
from fastapi import Request
from observability import (
    http_requests_total, http_request_duration_seconds,
    db_query_duration_seconds, auth_attempts_total,
    rate_limit_hits_total, setup_json_logger
)

logger = setup_json_logger(__name__)


async def metrics_middleware(request: Request, call_next):
    """Middleware to collect Prometheus metrics."""
    start = time.time()
    method = request.method
    path = request.url.path
    
    response = await call_next(request)
    
    duration = time.time() - start
    status = response.status_code
    
    # Record metrics
    http_requests_total.labels(method=method, endpoint=path, status=status).inc()
    http_request_duration_seconds.labels(method=method, endpoint=path).observe(duration)
    
    # Structured log
    logger.info({
        "timestamp": datetime.utcnow().isoformat(),
        "method": method,
        "path": path,
        "status_code": status,
        "duration_ms": round(duration * 1000),
        "user_agent": request.headers.get("user-agent"),
        "client_ip": request.client.host if request.client else "unknown"
    })
    
    response.headers["X-Response-Time"] = f"{duration:.3f}s"
    return response


async def auth_metrics(success: bool):
    """Record authentication attempts."""
    status = "success" if success else "failed"
    auth_attempts_total.labels(status=status).inc()


async def rate_limit_metric(endpoint: str):
    """Record rate limit hits."""
    rate_limit_hits_total.labels(endpoint=endpoint).inc()


class DBMetricsContext:
    """Context manager for database query metrics."""
    def __init__(self, query_type: str):
        self.query_type = query_type
        self.start = None
    
    def __enter__(self):
        self.start = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start
        db_query_duration_seconds.labels(query_type=self.query_type).observe(duration)
        
        if exc_type:
            logger.error({
                "query_type": self.query_type,
                "duration_ms": round(duration * 1000),
                "error": str(exc_val)
            })
