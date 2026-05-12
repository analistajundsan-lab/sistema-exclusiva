import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLITE_URL = "sqlite:///./test.db"


# ── fixtures originais (health checks) ─────────────────────────────────────────

@pytest.fixture(scope="session")
def engine_test():
    from models import Base
    eng = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture
def db_session(engine_test):
    Session = sessionmaker(bind=engine_test)
    session = Session()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def client_with_db(engine_test):
    from main import app
    from models import get_db
    Session = sessionmaker(bind=engine_test)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    return TestClient(app)


# Mantém compatibilidade com fixtures antigas usadas nos testes de health
@pytest.fixture
def client(client_with_db):
    return client_with_db


# ── testes de health (originais) ────────────────────────────────────────────────

def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ready(client):
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "version" in response.json()


# ── testes de auth ──────────────────────────────────────────────────────────────

def test_register_user(client_with_db):
    resp = client_with_db.post("/auth/register", json={
        "cpf": "12345678901",
        "email": "op@exclusiva.com",
        "name": "Operador Teste",
        "password": "senha1234",
        "role": "operator",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "op@exclusiva.com"
    assert data["role"] == "operator"


def test_register_duplicate_cpf(client_with_db):
    payload = {
        "cpf": "98765432100",
        "email": "dup@exclusiva.com",
        "name": "Dup User",
        "password": "senha1234",
    }
    client_with_db.post("/auth/register", json=payload)
    resp = client_with_db.post("/auth/register", json=payload)
    assert resp.status_code == 400


def test_login_success(client_with_db):
    client_with_db.post("/auth/register", json={
        "cpf": "11122233344",
        "email": "login@exclusiva.com",
        "name": "Login User",
        "password": "minha_senha_123",
    })
    resp = client_with_db.post("/auth/login", json={
        "cpf": "11122233344",
        "password": "minha_senha_123",
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client_with_db):
    resp = client_with_db.post("/auth/login", json={
        "cpf": "11122233344",
        "password": "senha_errada",
    })
    assert resp.status_code == 401


def test_incidents_requires_auth(client_with_db):
    resp = client_with_db.get("/incidents/")
    assert resp.status_code in (401, 403)  # sem token — HTTPBearer retorna 403 ou 401 dependendo da versão


def test_create_and_list_incident(client_with_db):
    # registra + login para obter token
    client_with_db.post("/auth/register", json={
        "cpf": "55566677788",
        "email": "inc@exclusiva.com",
        "name": "Inc User",
        "password": "senha5678",
    })
    token_resp = client_with_db.post("/auth/login", json={
        "cpf": "55566677788",
        "password": "senha5678",
    })
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # cria ocorrência
    create_resp = client_with_db.post("/incidents/", json={
        "prefix_code": "4521",
        "incident_type": "Falha Mecânica",
        "line": "803",
        "direction": "ENTRADA",
    }, headers=headers)
    assert create_resp.status_code == 201

    # lista
    list_resp = client_with_db.get("/incidents/", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1


def test_swap_vehicle_with_itself(client_with_db):
    client_with_db.post("/auth/register", json={
        "cpf": "99988877766",
        "email": "swap@exclusiva.com",
        "name": "Swap User",
        "password": "swap5678",
    })
    token = client_with_db.post("/auth/login", json={
        "cpf": "99988877766",
        "password": "swap5678",
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client_with_db.post("/swaps/", json={
        "vehicle_out": "1234",
        "vehicle_in": "1234",
        "lines_covered": "803",
    }, headers=headers)
    assert resp.status_code == 422
