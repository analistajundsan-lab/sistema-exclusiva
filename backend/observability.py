import logging
import json
from datetime import datetime
try:
    from pythonjsonlogger import json as jsonlogger  # python-json-logger >= 3.x
except ImportError:
    from pythonjsonlogger import jsonlogger  # python-json-logger 2.x
from prometheus_client import Counter, Histogram, Gauge
import time

# JSON Structured Logging
def setup_json_logger(name: str):
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    
    handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter()  # type: ignore
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    return logger

# Prometheus Metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency',
    ['method', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0]
)

db_query_duration_seconds = Histogram(
    'db_query_duration_seconds',
    'Database query latency',
    ['query_type'],
    buckets=[0.001, 0.01, 0.05, 0.1, 0.5, 1.0]
)

active_database_connections = Gauge(
    'active_database_connections',
    'Active database connections'
)

redis_operations_total = Counter(
    'redis_operations_total',
    'Total Redis operations',
    ['operation', 'status']
)

auth_attempts_total = Counter(
    'auth_attempts_total',
    'Total authentication attempts',
    ['status']
)

rate_limit_hits_total = Counter(
    'rate_limit_hits_total',
    'Total rate limit hits',
    ['endpoint']
)

active_users_total = Gauge(
    'active_users_total',
    'Active users currently logged in'
)

incidents_created_total = Counter(
    'incidents_created_total',
    'Total incidents created'
)

swaps_created_total = Counter(
    'swaps_created_total',
    'Total swaps created'
)
