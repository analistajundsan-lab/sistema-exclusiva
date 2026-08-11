"""Web Push (VAPID) — envio de notificacoes de proximidade de linha.

O agendador roda no startup do app (ver main.py) e, a cada minuto, procura
linhas PENDENTES de hoje que entraram na janela de proximidade (<= PUSH_LEAD_MINUTES)
e dispara um push para os dispositivos inscritos da MESMA unidade. O controle de
duplicidade usa a tabela push_sent_lines (insert atomico), seguro inclusive com
multiplos workers do uvicorn.
"""

import json
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from pywebpush import webpush, WebPushException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import load_only

from config import settings
from models import (
    PushSentLine,
    PushSubscription,
    ScheduleLine,
    ScheduleLineStatus,
)

logger = logging.getLogger(__name__)
BRT = ZoneInfo("America/Sao_Paulo")

# Advisory lock do Postgres para eleger UM worker por ciclo: com 2 workers do
# uvicorn cada um varria a vigencia inteira a cada 60s, dobrando o egress do
# Neon a toa. Constante arbitraria fixa; so precisa ser unica neste banco.
_SCAN_LOCK_KEY = 815_240_001


def push_enabled() -> bool:
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def _send(sub: PushSubscription, payload: dict) -> bool:
    """Envia 1 push. Retorna False se a inscricao expirou (404/410) e deve
    ser removida; True caso contrario (sucesso ou erro transitorio)."""
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=600,
            # Sem timeout o requests espera para sempre: um endpoint de push
            # pendurado congelava o ciclo inteiro do agendador.
            timeout=10,
        )
        return True
    except WebPushException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (404, 410):
            return False
        logger.error("Falha ao enviar push (%s): %s", status_code, exc)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Erro inesperado no push: %s", exc)
        return True


def scan_and_notify(db) -> int:
    """Varre as linhas e envia os pushes de proximidade. Retorna nº enviados."""
    if not push_enabled():
        return 0

    # Eleicao de 1 worker por ciclo. O lock advisory e por CONEXAO no Postgres
    # e a Session devolve a conexao ao pool a cada commit — por isso o lock usa
    # uma conexao dedicada, garantindo lock e unlock na MESMA conexao. SQLite
    # (testes) nao tem advisory lock: segue sem eleicao.
    bind = db.get_bind()
    lock_conn = None
    if bind is not None and bind.dialect.name == "postgresql":
        lock_conn = bind.engine.connect()
        got_lock = lock_conn.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": _SCAN_LOCK_KEY}
        ).scalar()
        if not got_lock:
            lock_conn.close()
            return 0  # outro worker ja esta cuidando deste ciclo
    try:
        return _scan_and_notify_elected(db)
    finally:
        if lock_conn is not None:
            try:
                lock_conn.execute(
                    text("SELECT pg_advisory_unlock(:key)"), {"key": _SCAN_LOCK_KEY}
                )
            finally:
                lock_conn.close()


def _scan_and_notify_elected(db) -> int:
    """Corpo do ciclo — roda apenas no worker que ganhou a eleicao."""
    now = datetime.now(BRT)
    today = now.date()
    now_min = now.hour * 60 + now.minute
    lead = settings.PUSH_LEAD_MINUTES

    # Limpeza do historico de envios de DIAS ANTERIORES (corte 00:00 BRT).
    # Com o modelo de vigencia a MESMA linha (mesmo id) roda todo dia; se o
    # registro de ontem ficasse (limpeza antiga era "> 2 dias"), o dedup por
    # PK bloquearia o push de hoje. A janela de envio e sempre do proprio dia.
    day_start_utc = (
        datetime(today.year, today.month, today.day, tzinfo=BRT)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    try:
        db.query(PushSentLine).filter(PushSentLine.sent_at < day_start_utc).delete(
            synchronize_session=False
        )
        db.commit()
    except Exception:
        db.rollback()

    # Import tardio para nao carregar o modulo de rotas no import deste servico.
    from routes_schedule import (
        latest_import_ids_for_date,
        non_operating_ids_for_date,
        status_for_operation_date,
    )

    # Janela de horario pre-filtrada NO SQL: start_time e "HH:MM" zero-padded,
    # entao a comparacao lexicografica equivale a comparar horarios. Sem isso a
    # query trazia a vigencia INTEIRA a cada ciclo (o maior dreno de egress do
    # Neon). A logica atual ja nao trata janela cruzando meia-noite; o cap em
    # 23:59 preserva exatamente esse comportamento.
    now_str = f"{now.hour:02d}:{now.minute:02d}"
    end_total = now_min + lead
    if end_total >= 24 * 60:
        end_str = "23:59"
    else:
        end_str = f"{end_total // 60:02d}:{end_total % 60:02d}"

    # A escala vive por VIGENCIA: schedule_date das linhas e a data do import
    # (dias atras), nunca "hoje". Filtrar por schedule_date == today fazia o
    # push NUNCA disparar. Usa o mesmo escopo de vigencia do /board.
    query = (
        db.query(ScheduleLine)
        .options(
            # So as colunas que o fluxo de push realmente acessa (payload,
            # dedup e status_for_operation_date). Atributo fora desta lista
            # dispararia um SELECT extra oculto por linha.
            load_only(
                ScheduleLine.id,
                ScheduleLine.unit,
                ScheduleLine.prefix_code,
                ScheduleLine.line_code,
                ScheduleLine.start_time,
                ScheduleLine.status,
                ScheduleLine.confirmed_at,
            )
        )
        .filter(
            ScheduleLine.status.in_(
                [ScheduleLineStatus.PENDENTE, ScheduleLineStatus.CONFIRMADA]
            ),
            ScheduleLine.is_active.isnot(False),
            ScheduleLine.start_time >= now_str,
            ScheduleLine.start_time <= end_str,
        )
    )
    active_import_ids = latest_import_ids_for_date(db, today)
    if active_import_ids:
        query = query.filter(ScheduleLine.import_id.in_(active_import_ids))
    else:
        # Compatibilidade com escalas antigas gravadas antes do versionamento.
        query = query.filter(ScheduleLine.schedule_date == today)
    lines = query.all()
    nonop_ids = non_operating_ids_for_date(db, today)

    sent = 0
    for line in lines:
        # So avisa quem esta PENDENTE para o dia de operacao: linha confirmada
        # ontem conta como pendente hoje (reset diario 00:00 BRT); linha que
        # nao opera hoje nao recebe aviso.
        if line.id in nonop_ids:
            continue
        if status_for_operation_date(line, today) != ScheduleLineStatus.PENDENTE:
            continue
        try:
            sh, sm = (int(x) for x in line.start_time.split(":"))
        except Exception:
            continue
        mins = (sh * 60 + sm) - now_min
        if not (0 <= mins <= lead):
            continue

        # Copia os campos ANTES do commit do dedup: o commit expira o objeto e
        # cada acesso posterior dispararia um SELECT de refresh por linha.
        line_id = line.id
        line_unit = line.unit
        line_code = line.line_code
        prefix_code = line.prefix_code
        start_time = line.start_time

        # Dedup atomico: o primeiro worker que inserir a linha e quem envia.
        db.add(PushSentLine(schedule_line_id=line_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue

        subs = (
            db.query(PushSubscription).filter(PushSubscription.unit == line_unit).all()
        )
        if not subs:
            continue

        payload = {
            "title": f"Linha {line_code} em {mins} min",
            "body": (
                f"Prefixo {prefix_code} • {start_time} • {line_unit}. "
                "Confirme ou registre a troca."
            ),
            "url": "/on-call",
            "tag": f"line-{line_id}",
        }
        for sub in subs:
            alive = _send(sub, payload)
            if not alive:
                db.delete(sub)
                db.commit()
            else:
                sent += 1

    return sent
