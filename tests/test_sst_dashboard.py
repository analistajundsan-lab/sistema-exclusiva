import hashlib
import re
from datetime import datetime, timedelta

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
from routes_incidents import brt_day_utc_window, today_brt

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


def _utc_midday_today_brt() -> datetime:
    """Meio-dia BRT de hoje como UTC naive — utcnow() entre 00:00 e 03:00 BRT
    cai no dia BRT seguinte e o dashboard contaria 0 checklists 'hoje'."""
    start_utc, _ = brt_day_utc_window(today_brt())
    return start_utc + timedelta(hours=12)


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
    v = SafetyVehicle(
        prefix="9001", unit="Caieiras", active=True, public_token="tok9001"
    )
    db.add(v)
    db.flush()
    db.add(
        DriverChecklistSubmission(
            vehicle_id=v.id,
            template_id=1,
            driver_name="Motorista A",
            driver_registration="M-001",
            overall_status=SafetySubmissionStatus.OK,
            submitted_at=_utc_midday_today_brt(),
            declaration_accepted=True,
        )
    )
    db.add(
        Sinistro(
            unit="Caieiras",
            tipo_sinistro="Colisao",
            data_ocorrencia=today_brt(),
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


def test_dashboard_counts_late_night_checklist_as_today(admin_headers):
    """Checklist das 23:00 BRT ja tem data UTC do dia seguinte, mas continua
    contando no 'hoje' do dashboard (janela BRT, nao func.date UTC)."""
    db = TestingSessionLocal()
    v = SafetyVehicle(
        prefix="9002", unit="Caieiras", active=True, public_token="tok9002"
    )
    db.add(v)
    db.flush()
    _, end_utc = brt_day_utc_window(today_brt())
    db.add(
        DriverChecklistSubmission(
            vehicle_id=v.id,
            template_id=1,
            driver_name="Motorista Noite",
            driver_registration="M-002",
            overall_status=SafetySubmissionStatus.OK,
            submitted_at=end_utc - timedelta(hours=1),  # 23:00 BRT de hoje
            declaration_accepted=True,
        )
    )
    db.commit()
    db.close()

    d = client.get("/sst/dashboard", headers=admin_headers).json()
    assert d["checklists_hoje"] == 1
    assert d["checklists_pendentes"] == 0

    v2 = client.get("/sst/dashboard-v2", headers=admin_headers).json()
    assert v2["summary"]["checklist_compliance_pct"] == 100
    serie = {p["dia"]: p["total"] for p in v2["trends"]["checklists_por_dia"]}
    assert serie[today_brt().isoformat()] == 1


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


def test_dashboard_v2_fase2_fields(admin_headers):
    # cria sinistro com campos analiticos + plano de acao vencido
    payload = {
        "unit": "Caieiras",
        "tipo_sinistro": "Colisao",
        "data_ocorrencia": today_brt().isoformat(),
        "hora_ocorrencia": "08:00",
        "gravidade": "4",
        "probabilidade": "3",
        "fator_contribuinte": "Distracao",
        "responsabilidade": "propria",
        "custo_final": 1500.50,
        "houve_vitima": True,
        "responsavel_acao": "Tecnico SST",
        "prazo_acao": "2020-01-01",
        "status_acao": "pendente",
    }
    r = client.post("/sst/sinistros", json=payload, headers=admin_headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["gravidade"] == "4"
    assert body["custo_final"] == 1500.50

    d = client.get("/sst/dashboard-v2", headers=admin_headers).json()
    assert d["summary"]["custo_total"] == 1500.5
    assert d["summary"]["com_vitima"] == 1
    assert d["summary"]["acoes_vencidas"] >= 1
    assert any(c["gravidade"] == "4" for c in d["breakdowns"]["por_gravidade"])
    assert any(
        f["fator"] == "Distracao" for f in d["breakdowns"]["por_fator_contribuinte"]
    )
    cell = next(
        c for c in d["risk_matrix"] if c["probabilidade"] == 3 and c["gravidade"] == 4
    )
    assert cell["total"] == 1 and cell["indice"] == 12
    assert len(d["actions"]) >= 1 and d["actions"][0]["dias_atraso"] > 0


def test_liberacao_item_a_item(admin_headers):
    payload = {
        "unit": "Caieiras",
        "condutor_nome": "Motorista X",
        "motivo_avaliacao": "Inicio de jornada",
        "respostas": [
            {
                "item": "Dormiu bem?",
                "categoria": "fadiga",
                "impeditivo": True,
                "resposta": "nao",
            },
        ],
        "score_aptidao": 65,
        "categoria_bloqueio": "fadiga",
        "alerta_fadiga": "menos_4h",
        "resultado": "nao_liberado",
    }
    r = client.post("/sst/liberacoes", json=payload, headers=admin_headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["score_aptidao"] == 65
    assert body["respostas"][0]["categoria"] == "fadiga"

    d = client.get("/sst/dashboard-v2", headers=admin_headers).json()
    assert any(
        c["categoria"] == "fadiga" for c in d["breakdowns"]["bloqueio_por_categoria"]
    )
    assert any(a["alerta"] == "menos_4h" for a in d["breakdowns"]["alerta_fadiga"])


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
