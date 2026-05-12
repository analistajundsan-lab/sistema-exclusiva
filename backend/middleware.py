import logging
import json
from datetime import datetime
from fastapi import Request
from sqlalchemy.orm import Session
from models import AuditLog, get_db

logger = logging.getLogger(__name__)


async def audit_logging_middleware(request: Request, call_next):
    """Log all API requests to audit_logs table."""
    start = datetime.utcnow()
    
    # Extract user_id from token if available
    user_id = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        from auth import get_current_user
        from fastapi.security import HTTPAuthorizationCredentials
        try:
            credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth_header[7:])
            user = await get_current_user(credentials)
            user_id = user.id
        except Exception:
            pass
    
    # Capture request body for POST/PUT
    body = ""
    if request.method in ["POST", "PUT", "PATCH"]:
        try:
            body = await request.body()
        except Exception:
            pass
    
    # Call next middleware
    response = await call_next(request)
    
    # Create audit log entry
    duration_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
    
    # Extract resource and action from path
    path = request.url.path
    method = request.method
    action = f"{method} {path}"
    resource = path.split("/")[1] if len(path.split("/")) > 1 else "system"
    
    try:
        db = next(get_db())
        audit_entry = AuditLog(
            user_id=user_id or 0,
            action=action[:50],
            resource=resource[:50],
            details=f"Status: {response.status_code}, Duration: {duration_ms}ms"[:500]
        )
        db.add(audit_entry)
        db.commit()
        db.close()
    except Exception as e:
        logger.error(f"Failed to log audit entry: {e}")
    
    response.headers["X-Response-Time-Ms"] = str(duration_ms)
    return response
