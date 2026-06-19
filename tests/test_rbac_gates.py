"""Testes de regressao dos gates de autorizacao por cargo (RBAC).

Garante, no backend (nao no frontend), que:
- Auditoria (/audit/logs) e restrita a Admin.
- Safety operacional (/safety/vehicles) e de Analista/TST/Engenheiro/Admin —
  Trafego (plantonista) e barrado.
- Visao consultiva SST (/safety/sst-view) e exclusiva de TST/Engenheiro/Admin —
  Analista e barrado.
- super_admin (has_full_access) nunca e barrado.
"""

import hashlib
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from models import Base, User, UserRole, get_db
from auth import hash_password

TEST_DB = "sqlite:///./test_rbac_gates.db"
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
    yield
    Base.metadata.drop_all(bind=engine)


def _hash_cpf(cpf: str) -> str:
    cpf_clean = re.sub(r"\D", "", cpf)
    return hashlib.sha256(cpf_clean.encode()).hexdigest()[:16]


def _make_user(cpf: str, role: UserRole, unit="Caieiras", is_super_admin=False):
    db = TestingSessionLocal()
    db.add(
        User(
            cpf_hash=_hash_cpf(cpf),
            email=f"{cpf}@test.com",
            name=f"User {cpf}",
            password_hash=hash_password("password123"),
            role=role,
            unit=unit,
            is_active=True,
            is_super_admin=is_super_admin,
        )
    )
    db.commit()
    db.close()


def _token(cpf: str) -> str:
    return client.post(
        "/auth/login", json={"cpf": cpf, "password": "password123"}
    ).json()["access_token"]


def _get(path: str, cpf: str):
    return client.get(path, headers={"Authorization": f"Bearer {_token(cpf)}"})


# Cargos usados nos cenarios (CPF -> role).
ADMIN = "10000000001"
ANALISTA = "10000000002"
PLANTONISTA = "10000000003"
TECNICO = "10000000004"
ENGENHEIRO = "10000000005"
SUPER = "10000000006"


def _seed_all():
    _make_user(ADMIN, UserRole.ADMIN, unit=None)
    _make_user(ANALISTA, UserRole.ANALISTA)
    _make_user(PLANTONISTA, UserRole.PLANTONISTA)
    _make_user(TECNICO, UserRole.TECNICO_SEGURANCA)
    _make_user(ENGENHEIRO, UserRole.ENGENHEIRO_SEGURANCA)
    # super_admin com cargo nao-admin: deve passar por has_full_access.
    _make_user(SUPER, UserRole.PLANTONISTA, is_super_admin=True)


# ── Auditoria: somente Admin ──────────────────────────────────────────────────


def test_audit_logs_admin_allowed():
    _seed_all()
    assert _get("/audit/logs", ADMIN).status_code == 200


def test_audit_logs_super_admin_allowed():
    _seed_all()
    assert _get("/audit/logs", SUPER).status_code == 200


@pytest.mark.parametrize("cpf", [ANALISTA, PLANTONISTA, TECNICO, ENGENHEIRO])
def test_audit_logs_non_admin_forbidden(cpf):
    _seed_all()
    assert _get("/audit/logs", cpf).status_code == 403


# ── Safety operacional (/safety/vehicles): Analista/TST/Eng/Admin ─────────────


@pytest.mark.parametrize("cpf", [ADMIN, ANALISTA, TECNICO, ENGENHEIRO, SUPER])
def test_safety_vehicles_allowed_roles(cpf):
    _seed_all()
    assert _get("/safety/vehicles", cpf).status_code == 200


def test_safety_vehicles_trafego_forbidden():
    _seed_all()
    # Plantonista (Trafego) nao acessa o modulo de seguranca.
    assert _get("/safety/vehicles", PLANTONISTA).status_code == 403


# ── Visao consultiva SST (/safety/sst-view): TST/Eng/Admin ────────────────────


@pytest.mark.parametrize("cpf", [ADMIN, TECNICO, ENGENHEIRO, SUPER])
def test_sst_view_allowed_roles(cpf):
    _seed_all()
    assert _get("/safety/sst-view", cpf).status_code == 200


@pytest.mark.parametrize("cpf", [ANALISTA, PLANTONISTA])
def test_sst_view_forbidden_roles(cpf):
    _seed_all()
    # Analista tem a tela Check-list operacional, mas NAO a visao consultiva SST.
    assert _get("/safety/sst-view", cpf).status_code == 403
