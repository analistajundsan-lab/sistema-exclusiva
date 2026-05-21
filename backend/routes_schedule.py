from collections import Counter
from datetime import date, datetime, timezone
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from auth import (
    apply_user_unit_scope,
    ensure_unit_access,
    get_current_user,
    require_role,
)
from models import (
    AuditLog,
    ScheduleImport,
    ScheduleLine,
    ScheduleLineStatus,
    User,
    UserRole,
    get_db,
)
from schedule_parser import parse_schedule_workbook
from schemas import (
    CountResponse,
    ScheduleImportResponse,
    ScheduleImportPreviewClient,
    ScheduleImportPreviewResponse,
    ScheduleImportPreviewUnit,
    ScheduleLineResponse,
    ScheduleLineStatusChange,
    ScheduleLineUpdate,
    ScheduleSummaryItem,
    ScheduleWhatsappResponse,
)

router = APIRouter(prefix="/schedule", tags=["schedule"])

MAX_IMPORT_BYTES = 8 * 1024 * 1024


async def parse_upload_file(file: UploadFile):
    if not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=422, detail="Envie uma planilha .xlsx sem macros"
        )

    content = await file.read()
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=413, detail="Arquivo muito grande. Limite atual: 8 MB"
        )

    try:
        parsed_lines = parse_schedule_workbook(content)
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail="Nao foi possivel ler a planilha enviada"
        ) from exc

    if not parsed_lines:
        raise HTTPException(
            status_code=422, detail="Nenhuma linha de escala encontrada na planilha"
        )

    return content, parsed_lines


def normalized_filename(file: UploadFile) -> str:
    return (file.filename or "escala.xlsx").strip()


def latest_import_ids_for_date(db: Session, schedule_date: date) -> list[int]:
    latest_effective_date = (
        db.query(func.max(ScheduleImport.effective_date))
        .filter(ScheduleImport.effective_date <= schedule_date)
        .scalar()
    )
    if latest_effective_date is None:
        return []

    rows = (
        db.query(ScheduleImport.id)
        .filter(ScheduleImport.effective_date == latest_effective_date)
        .all()
    )
    return [row[0] for row in rows]


def apply_schedule_date_scope(db: Session, query, schedule_date: Optional[date] = None):
    if not schedule_date:
        return query

    active_import_ids = latest_import_ids_for_date(db, schedule_date)
    if active_import_ids:
        return query.filter(ScheduleLine.import_id.in_(active_import_ids))

    # Compatibilidade com escalas antigas gravadas antes do versionamento.
    return query.filter(ScheduleLine.schedule_date == schedule_date)


def build_import_warnings(parsed_lines) -> list[str]:
    warnings: list[str] = []
    missing_line = sum(1 for line in parsed_lines if not line.line_code)
    missing_direction = sum(1 for line in parsed_lines if not line.direction)
    missing_client = sum(1 for line in parsed_lines if not line.client_name)
    overnight = sum(1 for line in parsed_lines if line.end_time < line.start_time)

    if missing_line:
        warnings.append(f"{missing_line} registros sem numero de linha")
    if missing_direction:
        warnings.append(f"{missing_direction} registros sem sentido Entrada/Saida")
    if missing_client:
        warnings.append(f"{missing_client} registros sem cliente")
    if overnight:
        warnings.append(f"{overnight} registros viram o dia")

    return warnings


@router.post("/import/preview", response_model=ScheduleImportPreviewResponse)
async def preview_schedule_import(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    _, parsed_lines = await parse_upload_file(file)
    unit_counts = Counter(line.unit for line in parsed_lines)
    client_counts = Counter(line.client_name or "Sem cliente" for line in parsed_lines)

    return ScheduleImportPreviewResponse(
        total=len(parsed_lines),
        units=[
            ScheduleImportPreviewUnit(unit=unit, total=total)
            for unit, total in sorted(unit_counts.items())
        ],
        clients=[
            ScheduleImportPreviewClient(client_name=client, total=total)
            for client, total in client_counts.most_common(8)
        ],
        warnings=build_import_warnings(parsed_lines),
    )


def apply_filters(
    query,
    schedule_date: Optional[date] = None,
    unit: Optional[str] = None,
    client_name: Optional[str] = None,
    line_code: Optional[str] = None,
    driver_name: Optional[str] = None,
    prefix_code: Optional[str] = None,
    status: Optional[ScheduleLineStatus] = None,
):
    if schedule_date:
        query = query.filter(ScheduleLine.schedule_date == schedule_date)
    if unit:
        query = query.filter(ScheduleLine.unit.ilike(f"%{unit}%"))
    if client_name:
        query = query.filter(ScheduleLine.client_name.ilike(f"%{client_name}%"))
    if line_code:
        query = query.filter(ScheduleLine.line_code.ilike(f"%{line_code}%"))
    if driver_name:
        query = query.filter(ScheduleLine.driver_name.ilike(f"%{driver_name}%"))
    if prefix_code:
        query = query.filter(ScheduleLine.prefix_code.ilike(f"%{prefix_code}%"))
    if status:
        query = query.filter(ScheduleLine.status == status)
    return query


def safe_xlsx_text(value):
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


@router.post(
    "/import",
    response_model=ScheduleImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_schedule(
    schedule_date: date,
    replace: bool = True,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    content, parsed_lines = await parse_upload_file(file)
    filename = normalized_filename(file)

    try:
        if replace:
            schedule_import = (
                db.query(ScheduleImport)
                .filter(
                    ScheduleImport.effective_date == schedule_date,
                    ScheduleImport.filename == filename,
                )
                .first()
            )
            if schedule_import:
                db.query(ScheduleLine).filter(
                    ScheduleLine.import_id == schedule_import.id
                ).delete()
            else:
                schedule_import = ScheduleImport(
                    effective_date=schedule_date,
                    filename=filename,
                    file_size=len(content),
                    rows_imported=0,
                    created_by=current_user.id,
                )
                db.add(schedule_import)
                db.flush()
        else:
            schedule_import = ScheduleImport(
                effective_date=schedule_date,
                filename=filename,
                file_size=len(content),
                rows_imported=0,
                created_by=current_user.id,
            )
            db.add(schedule_import)
            db.flush()

        schedule_import.file_size = len(content)
        schedule_import.rows_imported = len(parsed_lines)
        schedule_import.created_by = current_user.id

        for parsed in parsed_lines:
            db.add(
                ScheduleLine(
                    import_id=schedule_import.id,
                    schedule_date=schedule_date,
                    unit=parsed.unit,
                    prefix_code=parsed.prefix_code,
                    driver_name=parsed.driver_name,
                    line_code=parsed.line_code,
                    direction=parsed.direction,
                    client_name=parsed.client_name,
                    route_name=parsed.route_name,
                    start_time=parsed.start_time,
                    end_time=parsed.end_time,
                    source_sheet=parsed.source_sheet,
                    source_row=parsed.source_row,
                    source_col=parsed.source_col,
                    created_by=current_user.id,
                )
            )

        db.add(
            AuditLog(
                user_id=current_user.id,
                action="IMPORT",
                resource="schedule",
                resource_id=schedule_import.id,
                details=f"{len(parsed_lines)} linhas importadas para {schedule_date}; arquivo={filename}",
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return ScheduleImportResponse(
        imported=len(parsed_lines), replaced=replace, schedule_date=schedule_date
    )


@router.get("/lines/count", response_model=CountResponse)
async def count_schedule_lines(
    schedule_date: Optional[date] = None,
    unit: Optional[str] = None,
    client_name: Optional[str] = None,
    line_code: Optional[str] = None,
    driver_name: Optional[str] = None,
    prefix_code: Optional[str] = None,
    status: Optional[ScheduleLineStatus] = None,
    start_time_gte: Optional[str] = None,
    start_time_lt: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = apply_filters(
        db.query(ScheduleLine),
        None,
        unit,
        client_name,
        line_code,
        driver_name,
        prefix_code,
        status,
    )
    query = apply_schedule_date_scope(db, query, schedule_date)
    query = apply_user_unit_scope(query, ScheduleLine.unit, current_user)
    if start_time_gte:
        query = query.filter(ScheduleLine.start_time >= start_time_gte)
    if start_time_lt:
        query = query.filter(ScheduleLine.start_time < start_time_lt)
    return {"total": query.count()}


@router.get("/lines", response_model=List[ScheduleLineResponse])
async def list_schedule_lines(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    schedule_date: Optional[date] = None,
    unit: Optional[str] = None,
    client_name: Optional[str] = None,
    line_code: Optional[str] = None,
    driver_name: Optional[str] = None,
    prefix_code: Optional[str] = None,
    status: Optional[ScheduleLineStatus] = None,
    start_in_minutes: Optional[int] = Query(None, ge=1, le=1440),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = apply_filters(
        db.query(ScheduleLine),
        None,
        unit,
        client_name,
        line_code,
        driver_name,
        prefix_code,
        status,
    )
    query = apply_schedule_date_scope(db, query, schedule_date)
    query = apply_user_unit_scope(query, ScheduleLine.unit, current_user)
    if start_in_minutes is not None:
        from datetime import timedelta, timezone
        from sqlalchemy import and_, or_

        brt = timezone(timedelta(hours=-3))
        now_brt = datetime.now(brt)
        cutoff_brt = now_brt + timedelta(minutes=start_in_minutes)
        now_str = now_brt.strftime("%H:%M")
        cutoff_str = cutoff_brt.strftime("%H:%M")

        if now_brt.date() == cutoff_brt.date():
            query = query.filter(
                ScheduleLine.schedule_date == now_brt.date(),
                ScheduleLine.start_time >= now_str,
                ScheduleLine.start_time <= cutoff_str,
            )
        else:
            # Janela cruza meia-noite: une linhas de hoje (>= now) e amanhã (<= cutoff)
            query = query.filter(
                or_(
                    and_(
                        ScheduleLine.schedule_date == now_brt.date(),
                        ScheduleLine.start_time >= now_str,
                    ),
                    and_(
                        ScheduleLine.schedule_date == cutoff_brt.date(),
                        ScheduleLine.start_time <= cutoff_str,
                    ),
                )
            )
    return (
        query.order_by(
            ScheduleLine.unit, ScheduleLine.start_time, ScheduleLine.line_code
        )
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.patch("/lines/{line_id}", response_model=ScheduleLineResponse)
async def update_schedule_line(
    line_id: int,
    body: ScheduleLineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPERVISOR, UserRole.ADMIN)),
):
    line = db.query(ScheduleLine).filter(ScheduleLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Linha de escala nao encontrada")
    ensure_unit_access(current_user, line.unit)

    changes = []
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        old = getattr(line, field)
        if old != value:
            changes.append(f"{field}: {old} -> {value}")
            setattr(line, field, value)

    if changes and "status" not in update_data:
        line.status = ScheduleLineStatus.ALTERADA

    if changes:
        db.add(
            AuditLog(
                user_id=current_user.id,
                action="UPDATE",
                resource="schedule_line",
                resource_id=line.id,
                details="; ".join(changes)[:500],
            )
        )
    db.commit()
    db.refresh(line)
    return line


@router.post("/lines/{line_id}/confirm", response_model=ScheduleLineResponse)
async def confirm_schedule_line(
    line_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    line = db.query(ScheduleLine).filter(ScheduleLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Linha de escala nao encontrada")
    ensure_unit_access(current_user, line.unit)
    if line.status == ScheduleLineStatus.CANCELADA:
        raise HTTPException(
            status_code=422, detail="Linha cancelada nao pode ser confirmada"
        )

    line.status = ScheduleLineStatus.CONFIRMADA
    line.confirmed_by = current_user.id
    line.confirmed_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CONFIRM",
            resource="schedule_line",
            resource_id=line.id,
            details=f"Linha {line.line_code} confirmada; prefixo={line.prefix_code}; unidade={line.unit}",
        )
    )
    db.commit()
    db.refresh(line)
    return line


@router.post("/lines/{line_id}/undo-confirm", response_model=ScheduleLineResponse)
async def undo_confirm_schedule_line(
    line_id: int,
    body: ScheduleLineStatusChange | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPERVISOR, UserRole.ADMIN)),
):
    line = db.query(ScheduleLine).filter(ScheduleLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Linha de escala nao encontrada")
    ensure_unit_access(current_user, line.unit)
    if line.status != ScheduleLineStatus.CONFIRMADA:
        raise HTTPException(
            status_code=422, detail="Apenas linha confirmada pode ser reaberta"
        )

    reason = body.reason if body else None
    line.status = ScheduleLineStatus.PENDENTE
    line.confirmed_by = None
    line.confirmed_at = None
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="UNDO_CONFIRM",
            resource="schedule_line",
            resource_id=line.id,
            details=f"Linha {line.line_code} reaberta; motivo={reason or 'nao informado'}",
        )
    )
    db.commit()
    db.refresh(line)
    return line


@router.post("/lines/{line_id}/cancel", response_model=ScheduleLineResponse)
async def cancel_schedule_line(
    line_id: int,
    body: ScheduleLineStatusChange | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPERVISOR, UserRole.ADMIN)),
):
    line = db.query(ScheduleLine).filter(ScheduleLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Linha de escala nao encontrada")
    ensure_unit_access(current_user, line.unit)

    reason = body.reason if body else None
    line.status = ScheduleLineStatus.CANCELADA
    if reason:
        line.notes = (
            reason if not line.notes else f"{line.notes} | Cancelamento: {reason}"
        )
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CANCEL",
            resource="schedule_line",
            resource_id=line.id,
            details=f"Linha {line.line_code} cancelada; motivo={reason or 'nao informado'}",
        )
    )
    db.commit()
    db.refresh(line)
    return line


@router.get("/summary", response_model=List[ScheduleSummaryItem])
async def schedule_summary(
    schedule_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ScheduleLine)
    query = apply_schedule_date_scope(db, query, schedule_date)
    query = apply_user_unit_scope(query, ScheduleLine.unit, current_user)

    rows = (
        query.with_entities(
            ScheduleLine.unit,
            func.count(ScheduleLine.id),
            func.sum(case((ScheduleLine.direction == "ENTRADA", 1), else_=0)),
            func.sum(case((ScheduleLine.direction == "SAIDA", 1), else_=0)),
            func.sum(
                case((ScheduleLine.status == ScheduleLineStatus.PENDENTE, 1), else_=0)
            ),
            func.sum(
                case((ScheduleLine.status == ScheduleLineStatus.CONFIRMADA, 1), else_=0)
            ),
            func.sum(
                case((ScheduleLine.status == ScheduleLineStatus.ALTERADA, 1), else_=0)
            ),
            func.sum(
                case((ScheduleLine.status == ScheduleLineStatus.CANCELADA, 1), else_=0)
            ),
        )
        .group_by(ScheduleLine.unit)
        .order_by(ScheduleLine.unit)
        .all()
    )

    return [
        ScheduleSummaryItem(
            unit=row[0],
            total=row[1] or 0,
            entrada=row[2] or 0,
            saida=row[3] or 0,
            pending=row[4] or 0,
            confirmed=row[5] or 0,
            changed=row[6] or 0,
            cancelled=row[7] or 0,
        )
        for row in rows
    ]


@router.get("/whatsapp", response_model=ScheduleWhatsappResponse)
async def schedule_whatsapp_text(
    schedule_date: date,
    unit: str,
    only_changes: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = apply_schedule_date_scope(db, db.query(ScheduleLine), schedule_date).filter(
        ScheduleLine.unit == unit,
    )
    ensure_unit_access(current_user, unit)
    if only_changes:
        query = query.filter(
            ScheduleLine.status.in_(
                [ScheduleLineStatus.ALTERADA, ScheduleLineStatus.CANCELADA]
            )
        )

    lines = query.order_by(ScheduleLine.start_time, ScheduleLine.line_code).all()
    header = [
        "ALTERACOES REALIZADAS NA ESCALA",
        f"Entram em vigor a partir do dia: {schedule_date.strftime('%d/%m/%Y')}",
        "",
        f"Unidade: {unit}",
        "",
    ]

    body = [
        f"- {line.start_time} as {line.end_time} | Linha {line.line_code} | {line.direction} | "
        f"{line.client_name} | Prefixo {line.prefix_code} | Motorista: {line.driver_name}"
        for line in lines
    ]
    if not body:
        body = ["- Nenhuma linha encontrada para os filtros informados."]

    return ScheduleWhatsappResponse(
        schedule_date=schedule_date,
        unit=unit,
        total=len(lines),
        text="\n".join(header + body),
    )


@router.delete("/lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule_line(
    line_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.GERENTE, UserRole.SUPERVISAO)
    ),
):
    line = db.query(ScheduleLine).filter(ScheduleLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Linha de escala nao encontrada")
    ensure_unit_access(current_user, line.unit)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource="schedule_line",
            resource_id=line.id,
            details=f"Linha {line.line_code} excluida; prefixo={line.prefix_code}; unidade={line.unit}",
        )
    )
    db.delete(line)
    db.commit()


@router.get("/download")
async def download_schedule(
    schedule_date: date,
    unit: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.GERENTE, UserRole.SUPERVISAO)
    ),
):
    """Gera planilha XLSX no formato linear (aba ATUALIZAR) com os dados atuais."""
    query = apply_schedule_date_scope(db, db.query(ScheduleLine), schedule_date)
    query = apply_user_unit_scope(query, ScheduleLine.unit, current_user)
    if unit:
        ensure_unit_access(current_user, unit)
        query = query.filter(ScheduleLine.unit == unit)
    lines = query.order_by(
        ScheduleLine.unit, ScheduleLine.start_time, ScheduleLine.line_code
    ).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "ATUALIZAR"
    ws.append(
        [
            "PREFIXO",
            "MOTORISTA",
            "LINHA",
            "SENTIDO",
            "CLIENTE",
            "ROTA",
            "INICIO",
            "FIM",
            "UNIDADE",
        ]
    )

    for line in lines:
        ws.append(
            [
                safe_xlsx_text(line.prefix_code),
                safe_xlsx_text(line.driver_name),
                safe_xlsx_text(line.line_code),
                safe_xlsx_text(line.direction),
                safe_xlsx_text(line.client_name),
                safe_xlsx_text(line.route_name),
                line.start_time,
                line.end_time,
                safe_xlsx_text(line.unit),
            ]
        )

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    date_str = schedule_date.strftime("%d-%m-%Y")
    filename = f"ESCALA GERAL {date_str} ATUALIZADA.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
