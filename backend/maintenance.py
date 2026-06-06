"""Rotinas de retencao/limpeza de dados de seguranca (LGPD: minimizacao).

Remove artefatos de autenticacao que ja nao tem valor:
- tokens de reset de senha expirados;
- sessoes (refresh tokens) expiradas alem da janela de retencao.

Os audit_logs NAO sao apagados aqui — devem ser retidos para trilha de auditoria.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models import PasswordResetToken, UserSession

logger = logging.getLogger(__name__)

SESSION_RETENTION_DAYS = 30


def cleanup_security_tables(db: Session) -> dict:
    now = datetime.now(timezone.utc)

    removed_tokens = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.expires_at < now)
        .delete(synchronize_session=False)
    )

    cutoff = now - timedelta(days=SESSION_RETENTION_DAYS)
    removed_sessions = (
        db.query(UserSession)
        .filter(UserSession.expires_at < cutoff)
        .delete(synchronize_session=False)
    )

    db.commit()
    result = {"reset_tokens": removed_tokens, "sessions": removed_sessions}
    if removed_tokens or removed_sessions:
        logger.info("Limpeza de seguranca: %s", result)
    return result
