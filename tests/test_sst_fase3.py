import hashlib
import re
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from models import (
    Base,
    LiberacaoCondutor,
    LiberacaoStatus,
    SafetyVehicle,
    Sinistro,
    SinistroStatus,
    User,
    UserRole,
    get_db,
)
from auth import hash_password

TEST_DB = "sqlite:///./test_sst_fase3.db"
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
            email="adminsst3@test.com",
            name="Admin SST F3",
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


def _sinistro(**kw):
    base = dict(
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
    base.update(kw)
    return Sinistro(**base)


def test_alertas_reincidencia(admin_headers):
    db = TestingSessionLocal()
    # 3 sinistros do mesmo condutor "Motorista A" / prefixo "9001"
    db.add(_sinistro(data_ocorrencia=date.today()))
    db.add(_sinistro(data_ocorrencia=date.today() - timedelta(days=5)))
    db.add(_sinistro(data_ocorrencia=date.today() - timedelta(days=10)))
    # 1 sinistro de outro condutor / prefixo (nao deve entrar)
    db.add(
        _sinistro(
            condutor_nome="Motorista B",
            prefixo="9002",
            data_ocorrencia=date.today() - timedelta(days=2),
        )
    )
    db.commit()
    db.close()

    r = client.get("/sst/alertas?dias=90", headers=admin_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["window_days"] == 90

    cond_a = next((c for c in d["condutores"] if c["condutor"] == "Motorista A"), None)
    assert cond_a is not None
    assert cond_a["total"] == 3
    assert cond_a["nivel"] == "alto"

    veic = next((v for v in d["veiculos"] if v["prefixo"] == "9001"), None)
    assert veic is not None
    assert veic["total"] == 3
    assert veic["nivel"] == "alto"

    # quem tem apenas 1 ocorrencia NAO aparece
    assert all(c["condutor"] != "Motorista B" for c in d["condutores"])
    assert all(v["prefixo"] != "9002" for v in d["veiculos"])

    assert d["total_alertas"] > 0


def test_score_preditivo(admin_headers):
    db = TestingSessionLocal()
    # condutor de alto risco: gravidade alta + vitima + afastamento, multiplos sinistros
    db.add(
        _sinistro(
            condutor_nome="Motorista Risco",
            prefixo="7001",
            unit="Caieiras",
            gravidade="5",
            houve_vitima=True,
            houve_afastamento=True,
            data_ocorrencia=date.today(),
        )
    )
    db.add(
        _sinistro(
            condutor_nome="Motorista Risco",
            prefixo="7001",
            unit="Caieiras",
            gravidade="4",
            houve_vitima=True,
            data_ocorrencia=date.today() - timedelta(days=15),
        )
    )
    # condutor de baixo risco
    db.add(
        _sinistro(
            condutor_nome="Motorista Calmo",
            prefixo="7002",
            unit="Caieiras",
            gravidade="1",
            data_ocorrencia=date.today() - timedelta(days=120),
        )
    )
    db.commit()
    db.close()

    r = client.get("/sst/score-preditivo?dias=180", headers=admin_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["window_days"] == 180

    condutores = d["condutores"]
    assert len(condutores) >= 1
    risco = next((c for c in condutores if c["condutor"] == "Motorista Risco"), None)
    assert risco is not None
    assert risco["score"] > 0
    assert risco["nivel"] in ("critico", "alto", "medio", "baixo")
    assert risco["sinistros"] == 2
    assert risco["com_vitima"] == 2
    assert risco["com_afastamento"] == 1

    # ordenado por score desc (maior primeiro)
    scores = [c["score"] for c in condutores]
    assert scores == sorted(scores, reverse=True)
    # o condutor de risco deve estar a frente do calmo
    assert condutores[0]["condutor"] == "Motorista Risco"

    # presenca em veiculos e unidades
    assert any(v["prefixo"] == "7001" for v in d["veiculos"])
    assert any(u["unidade"] == "Caieiras" for u in d["unidades"])


def test_comparativo(admin_headers):
    db = TestingSessionLocal()
    # Unidade Caieiras: 3 sinistros + 2 veiculos ativos
    db.add(SafetyVehicle(prefix="C-1", unit="Caieiras", active=True, public_token="tokC1"))
    db.add(SafetyVehicle(prefix="C-2", unit="Caieiras", active=True, public_token="tokC2"))
    db.add(_sinistro(unit="Caieiras", prefixo="C-1", data_ocorrencia=date.today()))
    db.add(
        _sinistro(
            unit="Caieiras", prefixo="C-1", data_ocorrencia=date.today() - timedelta(days=20)
        )
    )
    db.add(
        _sinistro(
            unit="Caieiras", prefixo="C-2", data_ocorrencia=date.today() - timedelta(days=40)
        )
    )
    # Unidade Franco da Rocha: 1 sinistro + 1 veiculo ativo
    db.add(
        SafetyVehicle(prefix="F-1", unit="Franco da Rocha", active=True, public_token="tokF1")
    )
    db.add(
        _sinistro(
            unit="Franco da Rocha",
            condutor_nome="Motorista F",
            prefixo="F-1",
            cidade="Franco da Rocha",
            data_ocorrencia=date.today(),
        )
    )
    db.commit()
    db.close()

    r = client.get("/sst/comparativo?meses=6", headers=admin_headers)
    assert r.status_code == 200, r.text
    d = r.json()

    assert len(d["meses"]) == 6

    unidades_nomes = {u["unidade"] for u in d["unidades"]}
    assert "Caieiras" in unidades_nomes
    assert "Franco da Rocha" in unidades_nomes

    ranking = d["ranking"]
    totais = [r_["total"] for r_ in ranking]
    assert totais == sorted(totais, reverse=True)
    # Caieiras (3) deve vir antes de Franco da Rocha (1)
    assert ranking[0]["unidade"] == "Caieiras"

    cai = next(r_ for r_ in ranking if r_["unidade"] == "Caieiras")
    assert cai["total"] == 3
    assert cai["frota_ativa"] == 2
    # taxa_por_veiculo = total / frota_ativa = 3 / 2 = 1.5
    assert cai["taxa_por_veiculo"] == round(3 / 2, 2)

    fr = next(r_ for r_ in ranking if r_["unidade"] == "Franco da Rocha")
    assert fr["frota_ativa"] == 1
    assert fr["taxa_por_veiculo"] == round(1 / 1, 2)


def test_export_xlsx(admin_headers):
    db = TestingSessionLocal()
    db.add(_sinistro())
    db.commit()
    db.close()

    r = client.get("/sst/export.xlsx", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert "spreadsheetml" in r.headers["content-type"]
    assert len(r.content) > 0


def test_export_pdf(admin_headers):
    db = TestingSessionLocal()
    db.add(_sinistro())
    db.commit()
    db.close()

    r = client.get("/sst/export.pdf", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert len(r.content) > 0
    assert r.content[:4] == b"%PDF"


def test_fase3_requires_sst_role():
    db = TestingSessionLocal()
    db.add(
        User(
            cpf_hash=_hash_cpf("999.888.777-66"),
            email="plant3@test.com",
            name="Plantonista F3",
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
    headers = {"Authorization": f"Bearer {tok}"}

    for path in ("/sst/alertas", "/sst/score-preditivo", "/sst/comparativo"):
        r = client.get(path, headers=headers)
        assert r.status_code == 403, f"{path} -> {r.status_code}: {r.text}"
