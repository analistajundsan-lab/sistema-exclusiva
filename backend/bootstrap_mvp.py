from datetime import datetime, timezone

from sqlalchemy import inspect, text

from auth import hash_password
import hashlib

from models import (
    AuditLog,
    SafetyAnswerType,
    SafetyChecklistItem,
    SafetyChecklistTemplate,
    SafetySeverity,
    SafetyVehicle,
    SessionLocal,
    UnitAlertSetting,
    User,
    UserRole,
    engine,
)
from routes_auth import hash_cpf, find_user_by_cpf, DEFAULT_TEMP_PASSWORD

# Fonte unica da senha temporaria (definida em routes_auth).
TEMP_PASSWORD = DEFAULT_TEMP_PASSWORD


def ensure_column(table: str, column: str, ddl: str) -> None:
    inspector = inspect(engine)
    existing = {item["name"] for item in inspector.get_columns(table)}
    if column not in existing:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


def migrate_userrole_enum() -> None:
    # SQLAlchemy uses enum .name (uppercase) for PostgreSQL native enums
    new_values = [
        "PLANTONISTA",
        "ANALISTA",
        "GERENTE",
        "SUPERVISAO",
        "TECNICO_SEGURANCA",
        "ENGENHEIRO_SEGURANCA",
        # lowercase kept for backward compat with any legacy data
        "plantonista",
        "analista",
        "gerente",
        "supervisao",
        "tecnico_seguranca",
        "engenheiro_seguranca",
    ]
    with engine.begin() as conn:
        for val in new_values:
            try:
                conn.execute(
                    text(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{val}'")
                )
            except Exception:
                pass


def migrate_existing_sqlite() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "users" in tables:
        ensure_column(
            "users",
            "is_super_admin",
            "is_super_admin BOOLEAN DEFAULT FALSE NOT NULL",
        )
        ensure_column(
            "users",
            "mfa_enabled",
            "mfa_enabled BOOLEAN DEFAULT FALSE NOT NULL",
        )
        ensure_column("users", "mfa_secret", "mfa_secret VARCHAR(64)")
        ensure_column(
            "users",
            "must_change_password",
            "must_change_password BOOLEAN DEFAULT FALSE",
        )
        ensure_column(
            "users", "can_delete_history", "can_delete_history BOOLEAN DEFAULT FALSE"
        )
        ensure_column("users", "password_changed_at", "password_changed_at TIMESTAMP")
        ensure_column("users", "unit", "unit VARCHAR(80)")
        ensure_column("users", "units", "units TEXT")
        ensure_column("users", "display_name", "display_name VARCHAR(255)")
        ensure_column("users", "photo_url", "photo_url TEXT")
    migrate_userrole_enum()
    if "audit_logs" in tables:
        ensure_column("audit_logs", "deleted_at", "deleted_at TIMESTAMP")
        ensure_column("audit_logs", "deleted_by", "deleted_by INTEGER")
        # Permite auditar eventos sem usuario (ex.: falha de login). SQLite nao
        # suporta ALTER COLUMN; nesse caso ignoramos (schema novo ja e nullable).
        try:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL")
                )
        except Exception:
            pass
    if "swaps" in tables:
        ensure_column("swaps", "schedule_line_id", "schedule_line_id INTEGER")
        ensure_column("swaps", "schedule_date", "schedule_date DATE")
        ensure_column("swaps", "unit", "unit VARCHAR(80)")
        ensure_column("swaps", "client_name", "client_name VARCHAR(120)")
        ensure_column("swaps", "driver_out", "driver_out VARCHAR(255)")
        ensure_column("swaps", "driver_in", "driver_in VARCHAR(255)")
        ensure_column("swaps", "whatsapp_text", "whatsapp_text VARCHAR(1000)")
    if "maintenance_tickets" in tables:
        ensure_column(
            "maintenance_tickets", "email_sent", "email_sent BOOLEAN DEFAULT FALSE"
        )
        ensure_column("maintenance_tickets", "email_sent_at", "email_sent_at TIMESTAMP")
        ensure_column(
            "maintenance_tickets", "sst_approved", "sst_approved BOOLEAN DEFAULT FALSE"
        )
        ensure_column(
            "maintenance_tickets", "sst_approved_by", "sst_approved_by INTEGER"
        )
        ensure_column(
            "maintenance_tickets", "sst_approved_at", "sst_approved_at TIMESTAMP"
        )
        ensure_column(
            "maintenance_tickets",
            "sst_approved_notes",
            "sst_approved_notes VARCHAR(500)",
        )
    if "incidents" in tables:
        ensure_column("incidents", "victim_status", "victim_status VARCHAR(20)")
        ensure_column("incidents", "unit", "unit VARCHAR(80)")
        ensure_column(
            "incidents", "sst_forwarded", "sst_forwarded BOOLEAN DEFAULT FALSE"
        )
        ensure_column("incidents", "sst_forwarded_at", "sst_forwarded_at TIMESTAMP")
        ensure_column("incidents", "sst_forwarded_by", "sst_forwarded_by INTEGER")
        ensure_column(
            "incidents", "replacement_prefix", "replacement_prefix VARCHAR(20)"
        )
        ensure_column(
            "incidents", "sst_forward_reason", "sst_forward_reason VARCHAR(500)"
        )
        ensure_column(
            "incidents", "sst_forward_priority", "sst_forward_priority VARCHAR(20)"
        )
    if "schedule_lines" in tables:
        ensure_column("schedule_lines", "import_id", "import_id INTEGER")
    if "vehicle_checklists" in tables:
        ensure_column("vehicle_checklists", "crlv_status", "crlv_status VARCHAR(50)")
        ensure_column("vehicle_checklists", "emtu_status", "emtu_status VARCHAR(50)")
        ensure_column(
            "vehicle_checklists", "artesp_status", "artesp_status VARCHAR(50)"
        )
        ensure_column("vehicle_checklists", "emdec_status", "emdec_status VARCHAR(50)")
        ensure_column(
            "vehicle_checklists", "bolsa_documentos", "bolsa_documentos VARCHAR(20)"
        )
    if "sinistros" in tables:
        for col, ddl in [
            ("gravidade", "gravidade VARCHAR(20)"),
            ("probabilidade", "probabilidade VARCHAR(20)"),
            ("turno", "turno VARCHAR(20)"),
            ("tipo_operacao", "tipo_operacao VARCHAR(80)"),
            ("cliente_cad", "cliente_cad VARCHAR(120)"),
            ("fator_contribuinte", "fator_contribuinte VARCHAR(120)"),
            ("condicao_ambiental", "condicao_ambiental VARCHAR(80)"),
            ("houve_vitima", "houve_vitima BOOLEAN"),
            ("houve_terceiro", "houve_terceiro BOOLEAN"),
            ("tipo_lesao", "tipo_lesao VARCHAR(80)"),
            ("houve_afastamento", "houve_afastamento BOOLEAN"),
            ("tipo_trajeto", "tipo_trajeto VARCHAR(80)"),
            ("custo_final", "custo_final FLOAT"),
            ("responsabilidade", "responsabilidade VARCHAR(40)"),
            ("tratativa_acao", "tratativa_acao TEXT"),
            ("responsavel_acao", "responsavel_acao VARCHAR(255)"),
            ("prazo_acao", "prazo_acao DATE"),
            ("status_acao", "status_acao VARCHAR(30)"),
        ]:
            ensure_column("sinistros", col, ddl)
    if "liberacoes_condutor" in tables:
        for col, ddl in [
            ("respostas", "respostas TEXT"),
            ("score_aptidao", "score_aptidao INTEGER"),
            ("categoria_bloqueio", "categoria_bloqueio VARCHAR(40)"),
            ("alerta_fadiga", "alerta_fadiga VARCHAR(40)"),
        ]:
            ensure_column("liberacoes_condutor", col, ddl)


DAILY_SAFETY_ITEMS = [
    ("Faixas refletivas", SafetySeverity.ATTENTION),
    ("Adesivos ARTESP, EMTU e Fretadao", SafetySeverity.ATTENTION),
    ("Freios funcionando e regulados", SafetySeverity.BLOCKING),
    ("Luzes do salao, setas e pisca-alerta", SafetySeverity.BLOCKING),
    ("Luzes de lanternas e farois funcionando", SafetySeverity.BLOCKING),
    ("Pneus, ponto TWI e porcas", SafetySeverity.BLOCKING),
    ("Extintores dentro da validade e carregados", SafetySeverity.BLOCKING),
    ("Agua, nivel de oleo e combustivel", SafetySeverity.BLOCKING),
    ("Funcionamento do motor", SafetySeverity.BLOCKING),
    ("Limpador de para-brisa", SafetySeverity.BLOCKING),
    ("Funcionamento da buzina e luzes do painel", SafetySeverity.BLOCKING),
    ("Alcool em gel", SafetySeverity.ATTENTION),
    ("Limpeza interna do salao e cortinas", SafetySeverity.ATTENTION),
    ("Cintos de seguranca funcionando e sobre o banco", SafetySeverity.BLOCKING),
    ("Espelhos retrovisores e vidros", SafetySeverity.ATTENTION),
    ("Porta e ar condicionado funcionando", SafetySeverity.BLOCKING),
    ("Limpeza externa", SafetySeverity.ATTENTION),
    (
        "Avarias no veiculo - informar o Trafego de imediato com fotos",
        SafetySeverity.BLOCKING,
    ),
    (
        "Atencao a velocidade no interior do CAD: maximo 20 km/h",
        SafetySeverity.ATTENTION,
    ),
]


CAIEIRAS_PREFIXES = [
    "07",
    "1120",
    "1130",
    "1140",
    "1150",
    "1180",
    "1580",
    "1590",
    "1720",
    "1730",
    "1740",
    "1750",
    "1760",
    "1770",
    "1780",
    "1790",
    "1800",
    "1810",
    "2860",
    "2870",
    "2880",
    "2890",
    "3010",
    "3020",
    "3030",
    "3040",
    "3050",
    "3060",
    "3070",
    "3080",
    "3090",
    "3100",
    "3220",
    "3230",
    "3240",
    "3250",
    "3260",
    "3270",
    "3280",
    "3290",
    "3300",
    "3310",
    "3320",
    "3330",
    "3340",
    "3350",
    "3360",
    "3370",
    "3380",
    "3390",
    "3400",
    "3410",
    "3420",
    "3430",
    "3440",
    "3450",
    "3460",
    "3470",
    "3480",
    "3490",
    "3500",
    "3510",
    "3520",
    "3530",
    "3540",
    "3550",
    "3560",
    "3570",
    "3580",
    "3590",
    "3600",
    "3610",
    "3620",
    "3630",
    "3640",
    "3650",
    "3660",
    "3670",
    "3680",
    "3690",
    "3700",
    "3710",
    "3720",
    "3730",
    "11140",
]


def _vehicle_token(prefix: str) -> str:
    digest = hashlib.sha256(f"safety-caieiras-{prefix}".encode("utf-8")).hexdigest()
    return digest[:24]


def seed_safety_domain(db) -> None:
    template = (
        db.query(SafetyChecklistTemplate)
        .filter(
            SafetyChecklistTemplate.form_type == "daily_vehicle",
            SafetyChecklistTemplate.version == 1,
        )
        .first()
    )
    if not template:
        template = SafetyChecklistTemplate(
            form_type="daily_vehicle",
            version=1,
            title="Check-list diario de veiculos - Seguranca do Trabalho",
            active=True,
        )
        db.add(template)
        db.flush()

    for position, (item_text, severity) in enumerate(DAILY_SAFETY_ITEMS, start=1):
        item = (
            db.query(SafetyChecklistItem)
            .filter(
                SafetyChecklistItem.template_id == template.id,
                SafetyChecklistItem.position == position,
            )
            .first()
        )
        if not item:
            item = SafetyChecklistItem(template_id=template.id, position=position)
        item.section = "Inspecao diaria"
        item.item_text = item_text
        item.severity = severity
        item.answer_type = SafetyAnswerType.OK_NOT_OK_NA
        item.active = True
        db.add(item)

    for prefix in CAIEIRAS_PREFIXES:
        vehicle = db.query(SafetyVehicle).filter(SafetyVehicle.prefix == prefix).first()
        if not vehicle:
            vehicle = SafetyVehicle(prefix=prefix, unit="CAIEIRAS")
        vehicle.public_token = _vehicle_token(prefix)
        vehicle.active = True
        db.add(vehicle)

    alert = (
        db.query(UnitAlertSetting).filter(UnitAlertSetting.unit == "CAIEIRAS").first()
    )
    if not alert:
        alert = UnitAlertSetting(unit="CAIEIRAS")
        db.add(alert)
    alert.manager_email = "supoperacao@exclusivaturismo.com.br"


def upsert_admin(
    db,
    cpf: str,
    email: str,
    name: str,
    can_delete_history: bool = False,
    is_super_admin: bool = False,
) -> None:
    user, _ = find_user_by_cpf(db, cpf)
    if not user:
        user = User(
            cpf_hash=hash_cpf(cpf),
            email=email,
            name=name,
            password_hash=hash_password(TEMP_PASSWORD),
            role=UserRole.ADMIN,
            is_active=True,
            must_change_password=True,
        )
        db.add(user)
        db.flush()
    else:
        # Normaliza para o formato de hash canonico (migra legado -> HMAC).
        user.cpf_hash = hash_cpf(cpf)
    user.email = email
    user.name = name
    user.role = UserRole.ADMIN
    user.is_active = True
    user.can_delete_history = can_delete_history
    user.is_super_admin = is_super_admin
    db.add(
        AuditLog(
            user_id=user.id,
            action="BOOTSTRAP_ADMIN",
            resource="user",
            resource_id=user.id,
            details=name,
        )
    )


def main() -> None:
    migrate_existing_sqlite()
    db = SessionLocal()
    try:
        for user in db.query(User).filter(User.must_change_password.is_(None)).all():
            user.must_change_password = False
        upsert_admin(
            db,
            "22692036824",
            "jerusa@exclusivaturismo.com.br",
            "Jerusa",
            can_delete_history=False,
            is_super_admin=True,
        )
        # Super administrador definido por flag controlada no banco (nao por
        # CPF hardcoded em runtime). O CPF e usado apenas aqui no seed inicial.
        upsert_admin(
            db,
            "41637531842",
            "vinicius@exclusivaturismo.com.br",
            "Vinicius",
            can_delete_history=True,
            is_super_admin=True,
        )
        # Garante que apenas super admins mantenham permissao de apagar historico.
        db.query(User).filter(User.is_super_admin.is_(False)).update(
            {User.can_delete_history: False}, synchronize_session=False
        )
        seed_safety_domain(db)
        db.commit()
        print(
            f"Admins atualizados. Senha temporaria: {TEMP_PASSWORD}. {datetime.now(timezone.utc).isoformat()}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
