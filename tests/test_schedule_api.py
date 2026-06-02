from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from io import BytesIO
import hashlib
import re

import pytest
import openpyxl
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from auth import hash_password
from main import app
from models import Base, ScheduleImport, ScheduleLine, User, UserRole, get_db

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


def db_count(model) -> int:
    db = TestingSessionLocal()
    try:
        return db.query(model).count()
    finally:
        db.close()


def build_schedule_file(
    line_code: str = "7368",
    start_time: str = "03:50",
    end_time: str = "04:45",
) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "caieiras"
    ws.cell(row=4, column=1, value="1580")
    ws.cell(row=4, column=3, value="E N DA SILVA")
    ws.cell(row=4, column=7, value=f"{start_time} - {end_time}")
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
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
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


def test_dashboard_turns_groups_by_unit_turn_and_direction(admin_token):
    import_response = client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file("7368"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert import_response.status_code == 201

    response = client.get(
        "/schedule/dashboard-turns?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["schedule_date"] == "2026-04-13"
    assert data["units"][0]["unit"] == "Caieiras"
    assert data["units"][0]["total"]["entrada"] == 1
    assert data["units"][0]["total"]["saida"] == 0

    t1 = next(turn for turn in data["units"][0]["turns"] if turn["key"] == "T1")
    assert t1["entrada"] == 1
    assert t1["saida"] == 0
    assert t1["unique_lines"] == 1
    assert data["client_index"][0]["client"] == "SP02"


def test_admin_previews_schedule_without_saving(admin_token):
    response = client.post(
        "/schedule/import/preview",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
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
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 403


def test_operator_cannot_import_schedule(operator_token):
    response = client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {operator_token}"},
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 403


def test_import_rejects_macro_enabled_file(admin_token):
    response = client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala.xlsm",
                build_schedule_file(),
                "application/vnd.ms-excel.sheet.macroEnabled.12",
            )
        },
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
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file("7467"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
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


def test_same_file_and_effective_date_replaces_previous_import(admin_token):
    first = client.post(
        "/schedule/import?schedule_date=2026-05-01&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala_01-05.xlsx",
                build_schedule_file("2828", "12:10", "13:10"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    second = client.post(
        "/schedule/import?schedule_date=2026-05-01&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala_01-05.xlsx",
                build_schedule_file("2828", "12:00", "13:00"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert first.status_code == 201
    assert second.status_code == 201

    lines = client.get(
        "/schedule/lines?schedule_date=2026-05-01&line_code=2828",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()

    db = TestingSessionLocal()
    try:
        assert db.query(ScheduleImport).count() == 1
        assert db.query(ScheduleLine).count() == 1
    finally:
        db.close()

    assert len(lines) == 1
    assert lines[0]["start_time"] == "12:00"


def test_different_effective_dates_keep_history_and_query_active_version(admin_token):
    client.post(
        "/schedule/import?schedule_date=2026-05-01&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala_vigencia_01-05.xlsx",
                build_schedule_file("2828", "12:10", "13:10"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    client.post(
        "/schedule/import?schedule_date=2026-05-20&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala_vigencia_20-05.xlsx",
                build_schedule_file("2828", "12:00", "13:00"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    before_change = client.get(
        "/schedule/lines?schedule_date=2026-05-19&line_code=2828",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    after_change = client.get(
        "/schedule/lines?schedule_date=2026-05-21&line_code=2828",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()

    db = TestingSessionLocal()
    try:
        assert db.query(ScheduleImport).count() == 2
        assert db.query(ScheduleLine).count() == 2
    finally:
        db.close()

    assert len(before_change) == 1
    assert before_change[0]["schedule_date"] == "2026-05-01"
    assert before_change[0]["start_time"] == "12:10"
    assert len(after_change) == 1
    assert after_change[0]["schedule_date"] == "2026-05-20"
    assert after_change[0]["start_time"] == "12:00"


def test_different_files_same_effective_date_are_visible_together(admin_token):
    client.post(
        "/schedule/import?schedule_date=2026-05-20&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala_caieiras_20-05.xlsx",
                build_schedule_file("2828", "12:00", "13:00"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    client.post(
        "/schedule/import?schedule_date=2026-05-20&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala_extra_20-05.xlsx",
                build_schedule_file("3030", "14:00", "15:00"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    lines = client.get(
        "/schedule/lines?schedule_date=2026-05-21",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()

    assert db_count(ScheduleImport) == 2
    assert db_count(ScheduleLine) == 2
    assert {line["line_code"] for line in lines} == {"2828", "3030"}


def test_operator_receives_schedule_imported_by_admin(admin_token, operator_token):
    client.post(
        "/schedule/import?schedule_date=2026-05-20&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala_geral_20-05.xlsx",
                build_schedule_file("2828", "12:00", "13:00"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    lines = client.get(
        "/schedule/lines?schedule_date=2026-05-21&unit=Caieiras",
        headers={"Authorization": f"Bearer {operator_token}"},
    )

    assert lines.status_code == 200
    assert len(lines.json()) == 1
    assert lines.json()[0]["line_code"] == "2828"


def test_start_window_uses_active_import_without_forcing_line_date(
    admin_token, operator_token
):
    now_brt = datetime.now(ZoneInfo("America/Sao_Paulo"))
    start_time = (now_brt + timedelta(minutes=10)).strftime("%H:%M")
    end_time = (now_brt + timedelta(minutes=50)).strftime("%H:%M")
    effective_date = now_brt.date() - timedelta(days=1)

    db = TestingSessionLocal()
    try:
        schedule_import = ScheduleImport(
            effective_date=effective_date,
            filename="escala_ativa.xlsx",
            rows_imported=1,
            created_by=1,
        )
        db.add(schedule_import)
        db.flush()
        db.add(
            ScheduleLine(
                import_id=schedule_import.id,
                schedule_date=effective_date,
                unit="Caieiras",
                prefix_code="1580",
                driver_name="MOTORISTA TESTE",
                line_code="2828",
                direction="ENTRADA",
                client_name="M LIVRE - SP-02",
                start_time=start_time,
                end_time=end_time,
                created_by=1,
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get(
        f"/schedule/lines?schedule_date={now_brt.date()}&status=pendente&start_in_minutes=40",
        headers={"Authorization": f"Bearer {operator_token}"},
    )
    count = client.get(
        f"/schedule/lines/count?schedule_date={now_brt.date()}&status=pendente&start_in_minutes=40",
        headers={"Authorization": f"Bearer {operator_token}"},
    )

    assert response.status_code == 200
    assert count.status_code == 200
    assert len(response.json()) == 1
    assert count.json()["total"] == 1
    assert response.json()[0]["line_code"] == "2828"


def test_confirm_schedule_line_moves_to_confirmed_history(admin_token, operator_token):
    import_response = client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
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
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
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
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
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
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    line_id = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()[0]["id"]
    client.post(
        f"/schedule/lines/{line_id}/confirm",
        headers={"Authorization": f"Bearer {operator_token}"},
    )

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
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
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


def test_download_xlsx_with_auth_header_after_schedule_change(admin_token):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    line = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()[0]

    update = client.patch(
        f"/schedule/lines/{line['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"start_time": "04:10", "driver_name": "MOTORISTA ALTERADO"},
    )
    assert update.status_code == 200
    assert update.json()["status"] == "alterada"

    response = client.get(
        "/schedule/download?schedule_date=2026-04-13&unit=Caieiras",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    wb = openpyxl.load_workbook(BytesIO(response.content))
    ws = wb["caieiras"]
    assert ws.cell(row=4, column=3).value == "MOTORISTA ALTERADO"
    assert ws.cell(row=4, column=7).value == "04:10 - 04:45"
    assert ws.cell(row=6, column=7).value == "L - 7368"


def test_audit_logs_are_listed(admin_token):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
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
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    line_id = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()[0]["id"]
    client.post(
        f"/schedule/lines/{line_id}/confirm",
        headers={"Authorization": f"Bearer {operator_token}"},
    )

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
    assert "PREFIXO 1590" in data["whatsapp_text"]
    assert "ATENDERA AS LINHAS" in data["whatsapp_text"]


def test_swap_can_change_only_driver_from_confirmed_schedule_line(
    admin_token, operator_token
):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    line = client.get(
        "/schedule/lines?schedule_date=2026-04-13",
        headers={"Authorization": f"Bearer {operator_token}"},
    ).json()[0]
    client.post(
        f"/schedule/lines/{line['id']}/confirm",
        headers={"Authorization": f"Bearer {operator_token}"},
    )

    response = client.post(
        "/swaps/",
        headers={"Authorization": f"Bearer {operator_token}"},
        json={
            "schedule_line_id": line["id"],
            "vehicle_out": line["prefix_code"],
            "driver_in": "MOTORISTA RESERVA",
            "reason": "Adequacao operacional",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["vehicle_in"] is None
    assert data["driver_out"] == line["driver_name"]
    assert data["driver_in"] == "MOTORISTA RESERVA"
    assert "MOTORISTA MOTORISTA RESERVA" in data["whatsapp_text"]


def test_swap_requires_confirmed_schedule_line(admin_token, operator_token):
    client.post(
        "/schedule/import?schedule_date=2026-04-13&replace=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "escala.xlsx",
                build_schedule_file(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
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
