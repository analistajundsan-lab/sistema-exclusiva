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
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id
    db.close()
    return {"cpf": "123.456.789-00", "password": "password123", "id": user_id}


def test_register_success():
    """Test successful user registration."""
    response = client.post("/auth/register", json={
        "cpf": "111.222.333-44",
        "email": "newuser@test.com",
        "name": "New User",
        "password": "SecurePass123!",
        "role": "operator"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "newuser@test.com"
    assert data["name"] == "New User"
    assert "password_hash" not in data


def test_public_register_cannot_create_admin():
    response = client.post("/auth/register", json={
        "cpf": "222.333.444-55",
        "email": "fakeadmin@test.com",
        "name": "Fake Admin",
        "password": "SecurePass123!",
        "role": "admin"
    })
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

    token = client.post("/auth/login", json={"cpf": "41637531842", "password": "password123"}).json()["access_token"]
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
    response = client.post("/auth/register", json={
        "cpf": "123.456.789-00",  # Same as sample_user
        "email": "another@test.com",
        "name": "Another User",
        "password": "SecurePass123!",
        "role": "operator"
    })
    assert response.status_code == 400
    assert "já cadastrado" in response.json()["detail"]


def test_login_success(sample_user):
    """Test successful login."""
    response = client.post("/auth/login", json={
        "cpf": sample_user["cpf"],
        "password": sample_user["password"]
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_credentials(sample_user):
    """Test login with invalid credentials."""
    response = client.post("/auth/login", json={
        "cpf": sample_user["cpf"],
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    assert "Credenciais inválidas" in response.json()["detail"]


def test_login_nonexistent_user():
    """Test login with non-existent user."""
    response = client.post("/auth/login", json={
        "cpf": "999.999.999-99",
        "password": "anypassword"
    })
    assert response.status_code == 401


def test_login_inactive_user(sample_user):
    """Test login with inactive user."""
    db = TestingSessionLocal()
    user = db.query(User).filter(User.id == sample_user["id"]).first()
    user.is_active = False
    db.commit()
    db.close()
    
    response = client.post("/auth/login", json={
        "cpf": sample_user["cpf"],
        "password": sample_user["password"]
    })
    assert response.status_code == 403
    assert "inativo" in response.json()["detail"]


def test_refresh_token(sample_user):
    """Test token refresh."""
    # First, login
    login_response = client.post("/auth/login", json={
        "cpf": sample_user["cpf"],
        "password": sample_user["password"]
    })
    tokens = login_response.json()
    
    # Now refresh
    response = client.post(
        "/auth/refresh",
        headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_invalid_token():
    """Test refresh with invalid token."""
    response = client.post(
        "/auth/refresh",
        headers={"Authorization": "Bearer invalid.token.here"}
    )
    assert response.status_code == 401


def test_password_reset_request():
    """Test password reset request."""
    response = client.post("/auth/password-reset-request?email=test@test.com")
    assert response.status_code == 200
    assert "message" in response.json()


def test_change_password_clears_temporary_flag(sample_user):
    login_response = client.post("/auth/login", json={
        "cpf": sample_user["cpf"],
        "password": sample_user["password"]
    })
    token = login_response.json()["access_token"]

    response = client.post(
        "/auth/change-password",
        json={"current_password": sample_user["password"], "new_password": "NovaSenha123!"},
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
    )
    db.add_all([admin, vinicius])
    db.commit()
    db.refresh(admin)
    db.refresh(vinicius)
    admin_id = admin.id
    vinicius_id = vinicius.id
    db.close()

    admin_token = client.post("/auth/login", json={"cpf": "22692036824", "password": "password123"}).json()["access_token"]

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

    jerusa_token = client.post("/auth/login", json={"cpf": "22692036824", "password": "password123"}).json()["access_token"]
    vinicius_token = client.post("/auth/login", json={"cpf": "41637531842", "password": "password123"}).json()["access_token"]

    forbidden = client.delete(f"/audit/logs/{log_id}", headers={"Authorization": f"Bearer {jerusa_token}"})
    assert forbidden.status_code == 403

    deleted = client.delete(f"/audit/logs/{log_id}", headers={"Authorization": f"Bearer {vinicius_token}"})
    assert deleted.status_code == 200

    visible_deleted = client.get(
        "/audit/logs",
        params={"include_deleted": True},
        headers={"Authorization": f"Bearer {vinicius_token}"},
    )
    assert any(item["id"] == log_id and item["deleted_at"] for item in visible_deleted.json())

    restored = client.post(f"/audit/logs/{log_id}/restore", headers={"Authorization": f"Bearer {vinicius_token}"})
    assert restored.status_code == 200


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
