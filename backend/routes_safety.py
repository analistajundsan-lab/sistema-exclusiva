import csv
import io
import json
from datetime import date as date_type, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import apply_user_unit_scope, ensure_unit_access, get_current_user
from email_service import send_ficha_tecnica, send_sst_approval_notification
from models import (
    DriverChecklistAnswer,
    DriverChecklistSubmission,
    MaintenanceTicket,
    MaintenanceTicketStatus,
    SafetyChecklistItem,
    SafetyChecklistTemplate,
    SafetySeverity,
    SafetySubmissionStatus,
    SafetyVehicle,
    UnitAlertSetting,
    User,
    UserRole,
    get_db,
)
from rate_limit import rate_limit
from schemas import (
    PublicSafetyChecklistItem,
    PublicSafetyChecklistResponse,
    PublicSafetySubmissionCreate,
    PublicSafetySubmissionResponse,
    SafetyDashboardResponse,
    SafetySubmissionListItem,
    SafetyTicketListItem,
    SafetyTicketUpdate,
    SafetyVehicleResponse,
    SSTApprovalRequest,
)

router = APIRouter(tags=["safety"])
BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")
# Cargos que acessam o módulo de segurança/manutenção (Check-list operacional +
# visão consultiva SST). Analista é o dono operacional da tela Check-list;
# TST/Engenheiro usam a visão consultiva. Gerência/Supervisão foram
# descontinuados. Operador/Tráfego (plantonista) NÃO têm acesso.
SAFETY_ROLES = {
    "admin",
    "analista",
    "tecnico_seguranca",
    "engenheiro_seguranca",
}
# Aprovação de ticket para SST é ação de gestão — restrita ao Admin.
APPROVAL_ROLES = {"admin"}


def _today_brasilia() -> date_type:
    return datetime.now(BRASILIA_TZ).date()


def _require_safety_user(user: User) -> None:
    if getattr(user, "has_full_access", False):
        return
    if user.role.value not in SAFETY_ROLES:
        raise HTTPException(
            status_code=403, detail="Acesso restrito a seguranca do trabalho"
        )


def _active_template(db: Session) -> SafetyChecklistTemplate:
    template = (
        db.query(SafetyChecklistTemplate)
        .filter(
            SafetyChecklistTemplate.form_type == "daily_vehicle",
            SafetyChecklistTemplate.active.is_(True),
        )
        .order_by(SafetyChecklistTemplate.version.desc())
        .first()
    )
    if not template:
        raise HTTPException(
            status_code=404, detail="Template de check-list nao configurado"
        )
    return template


def _ticket_response(ticket: MaintenanceTicket, prefix: str) -> SafetyTicketListItem:
    return SafetyTicketListItem(
        id=ticket.id,
        unit=ticket.unit,
        prefix=prefix,
        status=ticket.status.value,
        blocking_items=json.loads(ticket.blocking_items or "[]"),
        source_submission_id=ticket.source_submission_id,
        created_at=ticket.created_at,
        manager_notes=ticket.manager_notes,
        email_sent=bool(ticket.email_sent),
        sst_approved=bool(ticket.sst_approved),
        sst_approved_notes=ticket.sst_approved_notes,
        sst_approved_at=ticket.sst_approved_at,
    )


def _vehicle_response(vehicle: SafetyVehicle) -> SafetyVehicleResponse:
    return SafetyVehicleResponse.model_validate(vehicle)


def _item_response(item: SafetyChecklistItem) -> PublicSafetyChecklistItem:
    return PublicSafetyChecklistItem(
        id=item.id,
        section=item.section,
        position=item.position,
        item_text=item.item_text,
        severity=item.severity.value,
        answer_type=item.answer_type.value,
    )


def _submission_status(
    items_by_id: dict[int, SafetyChecklistItem], answers
) -> SafetySubmissionStatus:
    has_attention = False
    for answer in answers:
        if answer.answer != "not_ok":
            continue
        item = items_by_id.get(answer.item_id)
        if not item:
            raise HTTPException(
                status_code=422, detail=f"Item invalido: {answer.item_id}"
            )
        if item.severity == SafetySeverity.BLOCKING:
            return SafetySubmissionStatus.BLOCKING
        has_attention = True
    return (
        SafetySubmissionStatus.ATTENTION if has_attention else SafetySubmissionStatus.OK
    )


@router.get(
    "/public/checklists/{vehicle_token}", response_model=PublicSafetyChecklistResponse
)
async def public_checklist(vehicle_token: str, db: Session = Depends(get_db)):
    vehicle = (
        db.query(SafetyVehicle)
        .filter(
            SafetyVehicle.public_token == vehicle_token, SafetyVehicle.active.is_(True)
        )
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Veiculo nao encontrado ou inativo")
    template = _active_template(db)
    items = (
        db.query(SafetyChecklistItem)
        .filter(
            SafetyChecklistItem.template_id == template.id,
            SafetyChecklistItem.active.is_(True),
        )
        .order_by(SafetyChecklistItem.position.asc())
        .all()
    )
    return PublicSafetyChecklistResponse(
        vehicle=_vehicle_response(vehicle),
        template_id=template.id,
        template_title=template.title,
        template_version=template.version,
        items=[_item_response(item) for item in items],
    )


@router.post(
    "/public/checklists/{vehicle_token}/submissions",
    response_model=PublicSafetySubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_public_submission(
    vehicle_token: str,
    body: PublicSafetySubmissionCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    allowed = await rate_limit(
        f"safety:{vehicle_token}:{client_ip}", max_requests=10, window_seconds=3600
    )
    if not allowed:
        raise HTTPException(
            status_code=429, detail="Muitas tentativas. Tente novamente mais tarde."
        )
    if not body.declaration_accepted:
        raise HTTPException(status_code=422, detail="Declaracao obrigatoria")

    vehicle = (
        db.query(SafetyVehicle)
        .filter(
            SafetyVehicle.public_token == vehicle_token, SafetyVehicle.active.is_(True)
        )
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Veiculo nao encontrado ou inativo")
    template = _active_template(db)
    items = (
        db.query(SafetyChecklistItem)
        .filter(
            SafetyChecklistItem.template_id == template.id,
            SafetyChecklistItem.active.is_(True),
        )
        .all()
    )
    items_by_id = {item.id: item for item in items}
    overall_status = _submission_status(items_by_id, body.answers)

    submission = DriverChecklistSubmission(
        vehicle_id=vehicle.id,
        template_id=template.id,
        driver_name=body.driver_name.strip(),
        driver_registration=body.driver_registration.strip(),
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent", "")[:500],
        declaration_accepted=True,
        overall_status=overall_status,
        submitted_at=datetime.now(BRASILIA_TZ).replace(tzinfo=None),
    )
    db.add(submission)
    db.flush()

    blocking_items: list[str] = []
    for answer in body.answers:
        item = items_by_id.get(answer.item_id)
        if not item:
            raise HTTPException(
                status_code=422, detail=f"Item invalido: {answer.item_id}"
            )
        db.add(
            DriverChecklistAnswer(
                submission_id=submission.id,
                item_id=item.id,
                answer=answer.answer,
                observation=answer.observation,
            )
        )
        if answer.answer == "not_ok" and item.severity == SafetySeverity.BLOCKING:
            blocking_items.append(item.item_text)

    ticket_id = None
    if overall_status == SafetySubmissionStatus.BLOCKING:
        ticket = MaintenanceTicket(
            unit=vehicle.unit,
            vehicle_id=vehicle.id,
            source_submission_id=submission.id,
            status=MaintenanceTicketStatus.OPEN,
            blocking_items=json.dumps(blocking_items, ensure_ascii=False),
            email_sent=False,
        )
        db.add(ticket)
        db.flush()
        ticket_id = ticket.id

        # Busca o email da gerência da unidade para enviar a ficha técnica
        alert_setting = (
            db.query(UnitAlertSetting)
            .filter(UnitAlertSetting.unit == vehicle.unit)
            .first()
        )
        if alert_setting and alert_setting.manager_email:
            sent = send_ficha_tecnica(
                manager_email=alert_setting.manager_email,
                ticket_id=ticket.id,
                unit=vehicle.unit,
                prefix=vehicle.prefix,
                plate=vehicle.plate,
                driver_name=submission.driver_name,
                driver_registration=submission.driver_registration,
                submitted_at=submission.submitted_at,
                blocking_items=blocking_items,
            )
            ticket.email_sent = sent
            ticket.email_sent_at = (
                datetime.now(BRASILIA_TZ).replace(tzinfo=None) if sent else None
            )

    db.commit()
    message = {
        SafetySubmissionStatus.OK: "Check-list registrado. Veiculo liberado.",
        SafetySubmissionStatus.ATTENTION: "Check-list registrado com atencao. Informe o Trafego.",
        SafetySubmissionStatus.BLOCKING: "Check-list registrado com bloqueio. Acione o responsavel da unidade.",
    }[overall_status]
    return PublicSafetySubmissionResponse(
        id=submission.id,
        overall_status=overall_status.value,
        maintenance_ticket_id=ticket_id,
        message=message,
    )


@router.get("/safety/vehicles", response_model=list[SafetyVehicleResponse])
async def list_safety_vehicles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_safety_user(current_user)
    query = db.query(SafetyVehicle).order_by(SafetyVehicle.unit, SafetyVehicle.prefix)
    query = apply_user_unit_scope(query, SafetyVehicle.unit, current_user)
    return [_vehicle_response(vehicle) for vehicle in query.all()]


@router.get("/safety/dashboard", response_model=SafetyDashboardResponse)
async def safety_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_safety_user(current_user)
    today = _today_brasilia()
    submissions = db.query(DriverChecklistSubmission).join(
        SafetyVehicle, SafetyVehicle.id == DriverChecklistSubmission.vehicle_id
    )
    tickets = db.query(MaintenanceTicket)
    vehicles = db.query(SafetyVehicle).filter(SafetyVehicle.active.is_(True))
    submissions = apply_user_unit_scope(submissions, SafetyVehicle.unit, current_user)
    tickets = apply_user_unit_scope(tickets, MaintenanceTicket.unit, current_user)
    vehicles = apply_user_unit_scope(vehicles, SafetyVehicle.unit, current_user)

    today_submissions = submissions.filter(
        func.date(DriverChecklistSubmission.submitted_at) == today
    )
    submitted_vehicle_ids = {
        row[0]
        for row in today_submissions.with_entities(
            DriverChecklistSubmission.vehicle_id
        ).all()
    }
    vehicle_ids = {row[0] for row in vehicles.with_entities(SafetyVehicle.id).all()}
    latest_blocking = (
        submissions.filter(
            DriverChecklistSubmission.overall_status == SafetySubmissionStatus.BLOCKING
        )
        .order_by(DriverChecklistSubmission.submitted_at.desc())
        .first()
    )
    days_without_blocking = 0
    if latest_blocking and latest_blocking.submitted_at:
        days_without_blocking = max(
            0, (today - latest_blocking.submitted_at.date()).days
        )

    return SafetyDashboardResponse(
        days_without_blocking=days_without_blocking,
        active_blocking_tickets=tickets.filter(
            MaintenanceTicket.status.in_(
                [
                    MaintenanceTicketStatus.OPEN,
                    MaintenanceTicketStatus.VALIDATED,
                    MaintenanceTicketStatus.IN_PROGRESS,
                ]
            )
        ).count(),
        resolved_tickets=tickets.filter(
            MaintenanceTicket.status == MaintenanceTicketStatus.RESOLVED
        ).count(),
        submissions_today=today_submissions.count(),
        vehicles_without_checklist_today=len(vehicle_ids - submitted_vehicle_ids),
    )


@router.get("/safety/submissions", response_model=list[SafetySubmissionListItem])
async def list_safety_submissions(
    status_filter: Optional[str] = Query(None, alias="status"),
    unit: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_safety_user(current_user)
    query = (
        db.query(DriverChecklistSubmission, SafetyVehicle)
        .join(SafetyVehicle, SafetyVehicle.id == DriverChecklistSubmission.vehicle_id)
        .order_by(DriverChecklistSubmission.submitted_at.desc())
    )
    query = apply_user_unit_scope(query, SafetyVehicle.unit, current_user)
    if unit:
        ensure_unit_access(current_user, unit)
        query = query.filter(SafetyVehicle.unit == unit)
    if status_filter:
        query = query.filter(DriverChecklistSubmission.overall_status == status_filter)
    rows = query.limit(500).all()
    return [
        SafetySubmissionListItem(
            id=submission.id,
            prefix=vehicle.prefix,
            unit=vehicle.unit,
            driver_name=submission.driver_name,
            driver_registration=submission.driver_registration,
            overall_status=submission.overall_status.value,
            submitted_at=submission.submitted_at,
        )
        for submission, vehicle in rows
    ]


@router.get("/safety/maintenance", response_model=list[SafetyTicketListItem])
async def list_safety_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_safety_user(current_user)
    query = (
        db.query(MaintenanceTicket, SafetyVehicle)
        .join(SafetyVehicle, SafetyVehicle.id == MaintenanceTicket.vehicle_id)
        .order_by(MaintenanceTicket.created_at.desc())
    )
    query = apply_user_unit_scope(query, MaintenanceTicket.unit, current_user)
    return [
        _ticket_response(ticket, vehicle.prefix)
        for ticket, vehicle in query.limit(500).all()
    ]


@router.patch("/safety/maintenance/{ticket_id}", response_model=SafetyTicketListItem)
async def update_safety_ticket(
    ticket_id: int,
    body: SafetyTicketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_safety_user(current_user)
    row = (
        db.query(MaintenanceTicket, SafetyVehicle)
        .join(SafetyVehicle, SafetyVehicle.id == MaintenanceTicket.vehicle_id)
        .filter(MaintenanceTicket.id == ticket_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Ticket nao encontrado")
    ticket, vehicle = row
    ensure_unit_access(current_user, ticket.unit)
    ticket.status = MaintenanceTicketStatus(body.status)
    ticket.manager_notes = body.manager_notes
    ticket.manager_validated_by = current_user.id
    ticket.manager_validated_at = datetime.now(BRASILIA_TZ).replace(tzinfo=None)
    db.commit()
    db.refresh(ticket)
    return _ticket_response(ticket, vehicle.prefix)


@router.post(
    "/safety/maintenance/{ticket_id}/approve-sst", response_model=SafetyTicketListItem
)
async def approve_ticket_for_sst(
    ticket_id: int,
    body: SSTApprovalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.value not in APPROVAL_ROLES and not getattr(
        current_user, "has_full_access", False
    ):
        raise HTTPException(
            status_code=403, detail="Apenas gerentes podem aprovar para SST"
        )

    row = (
        db.query(MaintenanceTicket, SafetyVehicle)
        .join(SafetyVehicle, SafetyVehicle.id == MaintenanceTicket.vehicle_id)
        .filter(MaintenanceTicket.id == ticket_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Ticket nao encontrado")
    ticket, vehicle = row
    ensure_unit_access(current_user, ticket.unit)

    if ticket.sst_approved:
        raise HTTPException(status_code=400, detail="Ticket ja aprovado para SST")

    ticket.sst_approved = True
    ticket.sst_approved_by = current_user.id
    ticket.sst_approved_at = datetime.now(BRASILIA_TZ).replace(tzinfo=None)
    ticket.sst_approved_notes = body.notes
    ticket.status = MaintenanceTicketStatus.VALIDATED
    db.flush()

    # Notifica técnicos/engenheiros da unidade via email
    sst_users = (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            User.role.in_([UserRole.TECNICO_SEGURANCA, UserRole.ENGENHEIRO_SEGURANCA]),
        )
        .all()
    )
    sst_emails = [
        u.email
        for u in sst_users
        if u.email
        and (
            u.role == UserRole.ENGENHEIRO_SEGURANCA
            or (u.unit and u.unit == ticket.unit)
            or (u.units and ticket.unit in u.units)
        )
    ]
    if sst_emails:
        blocking_items = json.loads(ticket.blocking_items or "[]")
        send_sst_approval_notification(
            sst_emails=sst_emails,
            ticket_id=ticket.id,
            unit=ticket.unit,
            prefix=vehicle.prefix,
            blocking_items=blocking_items,
            approver_name=current_user.display_name or current_user.name,
            notes=body.notes,
        )

    db.commit()
    db.refresh(ticket)
    return _ticket_response(ticket, vehicle.prefix)


@router.get("/safety/sst-view", response_model=dict)
async def sst_view(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Visão consultiva para Técnico/Engenheiro: submissões + tickets aprovados pela gerência."""
    _require_safety_user(current_user)

    submissions_q = (
        db.query(DriverChecklistSubmission, SafetyVehicle)
        .join(SafetyVehicle, SafetyVehicle.id == DriverChecklistSubmission.vehicle_id)
        .order_by(DriverChecklistSubmission.submitted_at.desc())
    )
    submissions_q = apply_user_unit_scope(
        submissions_q, SafetyVehicle.unit, current_user
    )

    tickets_q = (
        db.query(MaintenanceTicket, SafetyVehicle)
        .join(SafetyVehicle, SafetyVehicle.id == MaintenanceTicket.vehicle_id)
        .order_by(MaintenanceTicket.created_at.desc())
    )
    tickets_q = apply_user_unit_scope(tickets_q, MaintenanceTicket.unit, current_user)

    # Técnico vê apenas tickets aprovados pela gerência
    is_tecnico = current_user.role.value == "tecnico_seguranca"
    if is_tecnico:
        tickets_q = tickets_q.filter(MaintenanceTicket.sst_approved.is_(True))

    submissions = [
        {
            "id": s.id,
            "prefix": v.prefix,
            "unit": v.unit,
            "driver_name": s.driver_name,
            "driver_registration": s.driver_registration,
            "overall_status": s.overall_status.value,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        }
        for s, v in submissions_q.limit(200).all()
    ]

    tickets = [
        {
            **_ticket_response(t, v.prefix).model_dump(),
            "created_at": (t.created_at.isoformat() if t.created_at else None),
            "sst_approved_at": (
                t.sst_approved_at.isoformat() if t.sst_approved_at else None
            ),
        }
        for t, v in tickets_q.limit(200).all()
    ]

    return {"submissions": submissions, "tickets": tickets, "is_tecnico": is_tecnico}


@router.get("/safety/submissions/export")
async def export_safety_submissions(
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_safety_user(current_user)
    rows = (
        db.query(DriverChecklistSubmission, SafetyVehicle)
        .join(SafetyVehicle, SafetyVehicle.id == DriverChecklistSubmission.vehicle_id)
        .order_by(DriverChecklistSubmission.submitted_at.desc())
    )
    rows = (
        apply_user_unit_scope(rows, SafetyVehicle.unit, current_user).limit(5000).all()
    )
    data = [
        [
            submission.id,
            vehicle.unit,
            vehicle.prefix,
            submission.driver_name,
            submission.driver_registration,
            (
                submission.submitted_at.strftime("%d/%m/%Y %H:%M")
                if submission.submitted_at
                else ""
            ),
            submission.overall_status.value,
        ]
        for submission, vehicle in rows
    ]
    headers = [
        "ID",
        "Unidade",
        "Prefixo",
        "Motorista",
        "Matricula",
        "Data/Hora",
        "Status",
    ]
    filename_date = datetime.now(BRASILIA_TZ).strftime("%d-%m-%Y")
    if format == "xlsx":
        wb = Workbook()
        ws = wb.active
        ws.title = "Check-list seguranca"
        ws.append(headers)
        for row in data:
            ws.append(row)
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="checklist-seguranca-{filename_date}.xlsx"'
            },
        )

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(headers)
    writer.writerows(data)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="checklist-seguranca-{filename_date}.csv"'
        },
    )
