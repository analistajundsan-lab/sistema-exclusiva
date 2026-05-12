import redis
import time
from typing import Optional
from config import settings

redis_client: Optional[redis.Redis] = None


def init_redis():
    """Initialize Redis connection."""
    global redis_client
    try:
        redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=0,
            decode_responses=True,
            socket_connect_timeout=5
        )
        redis_client.ping()
        print("[OK] Redis connected successfully")
    except Exception as e:
        print(f"[WARN] Redis connection failed: {e}")
        redis_client = None


def get_redis_client() -> Optional[redis.Redis]:
    """Get Redis client instance."""
    return redis_client


async def rate_limit(identifier: str, max_requests: int = 100, window_seconds: int = 60) -> bool:
    """
    Check rate limit for identifier (IP, user_id, etc).
    Returns True if allowed, False if rate limited.
    """
    if not redis_client:
        return True  # Allow if Redis unavailable
    
    key = f"ratelimit:{identifier}"
    try:
        current = redis_client.incr(key)
        if current == 1:
            redis_client.expire(key, window_seconds)
        return current <= max_requests
    except Exception as e:
        print(f"Rate limit check failed: {e}")
        return True  # Fail open


async def get_remaining_requests(identifier: str, max_requests: int = 100) -> int:
    """Get remaining requests for identifier."""
    if not redis_client:
        return max_requests
    
    key = f"ratelimit:{identifier}"
    try:
        current = redis_client.get(key)
        if current is None:
            return max_requests
        return max(0, max_requests - int(current))
    except Exception:
        return max_requests
