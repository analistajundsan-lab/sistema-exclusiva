import hashlib
import re
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from models import (
    Base,
    DriverChecklistSubmission,
    SafetySubmissionStatus,
    SafetyVehicle,
    Sinistro,
    SinistroStatus,
    User,
    UserRole,
    get_db,
)
from auth import hash_password

TEST_DB = "sqlite:///./test_sst_dash.db"
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
    return hashlib.sha256(re.sub(r"\D", "", cpf).encode()).hexdigest()[:16]


@pytest.fixture
def admin_headers():
    db = TestingSessionLocal()
    db.add(
        User(
            cpf_hash=_hash_cpf("111.222.333-44"),
            email="adminsst@test.com",
            name="Admin SST",
            password_hash=hash_password("SenhaForte123!"),
            role=UserRole.ADMIN,
            is_active=True,
        )
    )
    db.commit()
    db.close()
    r = client.post(
        "/auth/login", json={"cpf": "111.222.333-44", "password": "SenhaForte123!"}
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _seed(db):
    v = SafetyVehicle(prefix="9001", unit="Caieiras", active=True, public_token="tok9001")
    db.add(v)
    db.flush()
    db.add(
        DriverChecklistSubmission(
            vehicle_id=v.id,
            template_id=1,
            driver_name="Motorista A",
            driver_registration="M-001",
            overall_status=SafetySubmissionStatus.OK,
            submitted_at=datetime.utcnow(),
            declaration_accepted=True,
        )
    )
    db.add(
        Sinistro(
            unit="Caieiras",
            tipo_sinistro="Colisao",
            data_ocorrencia=date.today(),
            hora_ocorrencia="14:30",
            condutor_nome="Motorista A",
            prefixo="9001",
            cidade="Caieiras",
            status=SinistroStatus.ABERTO,
            created_by=1,
        )
    )
    db.commit()


def test_dashboard_quick_wins(admin_headers):
    db = TestingSessionLocal()
    _seed(db)
    db.close()
    r = client.get("/sst/dashboard", headers=admin_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["total_veiculos"] == 1
    assert d["total_motoristas"] == 1  # antes retornava 0
    assert d["checklists_hoje"] == 1
    assert d["checklists_pendentes"] == 0  # 1 veiculo, 1 com checklist hoje


def test_dashboard_v2_structure(admin_headers):
    db = TestingSessionLocal()
    _seed(db)
    db.close()
    r = client.get("/sst/dashboard-v2", headers=admin_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["summary"]["sinistros_periodo"] == 1
    assert d["summary"]["checklist_compliance_pct"] == 100
    assert len(d["trends"]["sinistros_por_mes"]) == 12
    assert any(b["tipo"] == "Colisao" for b in d["breakdowns"]["por_tipo"])
    assert any(t["turno"] == "Tarde" for t in d["breakdowns"]["por_turno"])
    assert any(c["nome"] == "Motorista A" for c in d["rankings"]["condutores"])


def test_dashboard_v2_requires_sst_role():
    db = TestingSessionLocal()
    db.add(
        User(
            cpf_hash=_hash_cpf("999.888.777-66"),
            email="plant@test.com",
            name="Plantonista",
            password_hash=hash_password("SenhaForte123!"),
            role=UserRole.PLANTONISTA,
            unit="Caieiras",
            is_active=True,
        )
    )
    db.commit()
    db.close()
    tok = client.post(
        "/auth/login", json={"cpf": "999.888.777-66", "password": "SenhaForte123!"}
    ).json()["access_token"]
    r = client.get("/sst/dashboard-v2", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403
