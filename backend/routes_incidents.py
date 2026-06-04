from datetime import date as date_type, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import get_current_user, require_role
from models import AuditLog, Incident, IncidentStatus, User, UserRole, get_db
from schemas import CountResponse, IncidentCreate, IncidentResponse, IncidentUpdate
from typing import List, Optional

router = APIRouter(prefix="/incidents", tags=["incidents"])
BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")


def format_incident_whatsapp_text(incident: Incident) -> str:
    parts = [
        "OCORRENCIA OPERACIONAL",
        f"Tipo: {incident.incident_type}",
        f"Prefixo: {incident.prefix_code}",
    ]
    if incident.line:
        parts.append(f"Linha: {incident.line}")
    if incident.direction:
        parts.append(f"Sentido: {incident.direction}")
    if incident.victim_status == "com_vitimas":
        parts.append("Vitimas: com vitimas")
    elif incident.victim_status == "sem_vitimas":
        parts.append("Vitimas: sem vitimas")
    if incident.description:
        parts.extend(["", incident.description])
    return "\n".join(parts)


@router.get("/count", response_model=CountResponse)
async def count_incidents(
    prefix_code: Optional[str] = None,
    incident_type: Optional[str] = None,
    line: Optional[str] = None,
    status: Optional[IncidentStatus] = None,
    today: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Incident)
    if prefix_code:
        query = query.filter(Incident.prefix_code.ilike(f"%{prefix_code}%"))
    if incident_type:
        query = query.filter(Incident.incident_type.ilike(f"%{incident_type}%"))
    if line:
        query = query.filter(Incident.line.ilike(f"%{line}%"))
    if status:
        query = query.filter(Incident.status == status)
    if today:
        query = query.filter(
            func.date(Incident.created_at) == datetime.now(BRASILIA_TZ).date()
        )
    return {"total": query.count()}


@router.post("/", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = Incident(**body.model_dump(), created_by=current_user.id)
    db.add(incident)
    db.flush()
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource="incident",
            resource_id=incident.id,
        )
    )
    db.commit()
    db.refresh(incident)
    return incident


@router.get("/", response_model=List[IncidentResponse])
async def list_incidents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    prefix_code: Optional[str] = None,
    incident_type: Optional[str] = None,
    line: Optional[str] = None,
    status: Optional[IncidentStatus] = None,
    today: bool = Query(False),
    incident_date: Optional[date_type] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Incident).order_by(Incident.created_at.desc())
    if prefix_code:
        query = query.filter(Incident.prefix_code.ilike(f"%{prefix_code}%"))
    if incident_type:
        query = query.filter(Incident.incident_type.ilike(f"%{incident_type}%"))
    if line:
        query = query.filter(Incident.line.ilike(f"%{line}%"))
    if status:
        query = query.filter(Incident.status == status)
    if today:
        query = query.filter(
            func.date(Incident.created_at) == datetime.now(BRASILIA_TZ).date()
        )
    if incident_date:
        query = query.filter(func.date(Incident.created_at) == incident_date)
    return query.offset(skip).limit(limit).all()


@router.get("/{incident_id}/whatsapp/text")
async def incident_whatsapp_text(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ocorrencia nao encontrada"
        )
    return {"text": format_incident_whatsapp_text(incident)}


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ocorrência não encontrada"
        )
    return incident


@router.put("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: int,
    body: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ocorrência não encontrada"
        )
    if current_user.role != UserRole.ADMIN and incident.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão"
        )
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(incident, field, value)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource="incident",
            resource_id=incident_id,
        )
    )
    db.commit()
    db.refresh(incident)
    return incident


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPERVISOR, UserRole.ADMIN)),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ocorrência não encontrada"
        )
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource="incident",
            resource_id=incident_id,
        )
    )
    db.delete(incident)
    db.commit()
