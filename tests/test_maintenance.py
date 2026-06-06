"""Testes da rotina de retencao/limpeza de dados de seguranca (Fase 2)."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, PasswordResetToken, UserSession, AuditLog
from maintenance import cleanup_security_tables

TEST_DB = "sqlite:///./test_maint.db"
engine = create_engine(TEST_DB, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return TestingSessionLocal()


def test_cleanup_removes_expired_reset_tokens_and_old_sessions():
    db = _fresh_db()
    now = datetime.now(timezone.utc)

    # Token expirado (deve sair) e token valido (deve permanecer).
    db.add(
        PasswordResetToken(
            user_id=1,
            token_hash="a" * 64,
            expires_at=now - timedelta(hours=1),
        )
    )
    db.add(
        PasswordResetToken(
            user_id=1,
            token_hash="b" * 64,
            expires_at=now + timedelta(hours=1),
        )
    )
    # Sessao expirada ha muito tempo (sai) e sessao recente (permanece).
    db.add(
        UserSession(
            user_id=1,
            refresh_token_hash="c" * 64,
            expires_at=now - timedelta(days=40),
        )
    )
    db.add(
        UserSession(
            user_id=1,
            refresh_token_hash="d" * 64,
            expires_at=now + timedelta(days=7),
        )
    )
    # Audit log nunca deve ser removido por esta rotina.
    db.add(AuditLog(user_id=1, action="LOGIN_SUCCESS", resource="auth"))
    db.commit()

    result = cleanup_security_tables(db)
    assert result["reset_tokens"] == 1
    assert result["sessions"] == 1

    assert db.query(PasswordResetToken).count() == 1
    assert db.query(UserSession).count() == 1
    assert db.query(AuditLog).count() == 1  # auditoria preservada
    db.close()
    Base.metadata.drop_all(bind=engine)
