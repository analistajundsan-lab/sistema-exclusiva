import json
from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import apply_user_unit_scope, ensure_unit_access, get_current_user
from models import AuditLog, User, VehicleChecklist, get_db
from schemas import ChecklistCreate, ChecklistResponse

router = APIRouter(prefix="/checklist", tags=["checklist"])

JSON_FIELDS = ["licenciamento", "checklist_colocado", "wifi_status", "evidencias"]


@router.get("/garagens", response_model=List[str])
async def list_garagens(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna todas as garagens unicas conhecidas (checklists + unidades de usuarios ativos)."""
    garagens: set[str] = set()

    rows = db.query(VehicleChecklist.garagem).distinct().all()
    for (g,) in rows:
        if g and g.strip():
            garagens.add(g.strip())

    users = db.query(User.unit, User.units).filter(User.is_active.is_(True)).all()
    for u in users:
        if u.unit and u.unit.strip():
            garagens.add(u.unit.strip())
        if u.units:
            for g in u.units.split(","):
                g = g.strip()
                if g:
                    garagens.add(g)

    return sorted(garagens)


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
    ensure_unit_access(current_user, body.garagem)
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
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource="checklist",
            resource_id=checklist.id,
        )
    )
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
    query = apply_user_unit_scope(query, VehicleChecklist.garagem, current_user)

    if prefixo:
        query = query.filter(VehicleChecklist.prefixo.ilike(f"%{prefixo}%"))
    if garagem:
        ensure_unit_access(current_user, garagem)
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
        raise HTTPException(status_code=404, detail="Checklist nao encontrado")
    ensure_unit_access(current_user, c.garagem)
    return _to_response(c)
