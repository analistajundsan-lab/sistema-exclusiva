import json
from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import get_current_user
from models import AuditLog, User, UserRole, VehicleChecklist, get_db
from schemas import ChecklistCreate, ChecklistResponse

router = APIRouter(prefix="/checklist", tags=["checklist"])

JSON_FIELDS = ["licenciamento", "checklist_colocado", "wifi_status", "evidencias"]


def _to_response(c: VehicleChecklist) -> ChecklistResponse:
    data: dict = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    for field in JSON_FIELDS:
        val = data.get(field)
        if isinstance(val, str):
            try:
                data[field] = json.loads(val)
            except Exception:
                data[field] = []
        elif val is None:
            data[field] = []
    return ChecklistResponse(**data)


@router.post("/", response_model=ChecklistResponse, status_code=status.HTTP_201_CREATED)
async def create_checklist(
    body: ChecklistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.model_dump()
    for field in JSON_FIELDS:
        val = data.get(field)
        if isinstance(val, list):
            data[field] = json.dumps(val, ensure_ascii=False)
        else:
            data[field] = None

    checklist = VehicleChecklist(
        **data,
        auditor_id=current_user.id,
        auditor_name=current_user.display_name or current_user.name,
    )
    db.add(checklist)
    db.flush()
    db.add(AuditLog(
        user_id=current_user.id,
        action="CREATE",
        resource="checklist",
        resource_id=checklist.id,
    ))
    db.commit()
    db.refresh(checklist)
    return _to_response(checklist)


@router.get("/", response_model=List[ChecklistResponse])
async def list_checklists(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    prefixo: Optional[str] = None,
    garagem: Optional[str] = None,
    tipo: Optional[str] = None,
    data_inicio: Optional[date_type] = None,
    data_fim: Optional[date_type] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(VehicleChecklist).order_by(VehicleChecklist.created_at.desc())

    if current_user.role == UserRole.ANALISTA:
        query = query.filter(VehicleChecklist.garagem == current_user.unit)

    if prefixo:
        query = query.filter(VehicleChecklist.prefixo.ilike(f"%{prefixo}%"))
    if garagem:
        query = query.filter(VehicleChecklist.garagem == garagem)
    if tipo:
        query = query.filter(VehicleChecklist.tipo == tipo)
    if data_inicio:
        query = query.filter(func.date(VehicleChecklist.created_at) >= data_inicio)
    if data_fim:
        query = query.filter(func.date(VehicleChecklist.created_at) <= data_fim)

    return [_to_response(c) for c in query.offset(skip).limit(limit).all()]


@router.get("/{checklist_id}", response_model=ChecklistResponse)
async def get_checklist(
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(VehicleChecklist).filter(VehicleChecklist.id == checklist_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist não encontrado")
    if current_user.role == UserRole.ANALISTA and c.garagem != current_user.unit:
        raise HTTPException(status_code=403, detail="Sem permissão")
    return _to_response(c)
