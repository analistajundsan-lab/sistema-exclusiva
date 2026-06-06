import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from main import app
from models import AuditLog, Base, User, get_db, UserRole
from auth import hash_password
import hashlib
import re

# Test database
TEST_DB = "sqlite:///./test.db"
engine = create_engine(TEST_DB, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_teardown():
    """Clear database before each test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def hash_cpf(cpf: str) -> str:
    """Hash CPF the same way as routes_auth."""
    cpf_clean = re.sub(r"\D", "", cpf)
    return hashlib.sha256(cpf_clean.encode()).hexdigest()[:16]


@pytest.fixture
def sample_user():
    """Create a sample user in the test database."""
    db = TestingSessionLocal()
    cpf_hash = hash_cpf("123.456.789-00")
    user = User(
        cpf_hash=cpf_hash,
        email="operator@test.com",
        name="Test Operator",
        password_hash=hash_password("password123"),
        role=UserRole.OPERATOR,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id
    db.close()
    return {"cpf": "123.456.789-00", "password": "password123", "id": user_id}


def test_register_success():
    """Test successful user registration."""
    response = client.post(
        "/auth/register",
        json={
            "cpf": "111.222.333-44",
            "email": "newuser@test.com",
            "name": "New User",
            "password": "SecurePass123!",
            "role": "operator",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "newuser@test.com"
    assert data["name"] == "New User"
    assert "password_hash" not in data


def test_public_register_cannot_create_admin():
    response = client.post(
        "/auth/register",
        json={
            "cpf": "222.333.444-55",
            "email": "fakeadmin@test.com",
            "name": "Fake Admin",
            "password": "SecurePass123!",
            "role": "admin",
        },
    )
    assert response.status_code == 200
    assert response.json()["role"] == "operator"


def test_admin_creates_user_with_temporary_password():
    db = TestingSessionLocal()
    admin = User(
        cpf_hash=hash_cpf("41637531842"),
        email="admin@test.com",
        name="Admin",
        password_hash=hash_password("password123"),
        role=UserRole.ADMIN,
        is_active=True,
        can_delete_history=True,
    )
    db.add(admin)
    db.commit()
    db.close()

    token = client.post(
        "/auth/login", json={"cpf": "41637531842", "password": "password123"}
    ).json()["access_token"]
    response = client.post(
        "/auth/users",
        json={
            "cpf": "33344455566",
            "email": "plantao@test.com",
            "name": "Plantonista",
            "password": "TempPass123!",
            "role": "operator",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "operator"
    assert data["must_change_password"] is True


def test_register_duplicate_cpf(sample_user):
    """Test registration with duplicate CPF."""
    response = client.post(
        "/auth/register",
        json={
            "cpf": "123.456.789-00",  # Same as sample_user
            "email": "another@test.com",
            "name": "Another User",
            "password": "SecurePass123!",
            "role": "operator",
        },
    )
    assert response.status_code == 400
    assert "já cadastrado" in response.json()["detail"]


def test_login_success(sample_user):
    """Test successful login."""
    response = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": sample_user["password"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_credentials(sample_user):
    """Test login with invalid credentials."""
    response = client.post(
        "/auth/login", json={"cpf": sample_user["cpf"], "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert "Credenciais inválidas" in response.json()["detail"]


def test_login_nonexistent_user():
    """Test login with non-existent user."""
    response = client.post(
        "/auth/login", json={"cpf": "999.999.999-99", "password": "anypassword"}
    )
    assert response.status_code == 401


def test_login_inactive_user(sample_user):
    """Test login with inactive user."""
    db = TestingSessionLocal()
    user = db.query(User).filter(User.id == sample_user["id"]).first()
    user.is_active = False
    db.commit()
    db.close()

    response = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": sample_user["password"]},
    )
    assert response.status_code == 403
    assert "inativo" in response.json()["detail"]


def test_refresh_token(sample_user):
    """Test token refresh."""
    # First, login
    login_response = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": sample_user["password"]},
    )
    tokens = login_response.json()

    # Now refresh
    response = client.post(
        "/auth/refresh", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_invalid_token():
    """Test refresh with invalid token."""
    response = client.post(
        "/auth/refresh", headers={"Authorization": "Bearer invalid.token.here"}
    )
    assert response.status_code == 401


def test_password_reset_request_unknown_email_is_generic():
    """E-mail inexistente retorna mensagem generica (sem enumeracao)."""
    response = client.post(
        "/auth/password-reset-request", json={"email": "naoexiste@test.com"}
    )
    assert response.status_code == 200
    assert "message" in response.json()


def test_password_reset_request_existing_email_same_message(sample_user):
    """E-mail existente retorna exatamente a mesma mensagem do inexistente."""
    unknown = client.post(
        "/auth/password-reset-request", json={"email": "naoexiste@test.com"}
    ).json()
    existing = client.post(
        "/auth/password-reset-request", json={"email": "operator@test.com"}
    ).json()
    assert unknown == existing


def _create_reset_token(user_id: int, *, expired: bool = False, used: bool = False):
    """Cria um token de reset diretamente no banco e retorna o token cru."""
    import secrets as _secrets
    from datetime import datetime, timedelta, timezone
    from models import PasswordResetToken
    import hashlib as _hashlib

    raw = _secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db = TestingSessionLocal()
    rec = PasswordResetToken(
        user_id=user_id,
        token_hash=_hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=(
            now - timedelta(minutes=5) if expired else now + timedelta(minutes=30)
        ),
        used_at=now if used else None,
    )
    db.add(rec)
    db.commit()
    db.close()
    return raw


def test_password_reset_valid_token_changes_password(sample_user):
    raw = _create_reset_token(sample_user["id"])
    response = client.post(
        "/auth/password-reset",
        json={"token": raw, "new_password": "NovaSenhaForte123!"},
    )
    assert response.status_code == 200
    # Login com a nova senha funciona
    login = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": "NovaSenhaForte123!"},
    )
    assert login.status_code == 200


def test_password_reset_token_single_use(sample_user):
    raw = _create_reset_token(sample_user["id"])
    first = client.post(
        "/auth/password-reset",
        json={"token": raw, "new_password": "NovaSenhaForte123!"},
    )
    assert first.status_code == 200
    second = client.post(
        "/auth/password-reset",
        json={"token": raw, "new_password": "OutraSenhaForte123!"},
    )
    assert second.status_code == 400


def test_password_reset_expired_token_fails(sample_user):
    raw = _create_reset_token(sample_user["id"], expired=True)
    response = client.post(
        "/auth/password-reset",
        json={"token": raw, "new_password": "NovaSenhaForte123!"},
    )
    assert response.status_code == 400


def test_password_reset_invalid_token_fails():
    response = client.post(
        "/auth/password-reset",
        json={"token": "token-invalido-qualquer", "new_password": "NovaSenhaForte123!"},
    )
    assert response.status_code == 400


def test_password_reset_rejects_weak_password(sample_user):
    raw = _create_reset_token(sample_user["id"])
    response = client.post(
        "/auth/password-reset",
        json={"token": raw, "new_password": "curta"},
    )
    assert response.status_code in (400, 422)


def test_register_rejects_short_password():
    response = client.post(
        "/auth/register",
        json={
            "cpf": "555.666.777-88",
            "email": "weak@test.com",
            "name": "Weak Pass",
            "password": "Curta123",  # 8 chars, abaixo de 12
            "role": "operator",
        },
    )
    assert response.status_code == 400


def test_no_runtime_cpf_backdoor():
    """Usuario com o CPF antigo do super admin NAO recebe superacesso sem a flag."""
    db = TestingSessionLocal()
    user = User(
        cpf_hash=hash_cpf("41637531842"),
        email="impostor@test.com",
        name="Impostor",
        password_hash=hash_password("password123"),
        role=UserRole.OPERATOR,
        is_active=True,
        is_super_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    assert user.has_full_access is False
    db.close()


def test_change_password_clears_temporary_flag(sample_user):
    login_response = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": sample_user["password"]},
    )
    token = login_response.json()["access_token"]

    response = client.post(
        "/auth/change-password",
        json={
            "current_password": sample_user["password"],
            "new_password": "NovaSenha123!",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["must_change_password"] is False


def test_history_delete_permission_only_vinicius():
    db = TestingSessionLocal()
    admin = User(
        cpf_hash=hash_cpf("22692036824"),
        email="jerusa@test.com",
        name="Jerusa",
        password_hash=hash_password("password123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    vinicius = User(
        cpf_hash=hash_cpf("41637531842"),
        email="vinicius@test.com",
        name="Vinicius",
        password_hash=hash_password("password123"),
        role=UserRole.ADMIN,
        is_active=True,
        is_super_admin=True,
    )
    db.add_all([admin, vinicius])
    db.commit()
    db.refresh(admin)
    db.refresh(vinicius)
    admin_id = admin.id
    vinicius_id = vinicius.id
    db.close()

    admin_token = client.post(
        "/auth/login", json={"cpf": "22692036824", "password": "password123"}
    ).json()["access_token"]

    denied = client.patch(
        f"/auth/users/{admin_id}/history-permission",
        params={"can_delete_history": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert denied.status_code == 422

    allowed = client.patch(
        f"/auth/users/{vinicius_id}/history-permission",
        params={"can_delete_history": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert allowed.status_code == 200
    assert allowed.json()["can_delete_history"] is True


def test_only_vinicius_permission_soft_deletes_and_restores_history():
    db = TestingSessionLocal()
    jerusa = User(
        cpf_hash=hash_cpf("22692036824"),
        email="jerusa@test.com",
        name="Jerusa",
        password_hash=hash_password("password123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    vinicius = User(
        cpf_hash=hash_cpf("41637531842"),
        email="vinicius@test.com",
        name="Vinicius",
        password_hash=hash_password("password123"),
        role=UserRole.ADMIN,
        is_active=True,
        can_delete_history=True,
    )
    db.add_all([jerusa, vinicius])
    db.flush()
    log = AuditLog(user_id=jerusa.id, action="TESTE", resource="test")
    db.add(log)
    db.commit()
    db.refresh(log)
    log_id = log.id
    db.close()

    jerusa_token = client.post(
        "/auth/login", json={"cpf": "22692036824", "password": "password123"}
    ).json()["access_token"]
    vinicius_token = client.post(
        "/auth/login", json={"cpf": "41637531842", "password": "password123"}
    ).json()["access_token"]

    forbidden = client.delete(
        f"/audit/logs/{log_id}", headers={"Authorization": f"Bearer {jerusa_token}"}
    )
    assert forbidden.status_code == 403

    deleted = client.delete(
        f"/audit/logs/{log_id}", headers={"Authorization": f"Bearer {vinicius_token}"}
    )
    assert deleted.status_code == 200

    visible_deleted = client.get(
        "/audit/logs",
        params={"include_deleted": True},
        headers={"Authorization": f"Bearer {vinicius_token}"},
    )
    assert any(
        item["id"] == log_id and item["deleted_at"] for item in visible_deleted.json()
    )

    restored = client.post(
        f"/audit/logs/{log_id}/restore",
        headers={"Authorization": f"Bearer {vinicius_token}"},
    )
    assert restored.status_code == 200


def test_refresh_rotates_and_revokes_old_token(sample_user):
    login = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": sample_user["password"]},
    ).json()
    old_refresh = login["refresh_token"]

    first = client.post(
        "/auth/refresh", headers={"Authorization": f"Bearer {old_refresh}"}
    )
    assert first.status_code == 200
    new_refresh = first.json()["refresh_token"]

    # Reutilizar o token antigo falha (rotacao/revogacao server-side).
    reused = client.post(
        "/auth/refresh", headers={"Authorization": f"Bearer {old_refresh}"}
    )
    assert reused.status_code == 401

    # O token novo funciona.
    ok = client.post(
        "/auth/refresh", headers={"Authorization": f"Bearer {new_refresh}"}
    )
    assert ok.status_code == 200


def test_password_reset_revokes_active_sessions(sample_user):
    login = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": sample_user["password"]},
    ).json()
    refresh = login["refresh_token"]

    raw = _create_reset_token(sample_user["id"])
    done = client.post(
        "/auth/password-reset",
        json={"token": raw, "new_password": "NovaSenhaForte123!"},
    )
    assert done.status_code == 200

    revoked = client.post(
        "/auth/refresh", headers={"Authorization": f"Bearer {refresh}"}
    )
    assert revoked.status_code == 401


def test_change_password_revokes_active_sessions(sample_user):
    login = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": sample_user["password"]},
    ).json()
    refresh = login["refresh_token"]
    access = login["access_token"]

    changed = client.post(
        "/auth/change-password",
        json={
            "current_password": sample_user["password"],
            "new_password": "NovaSenhaForte123!",
        },
        headers={"Authorization": f"Bearer {access}"},
    )
    assert changed.status_code == 200

    revoked = client.post(
        "/auth/refresh", headers={"Authorization": f"Bearer {refresh}"}
    )
    assert revoked.status_code == 401


def test_logout_revokes_session(sample_user):
    login = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": sample_user["password"]},
    ).json()
    refresh = login["refresh_token"]

    out = client.post("/auth/logout", headers={"Authorization": f"Bearer {refresh}"})
    assert out.status_code == 200

    revoked = client.post(
        "/auth/refresh", headers={"Authorization": f"Bearer {refresh}"}
    )
    assert revoked.status_code == 401


def test_deactivation_revokes_sessions(sample_user):
    db = TestingSessionLocal()
    admin = User(
        cpf_hash=hash_cpf("41637531842"),
        email="admin_deact@test.com",
        name="Admin",
        password_hash=hash_password("password123"),
        role=UserRole.ADMIN,
        is_active=True,
        is_super_admin=True,
    )
    db.add(admin)
    db.commit()
    db.close()

    user_login = client.post(
        "/auth/login",
        json={"cpf": sample_user["cpf"], "password": sample_user["password"]},
    ).json()
    refresh = user_login["refresh_token"]

    admin_token = client.post(
        "/auth/login", json={"cpf": "41637531842", "password": "password123"}
    ).json()["access_token"]

    toggled = client.patch(
        f"/auth/users/{sample_user['id']}/toggle",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert toggled.status_code == 200
    assert toggled.json()["is_active"] is False

    revoked = client.post(
        "/auth/refresh", headers={"Authorization": f"Bearer {refresh}"}
    )
    assert revoked.status_code == 401


def test_health_endpoint():
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ready_endpoint():
    """Test readiness endpoint."""
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
