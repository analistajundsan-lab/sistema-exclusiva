from datetime import datetime, timezone

from sqlalchemy import inspect, text

from auth import hash_password
from models import AuditLog, SessionLocal, User, UserRole, engine
from routes_auth import hash_cpf

TEMP_PASSWORD = "Exclusiva@2026"


def ensure_column(table: str, column: str, ddl: str) -> None:
    inspector = inspect(engine)
    existing = {item["name"] for item in inspector.get_columns(table)}
    if column not in existing:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


def migrate_userrole_enum() -> None:
    new_values = ["plantonista", "analista", "gerente", "supervisao"]
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
            "users", "must_change_password", "must_change_password BOOLEAN DEFAULT 0"
        )
        ensure_column(
            "users", "can_delete_history", "can_delete_history BOOLEAN DEFAULT 0"
        )
        ensure_column("users", "password_changed_at", "password_changed_at DATETIME")
        ensure_column("users", "unit", "unit VARCHAR(80)")
        ensure_column("users", "units", "units TEXT")
        ensure_column("users", "display_name", "display_name VARCHAR(255)")
        ensure_column("users", "photo_url", "photo_url TEXT")
    migrate_userrole_enum()
    if "audit_logs" in tables:
        ensure_column("audit_logs", "deleted_at", "deleted_at DATETIME")
        ensure_column("audit_logs", "deleted_by", "deleted_by INTEGER")
    if "swaps" in tables:
        ensure_column("swaps", "schedule_line_id", "schedule_line_id INTEGER")
        ensure_column("swaps", "schedule_date", "schedule_date DATE")
        ensure_column("swaps", "unit", "unit VARCHAR(80)")
        ensure_column("swaps", "client_name", "client_name VARCHAR(120)")
        ensure_column("swaps", "whatsapp_text", "whatsapp_text VARCHAR(1000)")
    if "incidents" in tables:
        ensure_column("incidents", "victim_status", "victim_status VARCHAR(20)")
    if "schedule_lines" in tables:
        ensure_column("schedule_lines", "import_id", "import_id INTEGER")
    if "vehicle_checklists" in tables:
        ensure_column("vehicle_checklists", "crlv_emtu", "crlv_emtu VARCHAR(50)")
        ensure_column("vehicle_checklists", "crlv_emtu_qrcode", "crlv_emtu_qrcode BOOLEAN")
        ensure_column("vehicle_checklists", "artesp_doc", "artesp_doc VARCHAR(50)")
        ensure_column("vehicle_checklists", "emdec_doc", "emdec_doc VARCHAR(50)")


def upsert_admin(
    db,
    cpf: str,
    email: str,
    name: str,
    can_delete_history: bool = False,
) -> None:
    cpf_hash = hash_cpf(cpf)
    user = db.query(User).filter(User.cpf_hash == cpf_hash).first()
    if not user:
        user = User(
            cpf_hash=cpf_hash,
            email=email,
            name=name,
            password_hash=hash_password(TEMP_PASSWORD),
            role=UserRole.ADMIN,
            is_active=True,
            must_change_password=True,
        )
        db.add(user)
        db.flush()
    user.email = email
    user.name = name
    user.role = UserRole.ADMIN
    user.is_active = True
    user.can_delete_history = can_delete_history
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
            db, "22692036824", "jerusa@exclusivaturismo.com.br", "Jerusa", False
        )
        upsert_admin(
            db, "41637531842", "vinicius@exclusivaturismo.com.br", "Vinicius", True
        )
        vinicius_hash = hash_cpf("41637531842")
        db.query(User).filter(User.cpf_hash != vinicius_hash).update(
            {User.can_delete_history: False}
        )
        db.commit()
        print(
            f"Admins atualizados. Senha temporaria: {TEMP_PASSWORD}. {datetime.now(timezone.utc).isoformat()}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
