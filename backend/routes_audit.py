from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from models import AuditLog, User, get_db
from schemas import AuditLogResponse, CountResponse

router = APIRouter(prefix="/audit", tags=["audit"])


def apply_filters(
    query,
    resource: Optional[str],
    resource_id: Optional[int],
    action: Optional[str],
    include_deleted: bool,
):
    if not include_deleted:
        query = query.filter(AuditLog.deleted_at.is_(None))
    if resource:
        query = query.filter(AuditLog.resource == resource)
    if resource_id:
        query = query.filter(AuditLog.resource_id == resource_id)
    if action:
        query = query.filter(AuditLog.action == action)
    return query


@router.get("/logs/count", response_model=CountResponse)
async def count_audit_logs(
    resource: Optional[str] = None,
    resource_id: Optional[int] = None,
    action: Optional[str] = None,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if include_deleted and not current_user.can_delete_history:
        raise HTTPException(
            status_code=403, detail="Sem permissao para ver historico apagado"
        )
    query = apply_filters(
        db.query(AuditLog), resource, resource_id, action, include_deleted
    )
    return {"total": query.count()}


@router.get("/logs", response_model=List[AuditLogResponse])
async def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    resource: Optional[str] = None,
    resource_id: Optional[int] = None,
    action: Optional[str] = None,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if include_deleted and not current_user.can_delete_history:
        raise HTTPException(
            status_code=403, detail="Sem permissao para ver historico apagado"
        )
    query = apply_filters(
        db.query(AuditLog), resource, resource_id, action, include_deleted
    )
    return query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()


@router.delete("/logs/{log_id}")
async def delete_audit_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.can_delete_history:
        raise HTTPException(
            status_code=403, detail="Apenas usuario autorizado pode apagar historico"
        )
    log = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Historico nao encontrado")
    log.deleted_at = datetime.now(timezone.utc)
    log.deleted_by = current_user.id
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="SOFT_DELETE",
            resource="audit_log",
            resource_id=log.id,
        )
    )
    db.commit()
    return {"message": "Historico apagado logicamente por 30 dias"}


@router.post("/logs/{log_id}/restore")
async def restore_audit_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.can_delete_history:
        raise HTTPException(
            status_code=403, detail="Apenas usuario autorizado pode recuperar historico"
        )
    log = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Historico nao encontrado")
    if not log.deleted_at:
        return {"message": "Historico ja esta ativo"}
    deleted_at = log.deleted_at
    if deleted_at.tzinfo is None:
        deleted_at = deleted_at.replace(tzinfo=timezone.utc)
    if deleted_at < datetime.now(timezone.utc) - timedelta(days=30):
        raise HTTPException(
            status_code=422, detail="Prazo de recuperacao de 30 dias expirado"
        )
    log.deleted_at = None
    log.deleted_by = None
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="RESTORE",
            resource="audit_log",
            resource_id=log.id,
        )
    )
    db.commit()
    return {"message": "Historico recuperado"}
