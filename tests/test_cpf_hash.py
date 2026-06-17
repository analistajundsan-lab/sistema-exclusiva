"""Testes do hash de CPF com HMAC + pepper e rehash-on-login (A03)."""

import hashlib
import hmac
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from models import Base, User, UserRole, get_db
from auth import hash_password
from config import settings

TEST_DB = "sqlite:///./test_cpf.db"
engine = create_engine(TEST_DB, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

PEPPER = "test-pepper-abc123"


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
    original = settings.CPF_HASH_PEPPER
    settings.CPF_HASH_PEPPER = PEPPER
    yield
    settings.CPF_HASH_PEPPER = original
    Base.metadata.drop_all(bind=engine)


def _legacy_hash(cpf: str) -> str:
    d = re.sub(r"\D", "", cpf)
    return hashlib.sha256(d.encode()).hexdigest()[:16]


def _secure_hash(cpf: str) -> str:
    d = re.sub(r"\D", "", cpf)
    return hmac.new(PEPPER.encode(), d.encode(), hashlib.sha256).hexdigest()


def test_new_user_uses_hmac_hash():
    r = client.post(
        "/auth/register",
        json={
            "cpf": "123.456.789-00",
            "email": "a@test.com",
            "name": "User A",
            "password": "SenhaForte1234!",
            "role": "operator",
        },
    )
    assert r.status_code == 200
    db = TestingSessionLocal()
    u = db.query(User).filter(User.id == r.json()["id"]).first()
    assert u.cpf_hash == _secure_hash("12345678900")
    assert len(u.cpf_hash) == 64  # HMAC-SHA256 completo, nao truncado
    db.close()


def test_legacy_user_can_login_and_is_rehashed():
    db = TestingSessionLocal()
    u = User(
        cpf_hash=_legacy_hash("98765432100"),
        email="leg@test.com",
        name="Legacy",
        password_hash=hash_password("SenhaForte1234!"),
        role=UserRole.OPERATOR,
        is_active=True,
    )
    db.add(u)
    db.commit()
    uid = u.id
    db.close()

    # Login com pepper ativo: encontra via fallback legado e funciona.
    r = client.post(
        "/auth/login",
        json={"cpf": "987.654.321-00", "password": "SenhaForte1234!"},
    )
    assert r.status_code == 200

    # Apos o login, o hash foi migrado para o formato seguro.
    db = TestingSessionLocal()
    u = db.query(User).filter(User.id == uid).first()
    assert u.cpf_hash == _secure_hash("98765432100")
    db.close()


def test_duplicate_cpf_detected_across_hash_formats():
    # Usuario legado existente; registro com mesmo CPF deve ser bloqueado.
    db = TestingSessionLocal()
    db.add(
        User(
            cpf_hash=_legacy_hash("11122233344"),
            email="dup@test.com",
            name="Dup",
            password_hash=hash_password("SenhaForte1234!"),
            role=UserRole.OPERATOR,
            is_active=True,
        )
    )
    db.commit()
    db.close()

    r = client.post(
        "/auth/register",
        json={
            "cpf": "111.222.333-44",
            "email": "dup2@test.com",
            "name": "Dup Two",
            "password": "SenhaForte1234!",
            "role": "operator",
        },
    )
    assert r.status_code == 400
