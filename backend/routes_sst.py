import json
from datetime import datetime, date as date_type, timedelta
from zoneinfo import ZoneInfo
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import apply_user_unit_scope, get_current_user, require_role
from models import (
    AuditLog,
    DriverChecklistSubmission,
    Incident,
    LiberacaoCondutor,
    LiberacaoStatus,
    SafetyVehicle,
    SaudeBeEstarCondutor,
    Sinistro,
    SinistroHistorico,
    SinistroStatus,
    User,
    UserRole,
    get_db,
)
from schemas import (
    LiberacaoCreate,
    LiberacaoResponse,
    LiberacaoUpdate,
    SaudeCreate,
    SaudeResponse,
    SaudeUpdate,
    SinistroCreate,
    SinistroHistoricoResponse,
    SinistroResponse,
    SinistroUpdate,
    SSTDashboardResponse,
    SSTForwardRequest,
)

router = APIRouter(prefix="/sst", tags=["sst"])
BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")

SST_ROLES = (
    UserRole.TECNICO_SEGURANCA,
    UserRole.ENGENHEIRO_SEGURANCA,
    UserRole.ADMIN,
)

FORWARD_ROLES = (
    UserRole.GERENTE,
    UserRole.SUPERVISAO,
    UserRole.ADMIN,
)


def _json_list(value: Optional[str]) -> Optional[List[str]]:
    if value is None:
        return None
    try:
        return json.loads(value)
    except Exception:
        return []


def _to_json(value: Optional[List[str]]) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


def _serialize_sinistro(s: Sinistro) -> dict:
    d = {c.name: getattr(s, c.name) for c in s.__table__.columns}
    d["danos_identificados"] = _json_list(s.danos_identificados)
    d["evidencias"] = _json_list(s.evidencias)
    d["envolvidos"] = _json_list(s.envolvidos)
    return d


def _serialize_liberacao(lb: LiberacaoCondutor) -> dict:
    d = {c.name: getattr(lb, c.name) for c in lb.__table__.columns}
    d["evidencias"] = _json_list(lb.evidencias)
    return d


def _serialize_saude(s: SaudeBeEstarCondutor) -> dict:
    d = {c.name: getattr(s, c.name) for c in s.__table__.columns}
    d["encaminhamentos"] = _json_list(s.encaminhamentos)
    return d


def _next_sinistro_number(db: Session) -> str:
    now = datetime.now(BRASILIA_TZ)
    prefix = now.strftime("%Y%m")
    count = (
        db.query(func.count(Sinistro.id))
        .filter(Sinistro.numero.like(f"SIN-{prefix}-%"))
        .scalar()
        or 0
    )
    return f"SIN-{prefix}-{count + 1:04d}"


def _log_sinistro_history(
    db: Session,
    sinistro_id: int,
    user_id: int,
    campo: Optional[str],
    valor_anterior: Optional[str],
    valor_novo: Optional[str],
    descricao: Optional[str] = None,
) -> None:
    db.add(
        SinistroHistorico(
            sinistro_id=sinistro_id,
            user_id=user_id,
            campo=campo,
            valor_anterior=valor_anterior,
            valor_novo=valor_novo,
            descricao=descricao,
        )
    )


# ── Dashboard ─────────────────────────────────────────────────────────────────


@router.get("/dashboard", response_model=SSTDashboardResponse)
async def sst_dashboard(
    unit: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    now = datetime.now(BRASILIA_TZ)
    today = now.date()

    sinistro_q = apply_user_unit_scope(db.query(Sinistro), Sinistro.unit, current_user)
    if unit:
        sinistro_q = sinistro_q.filter(Sinistro.unit == unit)

    sinistros_mes = sinistro_q.filter(
        func.extract("month", Sinistro.data_ocorrencia) == today.month,
        func.extract("year", Sinistro.data_ocorrencia) == today.year,
    ).count()
    sinistros_ano = sinistro_q.filter(
        func.extract("year", Sinistro.data_ocorrencia) == today.year
    ).count()
    sinistros_investigacao = sinistro_q.filter(
        Sinistro.status == SinistroStatus.EM_INVESTIGACAO
    ).count()
    sinistros_encerrados = sinistro_q.filter(
        Sinistro.status == SinistroStatus.ENCERRADO
    ).count()

    colisoes = sinistro_q.filter(Sinistro.tipo_sinistro.ilike("%colisao%")).count()
    abalroamentos = sinistro_q.filter(
        Sinistro.tipo_sinistro.ilike("%abalroamento%")
    ).count()

    liberacao_q = apply_user_unit_scope(
        db.query(LiberacaoCondutor), LiberacaoCondutor.unit, current_user
    )
    if unit:
        liberacao_q = liberacao_q.filter(LiberacaoCondutor.unit == unit)

    condutores_bloqueados = liberacao_q.filter(
        LiberacaoCondutor.resultado == LiberacaoStatus.NAO_LIBERADO
    ).count()
    condutores_liberados = liberacao_q.filter(
        LiberacaoCondutor.resultado == LiberacaoStatus.LIBERADO
    ).count()

    veiculo_q = apply_user_unit_scope(
        db.query(SafetyVehicle), SafetyVehicle.unit, current_user
    )
    if unit:
        veiculo_q = veiculo_q.filter(SafetyVehicle.unit == unit)
    total_veiculos = veiculo_q.filter(SafetyVehicle.active.is_(True)).count()

    # Check-list escopado por unidade via join com o veiculo (a submissao nao
    # tem coluna unit propria).
    def _scoped_checklist_query():
        q = db.query(DriverChecklistSubmission).join(
            SafetyVehicle, SafetyVehicle.id == DriverChecklistSubmission.vehicle_id
        )
        q = apply_user_unit_scope(q, SafetyVehicle.unit, current_user)
        if unit:
            q = q.filter(SafetyVehicle.unit == unit)
        return q

    checklists_hoje = _scoped_checklist_query().filter(
        func.date(DriverChecklistSubmission.submitted_at) == today
    ).count()
    veiculos_com_checklist_hoje = (
        _scoped_checklist_query()
        .filter(func.date(DriverChecklistSubmission.submitted_at) == today)
        .with_entities(DriverChecklistSubmission.vehicle_id)
        .distinct()
        .count()
    )
    checklists_pendentes = max(0, total_veiculos - veiculos_com_checklist_hoje)

    total_motoristas = (
        _scoped_checklist_query()
        .with_entities(DriverChecklistSubmission.driver_registration)
        .distinct()
        .count()
    )

    ocorrencia_q = apply_user_unit_scope(
        db.query(Incident).filter(Incident.sst_forwarded.is_(True)),
        Incident.unit,
        current_user,
    )
    if unit:
        ocorrencia_q = ocorrencia_q.filter(Incident.unit == unit)
    ocorrencias_sst = ocorrencia_q.count()

    top_condutores_raw = (
        sinistro_q.filter(Sinistro.condutor_nome.isnot(None))
        .with_entities(Sinistro.condutor_nome, func.count(Sinistro.id).label("total"))
        .group_by(Sinistro.condutor_nome)
        .order_by(func.count(Sinistro.id).desc())
        .limit(5)
        .all()
    )
    top_condutores = [{"nome": r[0], "total": r[1]} for r in top_condutores_raw]

    top_veiculos_raw = (
        sinistro_q.filter(Sinistro.prefixo.isnot(None))
        .with_entities(Sinistro.prefixo, func.count(Sinistro.id).label("total"))
        .group_by(Sinistro.prefixo)
        .order_by(func.count(Sinistro.id).desc())
        .limit(5)
        .all()
    )
    top_veiculos = [{"prefixo": r[0], "total": r[1]} for r in top_veiculos_raw]

    return SSTDashboardResponse(
        total_veiculos=total_veiculos,
        total_motoristas=total_motoristas,
        sinistros_mes=sinistros_mes,
        sinistros_ano=sinistros_ano,
        sinistros_investigacao=sinistros_investigacao,
        sinistros_encerrados=sinistros_encerrados,
        condutores_bloqueados=condutores_bloqueados,
        condutores_liberados=condutores_liberados,
        checklists_hoje=checklists_hoje,
        checklists_pendentes=checklists_pendentes,
        colisoes=colisoes,
        abalroamentos=abalroamentos,
        ocorrencias_sst=ocorrencias_sst,
        top_condutores=top_condutores,
        top_veiculos=top_veiculos,
    )


def _turno_label(hora: Optional[str]) -> str:
    try:
        h = int((hora or "").split(":")[0])
    except (ValueError, IndexError):
        return "Nao informado"
    if 0 <= h <= 5:
        return "Madrugada"
    if 6 <= h <= 11:
        return "Manha"
    if 12 <= h <= 17:
        return "Tarde"
    return "Noite"


def _last_12_months(today: date_type) -> list[str]:
    months = []
    y, m = today.year, today.month
    for i in range(11, -1, -1):
        mm, yy = m - i, y
        while mm <= 0:
            mm += 12
            yy -= 1
        months.append(f"{yy:04d}-{mm:02d}")
    return months


def _top(counter: dict, key_name: str, limit: int = 5) -> list[dict]:
    items = sorted(counter.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [{key_name: k, "total": v} for k, v in items]


@router.get("/dashboard-v2")
async def sst_dashboard_v2(
    unit: Optional[str] = None,
    date_start: Optional[date_type] = None,
    date_end: Optional[date_type] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    """Cockpit BI agregado de SST (Fase 1): tendencias, breakdowns, rankings,
    conformidade de check-list e KPIs com variacao — usando os dados ja existentes."""
    now = datetime.now(BRASILIA_TZ)
    today = now.date()

    d_end = date_end or today
    d_start = date_start or (d_end - timedelta(days=29))
    if d_start > d_end:
        d_start, d_end = d_end, d_start
    period_days = (d_end - d_start).days + 1
    prev_end = d_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period_days - 1)

    def _sin_q():
        q = apply_user_unit_scope(db.query(Sinistro), Sinistro.unit, current_user)
        if unit:
            q = q.filter(Sinistro.unit == unit)
        return q

    months = _last_12_months(today)
    fetch_start = min(d_start, prev_start, date_type(int(months[0][:4]), int(months[0][5:]), 1))
    rows = (
        _sin_q()
        .filter(Sinistro.data_ocorrencia >= fetch_start)
        .with_entities(
            Sinistro.data_ocorrencia,
            Sinistro.hora_ocorrencia,
            Sinistro.tipo_sinistro,
            Sinistro.unit,
            Sinistro.prefixo,
            Sinistro.condutor_nome,
            Sinistro.cidade,
            Sinistro.status,
        )
        .all()
    )

    por_mes = {mo: 0 for mo in months}
    por_tipo, por_turno, por_unidade = {}, {}, {}
    rk_cond, rk_veic, rk_cidade = {}, {}, {}
    sinistros_periodo = sinistros_prev = 0

    for data_oc, hora, tipo, u, prefixo, condutor, cidade, st in rows:
        if data_oc is None:
            continue
        mo = f"{data_oc.year:04d}-{data_oc.month:02d}"
        if mo in por_mes:
            por_mes[mo] += 1
        if d_start <= data_oc <= d_end:
            sinistros_periodo += 1
            if tipo:
                por_tipo[tipo] = por_tipo.get(tipo, 0) + 1
            por_turno[_turno_label(hora)] = por_turno.get(_turno_label(hora), 0) + 1
            if u:
                por_unidade[u] = por_unidade.get(u, 0) + 1
            if condutor:
                rk_cond[condutor] = rk_cond.get(condutor, 0) + 1
            if prefixo:
                rk_veic[prefixo] = rk_veic.get(prefixo, 0) + 1
            if cidade:
                rk_cidade[cidade] = rk_cidade.get(cidade, 0) + 1
        elif prev_start <= data_oc <= prev_end:
            sinistros_prev += 1

    if sinistros_prev > 0:
        delta_pct = round((sinistros_periodo - sinistros_prev) / sinistros_prev * 100)
    else:
        delta_pct = 100 if sinistros_periodo > 0 else 0

    sinistros_investigacao = _sin_q().filter(
        Sinistro.status == SinistroStatus.EM_INVESTIGACAO
    ).count()

    # ── Veiculos + conformidade de check-list ──
    veiculo_q = apply_user_unit_scope(
        db.query(SafetyVehicle), SafetyVehicle.unit, current_user
    )
    if unit:
        veiculo_q = veiculo_q.filter(SafetyVehicle.unit == unit)
    total_veiculos = veiculo_q.filter(SafetyVehicle.active.is_(True)).count()

    def _chk_q():
        q = db.query(DriverChecklistSubmission).join(
            SafetyVehicle, SafetyVehicle.id == DriverChecklistSubmission.vehicle_id
        )
        q = apply_user_unit_scope(q, SafetyVehicle.unit, current_user)
        if unit:
            q = q.filter(SafetyVehicle.unit == unit)
        return q

    veic_chk_hoje = (
        _chk_q()
        .filter(func.date(DriverChecklistSubmission.submitted_at) == today)
        .with_entities(DriverChecklistSubmission.vehicle_id)
        .distinct()
        .count()
    )
    compliance_pct = round(veic_chk_hoje / total_veiculos * 100) if total_veiculos else 0

    chk_rows = (
        _chk_q()
        .filter(func.date(DriverChecklistSubmission.submitted_at) >= today - timedelta(days=13))
        .with_entities(
            DriverChecklistSubmission.submitted_at,
            DriverChecklistSubmission.overall_status,
        )
        .all()
    )
    checklists_por_dia = {
        (today - timedelta(days=i)).isoformat(): 0 for i in range(13, -1, -1)
    }
    chk_por_status = {}
    for submitted_at, ov in chk_rows:
        if submitted_at is None:
            continue
        d = submitted_at.date().isoformat()
        if d in checklists_por_dia:
            checklists_por_dia[d] += 1
        key = getattr(ov, "value", str(ov))
        chk_por_status[key] = chk_por_status.get(key, 0) + 1

    # ── Liberacao de condutor ──
    lib_q = apply_user_unit_scope(
        db.query(LiberacaoCondutor), LiberacaoCondutor.unit, current_user
    )
    if unit:
        lib_q = lib_q.filter(LiberacaoCondutor.unit == unit)
    condutores_bloqueados = lib_q.filter(
        LiberacaoCondutor.resultado == LiberacaoStatus.NAO_LIBERADO
    ).count()
    condutores_restricao = lib_q.filter(
        LiberacaoCondutor.resultado == LiberacaoStatus.LIBERADO_COM_RESTRICAO
    ).count()

    flag_labels = [
        ("documentacao_ok", "Documentacao"),
        ("treinamentos_ok", "Treinamentos"),
        ("exames_ok", "Exames"),
        ("aso_ok", "ASO"),
        ("reciclagem_ok", "Reciclagem"),
        ("avaliacoes_sst_ok", "Avaliacoes SST"),
    ]
    bloqueio_motivos = {label: 0 for _, label in flag_labels}
    for lb in lib_q.filter(
        LiberacaoCondutor.resultado.in_(
            [LiberacaoStatus.NAO_LIBERADO, LiberacaoStatus.LIBERADO_COM_RESTRICAO]
        )
    ).all():
        for attr, label in flag_labels:
            if getattr(lb, attr) is False:
                bloqueio_motivos[label] += 1

    # ── Ocorrencias SST encaminhadas (escopadas) ──
    ocorrencia_q = apply_user_unit_scope(
        db.query(Incident).filter(Incident.sst_forwarded.is_(True)),
        Incident.unit,
        current_user,
    )
    if unit:
        ocorrencia_q = ocorrencia_q.filter(Incident.unit == unit)
    ocorrencias_sst = ocorrencia_q.count()

    # Indice de atencao (heuristico, 0-100): sinistros do periodo + bloqueios +
    # nao-conformidade de check-list. Nao e formula oficial de risco.
    risk_score = min(
        100,
        round(sinistros_periodo * 8 + condutores_bloqueados * 12 + (100 - compliance_pct) * 0.4),
    )

    return {
        "period": {"start": d_start.isoformat(), "end": d_end.isoformat()},
        "summary": {
            "risk_score": risk_score,
            "sinistros_periodo": sinistros_periodo,
            "sinistros_delta_pct": delta_pct,
            "checklist_compliance_pct": compliance_pct,
            "condutores_bloqueados": condutores_bloqueados,
            "condutores_restricao": condutores_restricao,
            "sinistros_investigacao": sinistros_investigacao,
            "ocorrencias_sst": ocorrencias_sst,
            "total_veiculos": total_veiculos,
        },
        "trends": {
            "sinistros_por_mes": [{"mes": k, "total": v} for k, v in por_mes.items()],
            "checklists_por_dia": [
                {"dia": k, "total": v} for k, v in checklists_por_dia.items()
            ],
        },
        "breakdowns": {
            "por_tipo": _top(por_tipo, "tipo", 8),
            "por_turno": [
                {"turno": t, "total": por_turno.get(t, 0)}
                for t in ["Madrugada", "Manha", "Tarde", "Noite", "Nao informado"]
                if por_turno.get(t, 0) > 0
            ],
            "por_unidade": _top(por_unidade, "unidade", 8),
            "checklist_por_status": [
                {"status": k, "total": v} for k, v in chk_por_status.items()
            ],
            "bloqueio_por_motivo": [
                {"motivo": k, "total": v}
                for k, v in bloqueio_motivos.items()
                if v > 0
            ],
        },
        "rankings": {
            "condutores": _top(rk_cond, "nome"),
            "veiculos": _top(rk_veic, "prefixo"),
            "cidades": _top(rk_cidade, "cidade"),
        },
    }


# ── Sinistros ─────────────────────────────────────────────────────────────────


@router.post("/sinistros", status_code=status.HTTP_201_CREATED)
async def create_sinistro(
    body: SinistroCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    from auth import ensure_unit_access

    ensure_unit_access(current_user, body.unit)

    data = body.model_dump()
    data["danos_identificados"] = _to_json(data.pop("danos_identificados"))
    data["evidencias"] = _to_json(data.pop("evidencias"))
    data["envolvidos"] = _to_json(data.pop("envolvidos"))
    data["numero"] = _next_sinistro_number(db)

    sinistro = Sinistro(**data, created_by=current_user.id)
    db.add(sinistro)
    db.flush()

    _log_sinistro_history(
        db, sinistro.id, current_user.id, None, None, None, "Sinistro criado"
    )
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource="sinistro",
            resource_id=sinistro.id,
        )
    )
    db.commit()
    db.refresh(sinistro)
    return _serialize_sinistro(sinistro)


@router.get("/sinistros", response_model=List[SinistroResponse])
async def list_sinistros(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    unit: Optional[str] = None,
    status: Optional[str] = None,
    tipo: Optional[str] = None,
    condutor: Optional[str] = None,
    prefixo: Optional[str] = None,
    data_inicio: Optional[date_type] = None,
    data_fim: Optional[date_type] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    query = apply_user_unit_scope(
        db.query(Sinistro).order_by(Sinistro.created_at.desc()),
        Sinistro.unit,
        current_user,
    )
    if unit:
        query = query.filter(Sinistro.unit == unit)
    if status:
        query = query.filter(Sinistro.status == status)
    if tipo:
        query = query.filter(Sinistro.tipo_sinistro.ilike(f"%{tipo}%"))
    if condutor:
        query = query.filter(Sinistro.condutor_nome.ilike(f"%{condutor}%"))
    if prefixo:
        query = query.filter(Sinistro.prefixo.ilike(f"%{prefixo}%"))
    if data_inicio:
        query = query.filter(Sinistro.data_ocorrencia >= data_inicio)
    if data_fim:
        query = query.filter(Sinistro.data_ocorrencia <= data_fim)

    rows = query.offset(skip).limit(limit).all()
    return [_serialize_sinistro(r) for r in rows]


@router.get("/sinistros/{sinistro_id}")
async def get_sinistro(
    sinistro_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    sinistro = db.query(Sinistro).filter(Sinistro.id == sinistro_id).first()
    if not sinistro:
        raise HTTPException(status_code=404, detail="Sinistro nao encontrado")
    from auth import ensure_unit_access

    ensure_unit_access(current_user, sinistro.unit)
    return _serialize_sinistro(sinistro)


@router.put("/sinistros/{sinistro_id}")
async def update_sinistro(
    sinistro_id: int,
    body: SinistroUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    sinistro = db.query(Sinistro).filter(Sinistro.id == sinistro_id).first()
    if not sinistro:
        raise HTTPException(status_code=404, detail="Sinistro nao encontrado")
    from auth import ensure_unit_access

    ensure_unit_access(current_user, sinistro.unit)

    update_data = body.model_dump(exclude_unset=True)
    for field in ("danos_identificados", "evidencias", "envolvidos"):
        if field in update_data:
            update_data[field] = _to_json(update_data[field])

    for field, new_val in update_data.items():
        old_val = getattr(sinistro, field)
        if str(old_val) != str(new_val):
            _log_sinistro_history(
                db,
                sinistro.id,
                current_user.id,
                field,
                str(old_val),
                str(new_val),
            )
        setattr(sinistro, field, new_val)

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource="sinistro",
            resource_id=sinistro_id,
        )
    )
    db.commit()
    db.refresh(sinistro)
    return _serialize_sinistro(sinistro)


@router.get(
    "/sinistros/{sinistro_id}/historico",
    response_model=List[SinistroHistoricoResponse],
)
async def sinistro_historico(
    sinistro_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    sinistro = db.query(Sinistro).filter(Sinistro.id == sinistro_id).first()
    if not sinistro:
        raise HTTPException(status_code=404, detail="Sinistro nao encontrado")
    from auth import ensure_unit_access

    ensure_unit_access(current_user, sinistro.unit)

    return (
        db.query(SinistroHistorico)
        .filter(SinistroHistorico.sinistro_id == sinistro_id)
        .order_by(SinistroHistorico.created_at.asc())
        .all()
    )


# ── Ocorrências encaminhadas para SST ─────────────────────────────────────────


@router.post("/ocorrencias/{incident_id}/encaminhar")
async def encaminhar_para_sst(
    incident_id: int,
    body: SSTForwardRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*FORWARD_ROLES)),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Ocorrência não encontrada")
    if incident.sst_forwarded:
        raise HTTPException(
            status_code=400, detail="Ocorrência já encaminhada para SST"
        )

    incident.sst_forwarded = True
    incident.sst_forwarded_at = datetime.now(BRASILIA_TZ)
    incident.sst_forwarded_by = current_user.id
    incident.sst_forward_reason = body.reason
    incident.sst_forward_priority = body.priority

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="SST_FORWARD",
            resource="incident",
            resource_id=incident_id,
            details=f"prioridade={body.priority}",
        )
    )
    db.commit()
    db.refresh(incident)
    return {"detail": "Encaminhado para SST com sucesso", "incident_id": incident_id}


@router.get("/ocorrencias")
async def list_sst_ocorrencias(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    priority: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    query = (
        db.query(Incident)
        .filter(Incident.sst_forwarded.is_(True))
        .order_by(Incident.sst_forwarded_at.desc())
    )
    query = apply_user_unit_scope(query, Incident.unit, current_user)
    if priority:
        query = query.filter(Incident.sst_forward_priority == priority)
    if status:
        query = query.filter(Incident.status == status)

    rows = query.offset(skip).limit(limit).all()
    return [
        {
            "id": r.id,
            "prefix_code": r.prefix_code,
            "incident_type": r.incident_type,
            "description": r.description,
            "line": r.line,
            "unit": r.unit,
            "status": r.status,
            "sst_forwarded_at": r.sst_forwarded_at,
            "sst_forwarded_by": r.sst_forwarded_by,
            "sst_forward_reason": r.sst_forward_reason,
            "sst_forward_priority": r.sst_forward_priority,
            "created_at": r.created_at,
        }
        for r in rows
    ]


# ── Liberação de Condutor ─────────────────────────────────────────────────────


@router.post("/liberacoes", status_code=status.HTTP_201_CREATED)
async def create_liberacao(
    body: LiberacaoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    from auth import ensure_unit_access

    ensure_unit_access(current_user, body.unit)

    data = body.model_dump()
    data["evidencias"] = _to_json(data.pop("evidencias"))

    lib = LiberacaoCondutor(**data, created_by=current_user.id)
    db.add(lib)
    db.flush()

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource="liberacao_condutor",
            resource_id=lib.id,
        )
    )
    db.commit()
    db.refresh(lib)
    return _serialize_liberacao(lib)


@router.get("/liberacoes")
async def list_liberacoes(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    unit: Optional[str] = None,
    resultado: Optional[str] = None,
    condutor: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    query = apply_user_unit_scope(
        db.query(LiberacaoCondutor).order_by(LiberacaoCondutor.created_at.desc()),
        LiberacaoCondutor.unit,
        current_user,
    )
    if unit:
        query = query.filter(LiberacaoCondutor.unit == unit)
    if resultado:
        query = query.filter(LiberacaoCondutor.resultado == resultado)
    if condutor:
        query = query.filter(LiberacaoCondutor.condutor_nome.ilike(f"%{condutor}%"))

    rows = query.offset(skip).limit(limit).all()
    return [_serialize_liberacao(r) for r in rows]


@router.get("/liberacoes/{lib_id}")
async def get_liberacao(
    lib_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    lib = db.query(LiberacaoCondutor).filter(LiberacaoCondutor.id == lib_id).first()
    if not lib:
        raise HTTPException(status_code=404, detail="Liberacao nao encontrada")
    from auth import ensure_unit_access

    ensure_unit_access(current_user, lib.unit)
    return _serialize_liberacao(lib)


@router.put("/liberacoes/{lib_id}")
async def update_liberacao(
    lib_id: int,
    body: LiberacaoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    lib = db.query(LiberacaoCondutor).filter(LiberacaoCondutor.id == lib_id).first()
    if not lib:
        raise HTTPException(status_code=404, detail="Liberacao nao encontrada")
    from auth import ensure_unit_access

    ensure_unit_access(current_user, lib.unit)

    update_data = body.model_dump(exclude_unset=True)
    if "evidencias" in update_data:
        update_data["evidencias"] = _to_json(update_data["evidencias"])

    for field, value in update_data.items():
        setattr(lib, field, value)

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource="liberacao_condutor",
            resource_id=lib_id,
        )
    )
    db.commit()
    db.refresh(lib)
    return _serialize_liberacao(lib)


# ── Saúde e Bem-Estar ─────────────────────────────────────────────────────────


@router.post("/saude", status_code=status.HTTP_201_CREATED)
async def create_saude(
    body: SaudeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    from auth import ensure_unit_access

    ensure_unit_access(current_user, body.unit)

    data = body.model_dump()
    data["encaminhamentos"] = _to_json(data.pop("encaminhamentos"))

    saude = SaudeBeEstarCondutor(**data, created_by=current_user.id)
    db.add(saude)
    db.flush()

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource="saude_beestar",
            resource_id=saude.id,
        )
    )
    db.commit()
    db.refresh(saude)
    return _serialize_saude(saude)


@router.get("/saude")
async def list_saude(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    unit: Optional[str] = None,
    status: Optional[str] = None,
    condutor: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    query = apply_user_unit_scope(
        db.query(SaudeBeEstarCondutor).order_by(SaudeBeEstarCondutor.created_at.desc()),
        SaudeBeEstarCondutor.unit,
        current_user,
    )
    if unit:
        query = query.filter(SaudeBeEstarCondutor.unit == unit)
    if status:
        query = query.filter(SaudeBeEstarCondutor.status == status)
    if condutor:
        query = query.filter(SaudeBeEstarCondutor.condutor_nome.ilike(f"%{condutor}%"))

    rows = query.offset(skip).limit(limit).all()
    return [_serialize_saude(r) for r in rows]


@router.get("/saude/{saude_id}")
async def get_saude(
    saude_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    saude = (
        db.query(SaudeBeEstarCondutor)
        .filter(SaudeBeEstarCondutor.id == saude_id)
        .first()
    )
    if not saude:
        raise HTTPException(status_code=404, detail="Registro nao encontrado")
    from auth import ensure_unit_access

    ensure_unit_access(current_user, saude.unit)
    return _serialize_saude(saude)


@router.put("/saude/{saude_id}")
async def update_saude(
    saude_id: int,
    body: SaudeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*SST_ROLES)),
):
    saude = (
        db.query(SaudeBeEstarCondutor)
        .filter(SaudeBeEstarCondutor.id == saude_id)
        .first()
    )
    if not saude:
        raise HTTPException(status_code=404, detail="Registro nao encontrado")
    from auth import ensure_unit_access

    ensure_unit_access(current_user, saude.unit)

    update_data = body.model_dump(exclude_unset=True)
    if "encaminhamentos" in update_data:
        update_data["encaminhamentos"] = _to_json(update_data["encaminhamentos"])

    for field, value in update_data.items():
        setattr(saude, field, value)

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource="saude_beestar",
            resource_id=saude_id,
        )
    )
    db.commit()
    db.refresh(saude)
    return _serialize_saude(saude)
