"""Web Push (VAPID) — envio de notificacoes de proximidade de linha.

O agendador roda no startup do app (ver main.py) e, a cada minuto, procura
linhas PENDENTES de hoje que entraram na janela de proximidade (<= PUSH_LEAD_MINUTES)
e dispara um push para os dispositivos inscritos da MESMA unidade. O controle de
duplicidade usa a tabela push_sent_lines (insert atomico), seguro inclusive com
multiplos workers do uvicorn.
"""
import json
import logging
from datetime import datetime, timedelta
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

    # Limpeza leve do historico de envios antigos (> 2 dias).
    try:
        db.query(PushSentLine).filter(
            PushSentLine.sent_at < datetime.utcnow() - timedelta(days=2)
        ).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()

    lines = (
        db.query(ScheduleLine)
        .filter(
            ScheduleLine.schedule_date == today,
            ScheduleLine.status == ScheduleLineStatus.PENDENTE,
        )
        .all()
    )

    sent = 0
    for line in lines:
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
            db.query(PushSubscription)
            .filter(PushSubscription.unit == line.unit)
            .all()
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
