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
from sqlalchemy.exc import IntegrityError

from config import settings
from models import (
    PushSentLine,
    PushSubscription,
    ScheduleLine,
    ScheduleLineStatus,
)

logger = logging.getLogger(__name__)
BRT = ZoneInfo("America/Sao_Paulo")


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

    # A escala vive por VIGENCIA: schedule_date das linhas e a data do import
    # (dias atras), nunca "hoje". Filtrar por schedule_date == today fazia o
    # push NUNCA disparar. Usa o mesmo escopo de vigencia do /board.
    query = db.query(ScheduleLine).filter(
        ScheduleLine.status.in_(
            [ScheduleLineStatus.PENDENTE, ScheduleLineStatus.CONFIRMADA]
        ),
        ScheduleLine.is_active.isnot(False),
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

        # Dedup atomico: o primeiro worker que inserir a linha e quem envia.
        db.add(PushSentLine(schedule_line_id=line.id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue

        subs = (
            db.query(PushSubscription).filter(PushSubscription.unit == line.unit).all()
        )
        if not subs:
            continue

        payload = {
            "title": f"Linha {line.line_code} em {mins} min",
            "body": (
                f"Prefixo {line.prefix_code} • {line.start_time} • {line.unit}. "
                "Confirme ou registre a troca."
            ),
            "url": "/on-call",
            "tag": f"line-{line.id}",
        }
        for sub in subs:
            alive = _send(sub, payload)
            if not alive:
                db.delete(sub)
                db.commit()
            else:
                sent += 1

    return sent
