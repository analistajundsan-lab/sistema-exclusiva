"""Testes de autorizacao por unidade (A13).

Garante que um usuario com escopo de unidade nao enxerga nem acessa dados de
outra unidade, e que o backend (nao o frontend) impoe a restricao.
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

TEST_DB = "sqlite:///./test_authz.db"
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


def hash_cpf(cpf: str) -> str:
    cpf_clean = re.sub(r"\D", "", cpf)
    return hashlib.sha256(cpf_clean.encode()).hexdigest()[:16]


def _make_user(cpf: str, unit: str, role=UserRole.OPERATOR, is_super_admin=False):
    db = TestingSessionLocal()
    user = User(
        cpf_hash=hash_cpf(cpf),
        email=f"{cpf}@test.com",
        name=f"User {cpf}",
        password_hash=hash_password("password123"),
        role=role,
        unit=unit,
        is_active=True,
        is_super_admin=is_super_admin,
    )
    db.add(user)
    db.commit()
    db.close()


def _token(cpf: str) -> str:
    return client.post(
        "/auth/login", json={"cpf": cpf, "password": "password123"}
    ).json()["access_token"]


def test_user_cannot_list_other_units_incidents():
    _make_user("11111111111", "CAIEIRAS")
    _make_user("22222222222", "JUNDIAI")
    a = _token("11111111111")
    b = _token("22222222222")

    created = client.post(
        "/incidents/",
        json={"prefix_code": "100", "incident_type": "Falha", "unit": "CAIEIRAS"},
        headers={"Authorization": f"Bearer {a}"},
    )
    assert created.status_code == 201

    # A (CAIEIRAS) ve sua ocorrencia.
    a_list = client.get("/incidents/", headers={"Authorization": f"Bearer {a}"})
    assert a_list.status_code == 200
    assert len(a_list.json()) == 1

    # B (JUNDIAI) NAO ve a ocorrencia de CAIEIRAS.
    b_list = client.get("/incidents/", headers={"Authorization": f"Bearer {b}"})
    assert b_list.status_code == 200
    assert b_list.json() == []


def test_user_cannot_get_other_unit_incident_by_id():
    _make_user("11111111111", "CAIEIRAS")
    _make_user("22222222222", "JUNDIAI")
    a = _token("11111111111")
    b = _token("22222222222")

    inc_id = client.post(
        "/incidents/",
        json={"prefix_code": "100", "incident_type": "Falha", "unit": "CAIEIRAS"},
        headers={"Authorization": f"Bearer {a}"},
    ).json()["id"]

    denied = client.get(
        f"/incidents/{inc_id}", headers={"Authorization": f"Bearer {b}"}
    )
    assert denied.status_code == 403


def test_user_cannot_create_incident_for_other_unit():
    _make_user("22222222222", "JUNDIAI")
    b = _token("22222222222")
    resp = client.post(
        "/incidents/",
        json={"prefix_code": "100", "incident_type": "Falha", "unit": "CAIEIRAS"},
        headers={"Authorization": f"Bearer {b}"},
    )
    assert resp.status_code == 403


def test_user_without_unit_cannot_access_or_create_unit_scoped_incidents():
    _make_user("11111111111", "CAIEIRAS")
    _make_user("33333333333", None)
    a = _token("11111111111")
    no_unit = _token("33333333333")

    created = client.post(
        "/incidents/",
        json={"prefix_code": "100", "incident_type": "Falha", "unit": "CAIEIRAS"},
        headers={"Authorization": f"Bearer {a}"},
    )
    assert created.status_code == 201

    scoped_list = client.get("/incidents/", headers={"Authorization": f"Bearer {no_unit}"})
    assert scoped_list.status_code == 200
    assert scoped_list.json() == []

    denied = client.post(
        "/incidents/",
        json={"prefix_code": "200", "incident_type": "Falha", "unit": "CAIEIRAS"},
        headers={"Authorization": f"Bearer {no_unit}"},
    )
    assert denied.status_code == 403


def test_super_admin_sees_all_units():
    _make_user("11111111111", "CAIEIRAS")
    _make_user("99999999999", "JUNDIAI", role=UserRole.ADMIN, is_super_admin=True)
    a = _token("11111111111")
    admin = _token("99999999999")

    client.post(
        "/incidents/",
        json={"prefix_code": "100", "incident_type": "Falha", "unit": "CAIEIRAS"},
        headers={"Authorization": f"Bearer {a}"},
    )

    admin_list = client.get("/incidents/", headers={"Authorization": f"Bearer {admin}"})
    assert admin_list.status_code == 200
    assert len(admin_list.json()) == 1
