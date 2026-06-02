import json
from datetime import date as date_type, datetime
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from auth import apply_user_unit_scope, ensure_unit_access, get_current_user, user_allowed_units
from models import AuditLog, ScheduleLine, User, VehicleChecklist, get_db
from schemas import ChecklistCreate, ChecklistResponse, ChecklistUpdate

router = APIRouter(prefix="/checklist", tags=["checklist"])

JSON_FIELDS = ["licenciamento", "checklist_colocado", "wifi_status", "evidencias"]
BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")


def _today_brasilia() -> date_type:
    return datetime.now(BRASILIA_TZ).date()


def _duplicate_today_query(db: Session, prefixo: str, garagem: Optional[str] = None):
    query = db.query(VehicleChecklist).filter(
        func.upper(VehicleChecklist.prefixo) == prefixo.strip().upper(),
        func.date(VehicleChecklist.created_at) == _today_brasilia(),
    )
    if garagem:
        query = query.filter(VehicleChecklist.garagem == garagem)
    return query


def _apply_situation_filter(query, situacao: Optional[str]):
    if not situacao:
        return query

    s = situacao.upper()
    wifi_problem = or_(
        VehicleChecklist.wifi_status.ilike("%NAO_SEM_REDE%"),
        VehicleChecklist.wifi_status.ilike("%NAO_APARECE_LISTA%"),
        VehicleChecklist.wifi_status.ilike("%NAO_FUNCIONA_FRETADAO%"),
        and_(VehicleChecklist.wifi_outro.isnot(None), VehicleChecklist.wifi_outro != ""),
    )
    doc_missing = or_(
        VehicleChecklist.crlv_status == "NAO_LOCALIZADO",
        VehicleChecklist.emtu_status == "NAO_LOCALIZADO",
        VehicleChecklist.artesp_status == "NAO_LOCALIZADO",
        VehicleChecklist.emdec_status == "NAO_LOCALIZADO",
        VehicleChecklist.bolsa_documentos == "NAO_TEM",
    )
    doc_expired = or_(
        VehicleChecklist.crlv_status == "VENCIDO",
        VehicleChecklist.artesp_status == "VENCIDO",
        VehicleChecklist.emdec_status == "VENCIDO",
    )
    camera_issue = or_(
        VehicleChecklist.camera_frontal == "VISITA_TECNICA",
        VehicleChecklist.camera_lateral_esq == "VISITA_TECNICA",
        VehicleChecklist.camera_lateral_dir == "VISITA_TECNICA",
        VehicleChecklist.camera_fadiga == "VISITA_TECNICA",
        VehicleChecklist.camera_ip_motorista == "VISITA_TECNICA",
        VehicleChecklist.camera_salao == "VISITA_TECNICA",
    )
    filters = {
        "WIFI_PROBLEMA": wifi_problem,
        "DOCUMENTO_FALTANDO": doc_missing,
        "DOCUMENTO_VENCIDO": doc_expired,
        "CAMERA_VISITA_TECNICA": camera_issue,
        "CRLV_FALTANDO": VehicleChecklist.crlv_status == "NAO_LOCALIZADO",
        "CRLV_VENCIDO": VehicleChecklist.crlv_status == "VENCIDO",
        "EMTU_FALTANDO": VehicleChecklist.emtu_status == "NAO_LOCALIZADO",
        "EMTU_DANIFICADO": VehicleChecklist.emtu_status == "DANIFICADO",
        "ARTESP_FALTANDO": VehicleChecklist.artesp_status == "NAO_LOCALIZADO",
        "ARTESP_VENCIDO": VehicleChecklist.artesp_status == "VENCIDO",
        "EMDEC_FALTANDO": VehicleChecklist.emdec_status == "NAO_LOCALIZADO",
        "EMDEC_VENCIDO": VehicleChecklist.emdec_status == "VENCIDO",
        "BOLSA_DOCUMENTOS_TEM": VehicleChecklist.bolsa_documentos == "TEM",
        "BOLSA_DOCUMENTOS_NAO_TEM": VehicleChecklist.bolsa_documentos == "NAO_TEM",
        "CHECKLIST_FISICO_PENDENTE": VehicleChecklist.checklist_colocado.ilike(
            "%SEM_CHECKLIST_COLOCAR_NOVO%"
        ),
    }
    return query.filter(filters[s]) if s in filters else query


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
    if _duplicate_today_query(db, body.prefixo, body.garagem).first():
        raise HTTPException(status_code=422, detail="CHECK-LIST REALIZADO HOJE")
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
        created_at=datetime.now(BRASILIA_TZ).replace(tzinfo=None),
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


@router.get("/garagens", response_model=List[str])
async def list_garagens(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna todas as garagens/unidades disponíveis no sistema."""
    rows_cl = db.query(VehicleChecklist.garagem).distinct().all()
    rows_sl = db.query(ScheduleLine.unit).distinct().all()
    garagens = sorted({r[0] for r in rows_cl + rows_sl if r[0]})
    allowed = user_allowed_units(current_user)
    if allowed is None:
        return garagens
    allowed_set = set(allowed)
    return [g for g in garagens if g in allowed_set]


@router.get("/exists-today")
async def checklist_exists_today(
    prefixo: str = Query(..., min_length=1),
    garagem: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if garagem:
        ensure_unit_access(current_user, garagem)
    query = _duplicate_today_query(db, prefixo, garagem)
    query = apply_user_unit_scope(query, VehicleChecklist.garagem, current_user)
    return {"exists": query.first() is not None}


@router.get("/", response_model=List[ChecklistResponse])
async def list_checklists(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    prefixo: Optional[str] = None,
    garagem: Optional[str] = None,
    tipo: Optional[str] = None,
    situacao: Optional[str] = None,
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
    query = _apply_situation_filter(query, situacao)
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


@router.patch("/{checklist_id}", response_model=ChecklistResponse)
async def update_checklist(
    checklist_id: int,
    body: ChecklistUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.value != "admin":
        raise HTTPException(
            status_code=403, detail="Apenas administradores podem editar checklists"
        )
    c = db.query(VehicleChecklist).filter(VehicleChecklist.id == checklist_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist nao encontrado")
    ensure_unit_access(current_user, c.garagem)

    data = body.model_dump(exclude_unset=True)
    for field in JSON_FIELDS:
        if field in data:
            val = data[field]
            data[field] = (
                json.dumps(val, ensure_ascii=False) if isinstance(val, list) else None
            )

    for key, val in data.items():
        setattr(c, key, val)

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource="checklist",
            resource_id=c.id,
        )
    )
    db.commit()
    db.refresh(c)
    return _to_response(c)


@router.delete("/{checklist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist(
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.value != "admin":
        raise HTTPException(
            status_code=403, detail="Apenas administradores podem excluir checklists"
        )
    c = db.query(VehicleChecklist).filter(VehicleChecklist.id == checklist_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist nao encontrado")
    ensure_unit_access(current_user, c.garagem)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource="checklist",
            resource_id=c.id,
        )
    )
    db.delete(c)
    db.commit()
