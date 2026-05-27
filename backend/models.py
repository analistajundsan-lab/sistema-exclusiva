from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Date,
    DateTime,
    Enum,
    Text,
    func,
    create_engine,
)
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
import enum
from datetime import datetime
from config import settings

Base = declarative_base()


class UserRole(str, enum.Enum):
    OPERATOR = "operator"  # legado
    SUPERVISOR = "supervisor"  # legado
    ADMIN = "admin"
    PLANTONISTA = "plantonista"
    ANALISTA = "analista"
    GERENTE = "gerente"
    SUPERVISAO = "supervisao"


class IncidentStatus(str, enum.Enum):
    ABERTO = "aberto"
    EM_ANDAMENTO = "em_andamento"
    FECHADO = "fechado"


class ScheduleLineStatus(str, enum.Enum):
    PENDENTE = "pendente"
    CONFIRMADA = "confirmada"
    ALTERADA = "alterada"
    CANCELADA = "cancelada"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    cpf_hash = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.OPERATOR)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False)
    can_delete_history = Column(Boolean, default=False)
    unit = Column(String(80))
    units = Column(Text)
    display_name = Column(String(255))
    photo_url = Column(Text)
    password_changed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    prefix_code = Column(String(10), nullable=False, index=True)
    incident_type = Column(String(50), nullable=False)
    description = Column(String(500))
    line = Column(String(50), index=True)
    direction = Column(String(50))
    victim_status = Column(String(20))
    status = Column(
        Enum(IncidentStatus), default=IncidentStatus.ABERTO, nullable=False, index=True
    )
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Swap(Base):
    __tablename__ = "swaps"

    id = Column(Integer, primary_key=True, index=True)
    schedule_line_id = Column(Integer, index=True)
    schedule_date = Column(Date, index=True)
    unit = Column(String(80), index=True)
    client_name = Column(String(120), index=True)
    vehicle_out = Column(String(10), nullable=False, index=True)
    vehicle_in = Column(String(10), nullable=False, index=True)
    reason = Column(String(255))
    lines_covered = Column(String(500))
    whatsapp_text = Column(String(1000))
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ScheduleLine(Base):
    __tablename__ = "schedule_lines"

    id = Column(Integer, primary_key=True, index=True)
    import_id = Column(Integer, index=True)
    schedule_date = Column(Date, nullable=False, index=True)
    unit = Column(String(80), nullable=False, index=True)
    prefix_code = Column(String(20), nullable=False, index=True)
    driver_name = Column(String(255), nullable=False, index=True)
    line_code = Column(String(20), nullable=False, index=True)
    direction = Column(String(20), nullable=False, index=True)
    client_name = Column(String(120), nullable=False, index=True)
    route_name = Column(String(255))
    start_time = Column(String(5), nullable=False, index=True)
    end_time = Column(String(5), nullable=False)
    status = Column(
        Enum(ScheduleLineStatus),
        default=ScheduleLineStatus.PENDENTE,
        nullable=False,
        index=True,
    )
    notes = Column(String(500))
    confirmed_by = Column(Integer)
    confirmed_at = Column(DateTime)
    source_sheet = Column(String(120))
    source_row = Column(Integer)
    source_col = Column(Integer)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ScheduleImport(Base):
    __tablename__ = "schedule_imports"

    id = Column(Integer, primary_key=True, index=True)
    effective_date = Column(Date, nullable=False, index=True)
    filename = Column(String(255), nullable=False, index=True)
    file_size = Column(Integer)
    rows_imported = Column(Integer, nullable=False, default=0)
    created_by = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    action = Column(String(50), nullable=False, index=True)
    resource = Column(String(50), nullable=False)
    resource_id = Column(Integer, index=True)
    details = Column(String(500))
    deleted_at = Column(DateTime, index=True)
    deleted_by = Column(Integer, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class VehicleChecklist(Base):
    __tablename__ = "vehicle_checklists"

    id = Column(Integer, primary_key=True, index=True)
    auditor_id = Column(Integer, nullable=False, index=True)
    auditor_name = Column(String(255), nullable=False)
    garagem = Column(String(80), nullable=False, index=True)
    prefixo = Column(String(20), nullable=False, index=True)
    tipo = Column(String(20), nullable=False)  # AVULSO | MENSAL

    # Câmeras (MENSAL)
    camera_frontal = Column(String(30))
    camera_lateral_esq = Column(String(30))
    camera_lateral_dir = Column(String(30))
    camera_fadiga = Column(String(30))
    camera_ip_motorista = Column(String(30))
    camera_salao = Column(String(30))

    # Acessórios básicos (MENSAL)
    tem_leitor_embarque = Column(Boolean)
    ar_condicionado = Column(Boolean)

    # Documentos (MENSAL) — arrays armazenados como JSON em Text
    licenciamento = Column(Text)  # legado — mantido para dados antigos
    licenciamento_outro = Column(String(100))
    checklist_colocado = Column(Text)
    cartao_artesp = Column(String(50))  # legado — mantido para dados antigos
    crlv_status = Column(String(50))  # SIM_EM_DIA | VENCIDO | NAO_LOCALIZADO
    emtu_status = Column(String(50))  # SIM_LOCALIZADO | DANIFICADO | NAO_LOCALIZADO
    artesp_status = Column(String(50))  # SIM_EM_DIA | VENCIDO | NAO_LOCALIZADO
    emdec_status = Column(String(50))  # SIM_EM_DIA | VENCIDO | NAO_LOCALIZADO

    # Materiais gráficos (MENSAL)
    qr_code = Column(Boolean)
    adesivo_leitor = Column(Boolean)
    placa_senha_wifi = Column(Boolean)

    # Wi-Fi (AVULSO e MENSAL)
    wifi_status = Column(Text)
    wifi_outro = Column(String(255))

    observacoes = Column(Text)
    evidencias = Column(Text)  # JSON array de base64

    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
