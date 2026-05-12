from datetime import date
from io import BytesIO
import hashlib
import re

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from auth import hash_password
from main import app
from models import Base, ScheduleLine, User, UserRole, get_db


TEST_DB = "sqlite:///./test_schedule.db"
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


def create_token(cpf: str, role: UserRole) -> str:
    db = TestingSessionLocal()
    user = User(
        cpf_hash=hash_cpf(cpf),
        email=f"{role.value}@test.com",
        name=f"Test {role.value}",
        password_hash=hash_password("password123"),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.close()

    response = client.post("/auth/login", json={"cpf": cpf, "password": "password123"})
    return response.json()["access_token"]


@pytest.fixture
def admin_token():
    return create_token("111.222.333-44", UserRole.ADMIN)


@pytest.fixture
def operator_token():
    return create_token("123.456.789-00", UserRole.OPERATOR)


def build_schedule_file(line_code: str = "7368") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "caieiras"
    ws.cell(row=4, column=1, value="1580")
    ws.cell(row=4, column=3, value="E N DA SILVA")
    ws.cell(row=4, column=7, value="03:50 - 04:45")
    ws.cell(row=5, column=7, value="E/ M LIVRE - SP-02")
    ws.cell(row=6, column=7, value=f"L - {line_code}")
    ws.cell(row=7, column=7, value="JD. PINHEIROS / VERA TERESA")
    stream = BytesIO()
    wb.save(stream)
    return stream.getvalue()


def test_admin_imports_schedule(admin_token):
    response = client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 201
    assert response.json()["imported"] == 1

    list_response = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert list_response.status_code == 200
    data = list_response.json()
    assert len(data) == 1
    assert data[0]["unit"] == "Caieiras"
    assert data[0]["line_code"] == "7368"


def test_admin_previews_schedule_without_saving(admin_token):
    response = client.post(
        "/schedule/import/preview",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["units"] == [{"unit": "Caieiras", "total": 1}]
    assert data["clients"][0]["client_name"] == "M LIVRE - SP-02"

    lines = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    assert lines == []


def test_operator_cannot_preview_schedule(operator_token):
    response = client.post(
        "/schedule/import/preview",
        headers={"Authorization": f"Bearer {operator_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 403


def test_operator_cannot_import_schedule(operator_token):
    response = client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {operator_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 403


def test_import_rejects_macro_enabled_file(admin_token):
    response = client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsm", build_schedule_file(), "application/vnd.ms-excel.sheet.macroEnabled.12")},
    )

    assert response.status_code == 422
    assert "xlsx" in response.json()["detail"]


def test_replace_only_affects_selected_date(admin_token):
    db = TestingSessionLocal()
    db.add(
        ScheduleLine(
            schedule_date=date(2026, 4, 12),
            unit="Caieiras",
            prefix_code="9999",
            driver_name="MOTORISTA ANTIGO",
            line_code="1111",
            direction="ENTRADA",
            client_name="M LIVRE - SP-02",
            start_time="03:00",
            end_time="04:00",
            created_by=1,
        )
    )
    db.commit()
    db.close()

    response = client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file("7467"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 201

    old_day = client.get(
        "/schedule/lines?schedule_date=2026-04-12",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    new_day = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()

    assert len(old_day) == 1
    assert old_day[0]["line_code"] == "1111"
    assert len(new_day) == 1
    assert new_day[0]["line_code"] == "7467"


def test_confirm_schedule_line_moves_to_confirmed_history(admin_token, operator_token):
    import_response = client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert import_response.status_code == 201

    pending = client.get(
        "/schedule/lines?schedule_date=2026-04-13&status=pendente",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()
    line_id = pending[0]["id"]

    confirm_response = client.post(
        f"/schedule/lines/{line_id}/confirm",
        headers={"Authorization": f"Bearer {operator_token}"},
    )
    assert confirm_response.status_code == 200
    assert confirm_response.json()["status"] == "confirmada"
    assert confirm_response.json()["confirmed_by"] is not None
    assert confirm_response.json()["confirmed_at"] is not None

    active_after = client.get(
        "/schedule/lines?schedule_date=2026-04-13&status=pendente",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()
    history_after = client.get(
        "/schedule/lines?schedule_date=2026-04-13&status=confirmada",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()

    assert active_after == []
    assert len(history_after) == 1
    assert history_after[0]["id"] == line_id


def test_confirm_schedule_line_is_idempotent(admin_token, operator_token):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    line_id = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()[0]["id"]

    first = client.post(
        f"/schedule/lines/{line_id}/confirm",
        headers={"Authorization": f"Bearer {operator_token}"},
    )
    second = client.post(
        f"/schedule/lines/{line_id}/confirm",
        headers={"Authorization": f"Bearer {operator_token}"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["status"] == "confirmada"


def test_supervisor_can_cancel_line_and_operator_cannot(admin_token, operator_token):
    supervisor_token = create_token("222.333.444-55", UserRole.SUPERVISOR)
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    line_id = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()[0]["id"]

    denied = client.post(
        f"/schedule/lines/{line_id}/cancel",
        headers={"Authorization": f"Bearer {operator_token}"},
        json={"reason": "Teste"},
    )
    assert denied.status_code == 403

    cancelled = client.post(
        f"/schedule/lines/{line_id}/cancel",
        headers={"Authorization": f"Bearer {supervisor_token}"},
        json={"reason": "Cliente cancelou"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelada"
    assert "Cliente cancelou" in cancelled.json()["notes"]


def test_admin_can_undo_confirmation(admin_token, operator_token):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    line_id = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()[0]["id"]
    client.post(f"/schedule/lines/{line_id}/confirm", headers={"Authorization": f"Bearer {operator_token}"})

    reopened = client.post(
        f"/schedule/lines/{line_id}/undo-confirm",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Confirmado errado"},
    )
    assert reopened.status_code == 200
    data = reopened.json()
    assert data["status"] == "pendente"
    assert data["confirmed_by"] is None
    assert data["confirmed_at"] is None


def test_schedule_whatsapp_text_by_unit(admin_token):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    response = client.get(
        "/schedule/whatsapp?schedule_date=2026-04-13&unit=Caieiras",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["unit"] == "Caieiras"
    assert data["total"] == 1
    assert "ALTERACOES REALIZADAS NA ESCALA" in data["text"]
    assert "Linha 7368" in data["text"]
    assert "Prefixo 1580" in data["text"]


def test_audit_logs_are_listed(admin_token):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    response = client.get(
        "/audit/logs?resource=schedule&action=IMPORT",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["resource"] == "schedule"
    assert data[0]["action"] == "IMPORT"


def test_swap_can_be_created_from_confirmed_schedule_line(admin_token, operator_token):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    line_id = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()[0]["id"]
    client.post(f"/schedule/lines/{line_id}/confirm", headers={"Authorization": f"Bearer {operator_token}"})

    response = client.post(
        "/swaps/",
        headers={"Authorization": f"Bearer {operator_token}"},
        json={
            "schedule_line_id": line_id,
            "vehicle_out": "1580",
            "vehicle_in": "1590",
            "reason": "Adequacao operacional",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["schedule_line_id"] == line_id
    assert data["unit"] == "Caieiras"
    assert "Carro substituido: 1580" in data["whatsapp_text"]
    assert "Carro substituto: 1590" in data["whatsapp_text"]


def test_swap_requires_confirmed_schedule_line(admin_token, operator_token):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("escala.xlsx", build_schedule_file(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    line_id = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()[0]["id"]

    response = client.post(
        "/swaps/",
        headers={"Authorization": f"Bearer {operator_token}"},
        json={"schedule_line_id": line_id, "vehicle_out": "1580", "vehicle_in": "1590"},
    )

    assert response.status_code == 422
