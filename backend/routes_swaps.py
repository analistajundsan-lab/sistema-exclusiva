from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth import (
    apply_user_unit_scope,
    ensure_unit_access,
    get_current_user,
    require_role,
)
from models import (
    AuditLog,
    ScheduleLine,
    ScheduleLineStatus,
    ScheduleNonOperation,
    Swap,
    User,
    UserRole,
    get_db,
)
from schemas import CountResponse, SwapCreate, SwapResponse, SwapUpdate

router = APIRouter(prefix="/swaps", tags=["swaps"])

BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")


def start_within_window(
    start_time: Optional[str], now_brt: datetime, window_minutes: int
) -> bool:
    """True se a hora de inicio (HH:MM) esta a no maximo window_minutes de agora,
    medindo pela menor distancia no relogio (trata a virada de meia-noite).

    Sem horario (trocas antigas) NAO entram no envio por turno — so as do dia
    apareceriam em todos os turnos, que e justamente o que queremos evitar."""
    if not start_time:
        return False
    try:
        hh, mm = str(start_time).split(":")
        line_min = int(hh) * 60 + int(mm)
    except (ValueError, AttributeError):
        return False
    now_min = now_brt.hour * 60 + now_brt.minute
    diff = (line_min - now_min) % 1440
    if diff > 720:
        diff -= 1440
    return abs(diff) <= window_minutes


def direction_abbrev(direction: str) -> str:
    """Converte 'ENTRADA'/'SAIDA' para 'E'/'S'."""
    if direction and direction.upper().startswith("E"):
        return "E"
    if direction and direction.upper().startswith("S"):
        return "S"
    return direction or ""


def format_lines_covered(direction: str, line_code: str) -> str:
    """Formata como E/2228 ou S/2265."""
    abbr = direction_abbrev(direction)
    return f"{abbr}/{line_code}" if line_code else abbr


def clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


def build_swap_whatsapp_text(
    vehicle_in: Optional[str], driver_in: Optional[str], lines_covered: Optional[str]
) -> str:
    lines = lines_covered or "linha nao informada"
    parts = []
    if vehicle_in:
        parts.append(f"PREFIXO {vehicle_in}")
    if driver_in:
        parts.append(f"MOTORISTA {driver_in}")
    title = " - ".join(parts) if parts else "TROCA OPERACIONAL"
    return f"{title} - ATENDERA AS LINHAS : {lines}"


@router.get("/count", response_model=CountResponse)
async def count_swaps(
    vehicle: Optional[str] = None,
    vehicle_out: Optional[str] = None,
    vehicle_in: Optional[str] = None,
    schedule_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Swap)
    query = apply_user_unit_scope(query, Swap.unit, current_user)
    if vehicle:
        query = query.filter(
            or_(
                Swap.vehicle_out.ilike(f"%{vehicle}%"),
                Swap.vehicle_in.ilike(f"%{vehicle}%"),
            )
        )
    if vehicle_out:
        query = query.filter(Swap.vehicle_out.ilike(f"%{vehicle_out}%"))
    if vehicle_in:
        query = query.filter(Swap.vehicle_in.ilike(f"%{vehicle_in}%"))
    if schedule_date:
        query = query.filter(Swap.schedule_date == schedule_date)
    return {"total": query.count()}


@router.post("/", response_model=SwapResponse, status_code=status.HTTP_201_CREATED)
async def create_swap(
    body: SwapCreate,
    db: Session = Depends(get_db),
    # Troca e operacao de Trafego/Analista/Admin (+ legados); cargos SST nao
    # registram troca. Escopo de garagem via ensure_unit_access na linha.
    current_user: User = Depends(
        require_role(
            UserRole.ADMIN,
            UserRole.GERENTE,
            UserRole.SUPERVISAO,
            UserRole.SUPERVISOR,
            UserRole.ANALISTA,
            UserRole.PLANTONISTA,
            UserRole.OPERATOR,
        )
    ),
):
    vehicle_out = clean_optional(body.vehicle_out)
    vehicle_in = clean_optional(body.vehicle_in)
    driver_out = clean_optional(body.driver_out)
    driver_in = clean_optional(body.driver_in)
    if vehicle_out and vehicle_in and vehicle_out == vehicle_in:
        raise HTTPException(
            status_code=422,
            detail="Os prefixos SAI e ENTRA não podem ser iguais",
        )
    data = body.model_dump()
    data.update(
        {
            "vehicle_out": vehicle_out,
            "vehicle_in": vehicle_in,
            "driver_out": driver_out,
            "driver_in": driver_in,
        }
    )
    schedule_line = None
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
        ensure_unit_access(current_user, schedule_line.unit)
        if schedule_line.status == ScheduleLineStatus.CANCELADA:
            raise HTTPException(
                status_code=422,
                detail="Linha cancelada nao pode ser trocada/confirmada",
            )
        if schedule_line.is_active is False:
            raise HTTPException(
                status_code=422,
                detail="Linha desativada nao pode ser trocada/confirmada",
            )
        today_brt = datetime.now(BRASILIA_TZ).date()
        non_op_today = (
            db.query(ScheduleNonOperation)
            .filter(
                ScheduleNonOperation.schedule_line_id == schedule_line.id,
                ScheduleNonOperation.operation_date == today_brt,
            )
            .first()
        )
        if non_op_today:
            raise HTTPException(
                status_code=422,
                detail="Linha marcada como 'nao opera hoje' nao pode ser trocada",
            )
        data["schedule_date"] = body.schedule_date or schedule_line.schedule_date
        data["unit"] = schedule_line.unit
        data["client_name"] = schedule_line.client_name
        data["vehicle_out"] = data["vehicle_out"] or schedule_line.prefix_code
        data["driver_out"] = data["driver_out"] or schedule_line.driver_name
        data["lines_covered"] = data.get("lines_covered") or format_lines_covered(
            schedule_line.direction, schedule_line.line_code
        )
        # Horario da linha (para o envio ao CCO por turno).
        data["start_time"] = schedule_line.start_time
        data["end_time"] = schedule_line.end_time
    if not data.get("vehicle_out"):
        raise HTTPException(status_code=422, detail="Informe o prefixo de origem")
    if not data.get("vehicle_in") and not data.get("driver_in"):
        raise HTTPException(
            status_code=422,
            detail="Informe o prefixo substituto ou o motorista substituto",
        )
    data["whatsapp_text"] = build_swap_whatsapp_text(
        data.get("vehicle_in"), data.get("driver_in"), data.get("lines_covered")
    )

    # Idempotencia anti duplo-submit: o PWA reenvia o mesmo POST (duplo toque,
    # retry de rede, segundo usuario que nao viu a tela atualizar) — auditoria
    # de producao achou trocas identicas criadas em dobro segundos depois.
    # Troca identica recente => devolve a existente em vez de duplicar.
    dedup_cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        minutes=10
    )
    duplicate = (
        db.query(Swap)
        .filter(
            Swap.created_at >= dedup_cutoff,
            Swap.schedule_line_id == body.schedule_line_id,
            Swap.schedule_date == data.get("schedule_date"),
            Swap.unit == data.get("unit"),
            Swap.vehicle_out == data.get("vehicle_out"),
            Swap.vehicle_in == data.get("vehicle_in"),
            Swap.driver_out == data.get("driver_out"),
            Swap.driver_in == data.get("driver_in"),
        )
        .order_by(Swap.id.desc())
        .first()
    )
    if duplicate:
        return duplicate

    if schedule_line is not None:
        # A TROCA CONFIRMA A LINHA PARA O DIA: o carro previsto teve uma ocorrencia
        # e outro vai rodar, entao a linha esta confirmada (com a nova info de
        # carro/motorista). Carimba a confirmacao de HOJE para a linha entrar nas
        # "Confirmadas" do dashboard. Recarimba mesmo se ja estava confirmada (ex.:
        # confirmada ontem) para contar no dia da troca. UTC naive deterministico.
        schedule_line.status = ScheduleLineStatus.CONFIRMADA
        schedule_line.confirmed_by = current_user.id
        schedule_line.confirmed_at = datetime.now(timezone.utc).replace(tzinfo=None)

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
    vehicle: Optional[str] = None,
    vehicle_out: Optional[str] = None,
    vehicle_in: Optional[str] = None,
    driver_name: Optional[str] = None,
    line: Optional[str] = None,
    unit: Optional[str] = None,
    schedule_date: Optional[date] = None,
    schedule_line_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Swap).order_by(Swap.created_at.desc())
    query = apply_user_unit_scope(query, Swap.unit, current_user)
    if vehicle:
        query = query.filter(
            or_(
                Swap.vehicle_out.ilike(f"%{vehicle}%"),
                Swap.vehicle_in.ilike(f"%{vehicle}%"),
            )
        )
    if vehicle_out:
        query = query.filter(Swap.vehicle_out.ilike(f"%{vehicle_out}%"))
    if vehicle_in:
        query = query.filter(Swap.vehicle_in.ilike(f"%{vehicle_in}%"))
    if driver_name:
        query = query.filter(
            or_(
                Swap.driver_out.ilike(f"%{driver_name}%"),
                Swap.driver_in.ilike(f"%{driver_name}%"),
            )
        )
    if line:
        query = query.filter(Swap.lines_covered.ilike(f"%{line}%"))
    if unit:
        query = query.filter(Swap.unit.ilike(f"%{unit}%"))
    if schedule_date:
        query = query.filter(Swap.schedule_date == schedule_date)
    if schedule_line_id:
        query = query.filter(Swap.schedule_line_id == schedule_line_id)
    return query.offset(skip).limit(limit).all()


@router.get("/whatsapp/text")
async def swaps_whatsapp_text(
    unit: Optional[str] = None,
    schedule_date: Optional[date] = None,
    window_minutes: Optional[int] = Query(None, ge=1, le=720),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Swap).order_by(Swap.created_at.asc())
    query = apply_user_unit_scope(query, Swap.unit, current_user)
    if unit:
        ensure_unit_access(current_user, unit)
        query = query.filter(Swap.unit == unit)
    if schedule_date:
        query = query.filter(Swap.schedule_date == schedule_date)
    swaps = query.all()

    # Envio por TURNO: so as trocas das linhas que comecam por volta de agora
    # (janela centrada de +/- window_minutes). Evita repetir os turnos ja
    # enviados (manha/meio-dia/noite). Sem window_minutes = dia inteiro (legado).
    if window_minutes is not None:
        now_brt = datetime.now(BRASILIA_TZ)
        swaps = [
            s
            for s in swaps
            if start_within_window(s.start_time, now_brt, window_minutes)
        ]

    if not swaps:
        return {
            "total": 0,
            "text": (
                "Nenhuma troca deste horario."
                if window_minutes is not None
                else "Nenhuma troca registrada para os filtros informados."
            ),
        }

    # Agrupa linhas por prefixo e/ou motorista substituto.
    groups: dict[str, list[str]] = {}
    for swap in swaps:
        labels = []
        if swap.vehicle_in:
            labels.append(f"PREFIXO {swap.vehicle_in}")
        if swap.driver_in:
            labels.append(f"MOTORISTA {swap.driver_in}")
        key = " - ".join(labels) if labels else "TROCA OPERACIONAL"
        line = swap.lines_covered or "linha nao informada"
        groups.setdefault(key, []).append(line)

    date_label = (
        schedule_date.strftime("%d/%m/%Y")
        if schedule_date
        else (
            swaps[0].schedule_date.strftime("%d/%m/%Y")
            if swaps[0].schedule_date
            else ""
        )
    )
    header = f"TROCAS NA ESCALA DIA {date_label}"
    body_lines = [
        f"{label} - ATENDERA AS LINHAS : {' - '.join(lines)}"
        for label, lines in groups.items()
    ]
    text = header + "\n\n" + "\n".join(body_lines)

    return {"total": len(swaps), "text": text}


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
    ensure_unit_access(current_user, swap.unit)
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
    ensure_unit_access(current_user, swap.unit)
    if current_user.role != UserRole.ADMIN and swap.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão"
        )
    vehicle_out = clean_optional(body.vehicle_out)
    vehicle_in = clean_optional(body.vehicle_in)
    if vehicle_out and vehicle_in and vehicle_out == vehicle_in:
        raise HTTPException(
            status_code=422, detail="Os prefixos SAI e ENTRA não podem ser iguais"
        )
    update_data = body.model_dump(exclude_unset=True)
    for key in ["vehicle_out", "vehicle_in", "driver_out", "driver_in"]:
        if key in update_data:
            update_data[key] = clean_optional(update_data[key])
    for field, value in update_data.items():
        setattr(swap, field, value)
    if not swap.vehicle_in and not swap.driver_in:
        raise HTTPException(
            status_code=422,
            detail="Informe o prefixo substituto ou o motorista substituto",
        )
    swap.whatsapp_text = build_swap_whatsapp_text(
        swap.vehicle_in, swap.driver_in, swap.lines_covered
    )
    ensure_unit_access(current_user, swap.unit)
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
    ensure_unit_access(current_user, swap.unit)
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
