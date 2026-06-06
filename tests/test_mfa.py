"""Testes de MFA (TOTP) — enrolamento, login em duas etapas e desativacao."""

import hashlib
import re

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from models import Base, User, UserRole, get_db
from auth import hash_password

TEST_DB = "sqlite:///./test_mfa.db"
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
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    client.cookies.clear()
    yield
    Base.metadata.drop_all(bind=engine)


def _hash_cpf(cpf: str) -> str:
    d = re.sub(r"\D", "", cpf)
    return hashlib.sha256(d.encode()).hexdigest()[:16]


@pytest.fixture
def admin():
    db = TestingSessionLocal()
    u = User(
        cpf_hash=_hash_cpf("41637531842"),
        email="admin@test.com",
        name="Admin",
        password_hash=hash_password("SenhaForte1234"),
        role=UserRole.ADMIN,
        is_active=True,
        is_super_admin=True,
    )
    db.add(u)
    db.commit()
    db.close()
    return {"cpf": "41637531842", "password": "SenhaForte1234"}


def _login(creds):
    return client.post(
        "/auth/login", json={"cpf": creds["cpf"], "password": creds["password"]}
    )


def _access_token(creds):
    return _login(creds).json()["access_token"]


def _enroll_mfa(creds):
    """Faz setup + enable e retorna (secret, access_token usado no enrolamento).

    O access token continua valido apos ativar o MFA (MFA so afeta logins
    futuros), entao pode ser reutilizado nos testes.
    """
    token = _access_token(creds)
    h = {"Authorization": f"Bearer {token}"}
    secret = client.post("/auth/mfa/setup", headers=h).json()["secret"]
    code = pyotp.TOTP(secret).now()
    resp = client.post("/auth/mfa/enable", json={"code": code}, headers=h)
    assert resp.status_code == 200
    return secret, token


def test_setup_returns_secret_and_uri(admin):
    h = {"Authorization": f"Bearer {_access_token(admin)}"}
    resp = client.post("/auth/mfa/setup", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["secret"]) >= 16
    assert data["otpauth_uri"].startswith("otpauth://totp/")


def test_enable_with_wrong_code_fails(admin):
    h = {"Authorization": f"Bearer {_access_token(admin)}"}
    client.post("/auth/mfa/setup", headers=h)
    resp = client.post("/auth/mfa/enable", json={"code": "000000"}, headers=h)
    assert resp.status_code == 400


def test_enable_sets_mfa_flag(admin):
    _secret, token = _enroll_mfa(admin)
    h = {"Authorization": f"Bearer {token}"}
    me = client.get("/auth/me", headers=h)
    assert me.json()["mfa_enabled"] is True


def test_login_with_mfa_requires_second_factor(admin):
    _enroll_mfa(admin)
    resp = _login(admin)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("mfa_required") is True
    assert "mfa_token" in data
    assert "access_token" not in data


def test_mfa_verify_with_valid_code_issues_tokens(admin):
    secret, _ = _enroll_mfa(admin)
    mfa_token = _login(admin).json()["mfa_token"]
    code = pyotp.TOTP(secret).now()
    resp = client.post("/auth/mfa/verify", json={"mfa_token": mfa_token, "code": code})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_mfa_verify_with_invalid_code_fails(admin):
    _enroll_mfa(admin)
    mfa_token = _login(admin).json()["mfa_token"]
    resp = client.post(
        "/auth/mfa/verify", json={"mfa_token": mfa_token, "code": "000000"}
    )
    assert resp.status_code == 401


def test_disable_mfa(admin):
    secret, token = _enroll_mfa(admin)
    h = {"Authorization": f"Bearer {token}"}
    code = pyotp.TOTP(secret).now()
    resp = client.post("/auth/mfa/disable", json={"code": code}, headers=h)
    assert resp.status_code == 200
    # Login volta a ser direto (sem 2o fator).
    login = _login(admin).json()
    assert "access_token" in login
    assert "mfa_required" not in login
