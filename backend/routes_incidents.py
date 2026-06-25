import re
from datetime import date as date_type, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from auth import (
    get_current_user,
    apply_user_unit_scope,
    ensure_unit_access,
)
from models import AuditLog, Incident, IncidentStatus, User, UserRole, get_db
from schemas import CountResponse, IncidentCreate, IncidentResponse, IncidentUpdate
from typing import List, Optional

router = APIRouter(prefix="/incidents", tags=["incidents"])
BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")


def brt_day_utc_window(day: date_type) -> tuple[datetime, datetime]:
    """Janela [inicio, fim) de um dia no fuso de Brasilia, expressa em UTC naive.

    `Incident.created_at` e gravado por `func.now()` numa coluna sem fuso (UTC no
    servidor). Comparar `func.date(created_at)` com a data BRT faz o "dia" virar
    as 21:00 BRT (00:00 UTC) — ocorrencias da noite somem do "hoje". Filtrando por
    esta janela, o dashboard diario zera exatamente as 00:00 BRT.
    """
    start_brt = datetime(day.year, day.month, day.day, tzinfo=BRASILIA_TZ)
    end_brt = start_brt + timedelta(days=1)
    start_utc = start_brt.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_brt.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def today_brt() -> date_type:
    return datetime.now(BRASILIA_TZ).date()


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
    if incident.replacement_prefix:
        parts.append(f"Substituto: {incident.replacement_prefix}")
    if incident.horario:
        parts.append(f"Horario: {incident.horario}")
    if incident.local:
        parts.append(f"Local: {incident.local}")
    if incident.passageiros is not None:
        parts.append(f"Passageiros a bordo: {incident.passageiros}")
    if incident.motorista:
        parts.append(f"Motorista: {incident.motorista}")
    if incident.victim_status == "com_vitimas":
        parts.append("Vitimas: com vitimas")
    elif incident.victim_status == "sem_vitimas":
        parts.append("Vitimas: sem vitimas")
    if incident.description:
        parts.extend(["", incident.description])
    return "\n".join(parts)


def can_manage_all_incidents(user: User) -> bool:
    return getattr(user, "has_full_access", False) or user.role == UserRole.ADMIN


def can_edit_incident(user: User, incident: Incident) -> bool:
    if can_manage_all_incidents(user):
        return True
    if incident.created_by != user.id or incident.created_at is None:
        return False
    created_at = incident.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - created_at <= timedelta(hours=2)


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
    query = apply_user_unit_scope(db.query(Incident), Incident.unit, current_user)
    if prefix_code:
        query = query.filter(Incident.prefix_code.ilike(f"%{prefix_code}%"))
    if incident_type:
        query = query.filter(Incident.incident_type.ilike(f"%{incident_type}%"))
    if line:
        query = query.filter(Incident.line.ilike(f"%{line}%"))
    if status:
        query = query.filter(Incident.status == status)
    if today:
        start_utc, end_utc = brt_day_utc_window(today_brt())
        query = query.filter(
            Incident.created_at >= start_utc, Incident.created_at < end_utc
        )
    return {"total": query.count()}


@router.post("/", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.model_dump()
    if not data.get("unit") and current_user.unit:
        data["unit"] = current_user.unit
    ensure_unit_access(current_user, data.get("unit"))
    incident = Incident(**data, created_by=current_user.id)
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


@router.get("/cep/{cep}")
async def lookup_cep(
    cep: str,
    current_user: User = Depends(get_current_user),
):
    """Consulta endereço por CEP (proxy ViaCEP). Usado para autopreencher o
    campo Local no registro de ocorrência. O usuário pode editar o resultado."""
    digits = re.sub(r"\D", "", cep)
    if len(digits) != 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CEP deve ter 8 dígitos",
        )
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(f"https://viacep.com.br/ws/{digits}/json/")
        info = resp.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar o CEP. Preencha o local manualmente.",
        )
    if not isinstance(info, dict) or info.get("erro"):
        raise HTTPException(status_code=404, detail="CEP não encontrado")
    return {
        "cep": info.get("cep"),
        "logradouro": info.get("logradouro"),
        "bairro": info.get("bairro"),
        "cidade": info.get("localidade"),
        "uf": info.get("uf"),
    }


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
    query = apply_user_unit_scope(
        db.query(Incident).order_by(Incident.created_at.desc()),
        Incident.unit,
        current_user,
    )
    if prefix_code:
        query = query.filter(Incident.prefix_code.ilike(f"%{prefix_code}%"))
    if incident_type:
        query = query.filter(Incident.incident_type.ilike(f"%{incident_type}%"))
    if line:
        query = query.filter(Incident.line.ilike(f"%{line}%"))
    if status:
        query = query.filter(Incident.status == status)
    if today:
        start_utc, end_utc = brt_day_utc_window(today_brt())
        query = query.filter(
            Incident.created_at >= start_utc, Incident.created_at < end_utc
        )
    if incident_date:
        start_utc, end_utc = brt_day_utc_window(incident_date)
        query = query.filter(
            Incident.created_at >= start_utc, Incident.created_at < end_utc
        )
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
    ensure_unit_access(current_user, incident.unit)
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
    ensure_unit_access(current_user, incident.unit)
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
    ensure_unit_access(current_user, incident.unit)
    if not can_edit_incident(current_user, incident):
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
    current_user: User = Depends(get_current_user),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ocorrência não encontrada"
        )
    ensure_unit_access(current_user, incident.unit)
    if not can_manage_all_incidents(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissao"
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
