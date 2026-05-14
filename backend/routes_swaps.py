from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from models import ScheduleLine, ScheduleLineStatus, Swap, AuditLog, get_db
from schemas import SwapCreate, SwapResponse, SwapUpdate, CountResponse
from auth import get_current_user, require_role
from models import User, UserRole
from typing import List, Optional

router = APIRouter(prefix="/swaps", tags=["swaps"])


def build_swap_whatsapp_text(
    vehicle_out: str, vehicle_in: str, lines_covered: Optional[str]
) -> str:
    lines = lines_covered or "Linha nao informada"
    return f"Troca operacional confirmada\n\nCarro substituido: {vehicle_out}\nCarro substituto: {vehicle_in}\n\nLinha(s) atendida(s): {lines}"


@router.get("/count", response_model=CountResponse)
async def count_swaps(
    vehicle_out: Optional[str] = None,
    vehicle_in: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Swap)
    if vehicle_out:
        query = query.filter(Swap.vehicle_out.ilike(f"%{vehicle_out}%"))
    if vehicle_in:
        query = query.filter(Swap.vehicle_in.ilike(f"%{vehicle_in}%"))
    return {"total": query.count()}


@router.post("/", response_model=SwapResponse, status_code=status.HTTP_201_CREATED)
async def create_swap(
    body: SwapCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.vehicle_out == body.vehicle_in:
        raise HTTPException(
            status_code=422,
            detail="Os prefixos SAI e ENTRA não podem ser iguais",
        )
    data = body.model_dump()
    if body.schedule_line_id:
        schedule_line = (
            db.query(ScheduleLine)
            .filter(ScheduleLine.id == body.schedule_line_id)
            .first()
        )
        if not schedule_line:
            raise HTTPException(
                status_code=404, detail="Linha de escala nao encontrada"
            )
        if schedule_line.status != ScheduleLineStatus.CONFIRMADA:
            raise HTTPException(
                status_code=422,
                detail="A troca so pode ser criada para linha confirmada",
            )
        data["schedule_date"] = schedule_line.schedule_date
        data["unit"] = schedule_line.unit
        data["client_name"] = schedule_line.client_name
        data["vehicle_out"] = data["vehicle_out"] or schedule_line.prefix_code
        data["lines_covered"] = (
            data.get("lines_covered")
            or f"{schedule_line.direction} - {schedule_line.line_code}"
        )
    data["whatsapp_text"] = build_swap_whatsapp_text(
        data["vehicle_out"], data["vehicle_in"], data.get("lines_covered")
    )
    swap = Swap(**data, created_by=current_user.id)
    db.add(swap)
    db.flush()
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource="swap",
            resource_id=swap.id,
        )
    )
    db.commit()
    db.refresh(swap)
    return swap


@router.get("/", response_model=List[SwapResponse])
async def list_swaps(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    vehicle_out: Optional[str] = None,
    vehicle_in: Optional[str] = None,
    unit: Optional[str] = None,
    schedule_line_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Swap).order_by(Swap.created_at.desc())
    if vehicle_out:
        query = query.filter(Swap.vehicle_out.ilike(f"%{vehicle_out}%"))
    if vehicle_in:
        query = query.filter(Swap.vehicle_in.ilike(f"%{vehicle_in}%"))
    if unit:
        query = query.filter(Swap.unit.ilike(f"%{unit}%"))
    if schedule_line_id:
        query = query.filter(Swap.schedule_line_id == schedule_line_id)
    return query.offset(skip).limit(limit).all()


@router.get("/whatsapp/text")
async def swaps_whatsapp_text(
    unit: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Swap).order_by(Swap.created_at.desc())
    if unit:
        query = query.filter(Swap.unit == unit)
    swaps = query.all()
    text = "\n\n".join(
        swap.whatsapp_text
        or build_swap_whatsapp_text(
            swap.vehicle_out, swap.vehicle_in, swap.lines_covered
        )
        for swap in swaps
    )
    return {
        "total": len(swaps),
        "text": text or "Nenhuma troca registrada para os filtros informados.",
    }


@router.get("/{swap_id}", response_model=SwapResponse)
async def get_swap(
    swap_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    swap = db.query(Swap).filter(Swap.id == swap_id).first()
    if not swap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Troca não encontrada"
        )
    return swap


@router.put("/{swap_id}", response_model=SwapResponse)
async def update_swap(
    swap_id: int,
    body: SwapUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    swap = db.query(Swap).filter(Swap.id == swap_id).first()
    if not swap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Troca não encontrada"
        )
    if current_user.role != UserRole.ADMIN and swap.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão"
        )
    if body.vehicle_out and body.vehicle_in and body.vehicle_out == body.vehicle_in:
        raise HTTPException(
            status_code=422, detail="Os prefixos SAI e ENTRA não podem ser iguais"
        )
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(swap, field, value)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource="swap",
            resource_id=swap_id,
        )
    )
    db.commit()
    db.refresh(swap)
    return swap


@router.delete("/{swap_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_swap(
    swap_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPERVISOR, UserRole.ADMIN)),
):
    swap = db.query(Swap).filter(Swap.id == swap_id).first()
    if not swap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Troca não encontrada"
        )
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource="swap",
            resource_id=swap_id,
        )
    )
    db.delete(swap)
    db.commit()
