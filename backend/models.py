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
import hashlib
from datetime import datetime
from urllib.parse import urlparse, urlencode, parse_qs, urlunparse
from config import settings


def _clean_db_url(url: str) -> str:
    """Remove parâmetros que o Neon PgBouncer (pooler) não suporta.

    - channel_binding=require: exige SCRAM-SHA-256-PLUS que o PgBouncer
      não implementa em transaction mode, causando falha nas queries.
    """
    # Skip processing for non-PostgreSQL URLs (e.g., SQLite for tests)
    if not url.startswith("postgresql://"):
        return url

    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query, keep_blank_values=True)
        params.pop("channel_binding", None)
        new_query = urlencode({k: v[0] for k, v in params.items()})
        return urlunparse(parsed._replace(query=new_query))
    except Exception:
        return url


Base = declarative_base()


class UserRole(str, enum.Enum):
    OPERATOR = "operator"  # legado
    SUPERVISOR = "supervisor"  # legado
    ADMIN = "admin"
    PLANTONISTA = "plantonista"
    ANALISTA = "analista"
    GERENTE = "gerente"
    SUPERVISAO = "supervisao"
    TECNICO_SEGURANCA = "tecnico_seguranca"
    ENGENHEIRO_SEGURANCA = "engenheiro_seguranca"


class IncidentStatus(str, enum.Enum):
    ABERTO = "aberto"
    EM_ANDAMENTO = "em_andamento"
    FECHADO = "fechado"


class SinistroStatus(str, enum.Enum):
    ABERTO = "aberto"
    EM_ANALISE = "em_analise"
    AGUARDANDO_DOCUMENTOS = "aguardando_documentos"
    EM_INVESTIGACAO = "em_investigacao"
    ENCERRADO = "encerrado"


class LiberacaoStatus(str, enum.Enum):
    PENDENTE = "pendente"
    LIBERADO = "liberado"
    LIBERADO_COM_RESTRICAO = "liberado_com_restricao"
    NAO_LIBERADO = "nao_liberado"


class SaudeStatus(str, enum.Enum):
    EM_ACOMPANHAMENTO = "em_acompanhamento"
    ENCAMINHADO = "encaminhado"
    RESOLVIDO = "resolvido"


class ScheduleLineStatus(str, enum.Enum):
    PENDENTE = "pendente"
    CONFIRMADA = "confirmada"
    ALTERADA = "alterada"
    CANCELADA = "cancelada"


class SafetySeverity(str, enum.Enum):
    OK = "ok"
    ATTENTION = "attention"
    BLOCKING = "blocking"


class SafetyAnswerType(str, enum.Enum):
    OK_NOT_OK_NA = "ok_not_ok_na"


class SafetySubmissionStatus(str, enum.Enum):
    OK = "ok"
    ATTENTION = "attention"
    BLOCKING = "blocking"


class MaintenanceTicketStatus(str, enum.Enum):
    OPEN = "open"
    VALIDATED = "validated"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


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

    @property
    def has_full_access(self) -> bool:
        vinicius_hash = hashlib.sha256("41637531842".encode()).hexdigest()[:16]
        return self.cpf_hash == vinicius_hash


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    prefix_code = Column(String(10), nullable=False, index=True)
    incident_type = Column(String(50), nullable=False)
    description = Column(String(500))
    line = Column(String(50), index=True)
    direction = Column(String(50))
    victim_status = Column(String(20))
    unit = Column(String(80), index=True)
    status = Column(
        Enum(IncidentStatus), default=IncidentStatus.ABERTO, nullable=False, index=True
    )
    sst_forwarded = Column(Boolean, default=False, nullable=False, index=True)
    sst_forwarded_at = Column(DateTime)
    sst_forwarded_by = Column(Integer, index=True)
    sst_forward_reason = Column(String(500))
    sst_forward_priority = Column(String(20))
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
    vehicle_in = Column(String(10), index=True)
    driver_out = Column(String(255), index=True)
    driver_in = Column(String(255), index=True)
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
    tipo = Column(String(20), nullable=False)  # AVULSO | MENSAL | DOCUMENTOS

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
    bolsa_documentos = Column(String(20))  # TEM | NAO_TEM

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


class SafetyVehicle(Base):
    __tablename__ = "safety_vehicles"

    id = Column(Integer, primary_key=True, index=True)
    prefix = Column(String(20), nullable=False, unique=True, index=True)
    plate = Column(String(20), index=True)
    unit = Column(String(80), nullable=False, index=True)
    active = Column(Boolean, default=True, nullable=False, index=True)
    public_token = Column(String(80), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SafetyChecklistTemplate(Base):
    __tablename__ = "safety_checklist_templates"

    id = Column(Integer, primary_key=True, index=True)
    form_type = Column(String(60), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    title = Column(String(255), nullable=False)
    active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SafetyChecklistItem(Base):
    __tablename__ = "safety_checklist_items"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, nullable=False, index=True)
    section = Column(String(120), nullable=False, default="Inspecao diaria")
    position = Column(Integer, nullable=False, default=0)
    item_text = Column(String(500), nullable=False)
    severity = Column(
        Enum(SafetySeverity), nullable=False, default=SafetySeverity.ATTENTION
    )
    answer_type = Column(
        Enum(SafetyAnswerType), nullable=False, default=SafetyAnswerType.OK_NOT_OK_NA
    )
    active = Column(Boolean, default=True, nullable=False, index=True)


class DriverChecklistSubmission(Base):
    __tablename__ = "driver_checklist_submissions"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, nullable=False, index=True)
    template_id = Column(Integer, nullable=False, index=True)
    driver_name = Column(String(255), nullable=False, index=True)
    driver_registration = Column(String(60), nullable=False, index=True)
    submitted_at = Column(DateTime, server_default=func.now(), index=True)
    ip_address = Column(String(80))
    user_agent = Column(String(500))
    declaration_accepted = Column(Boolean, nullable=False, default=False)
    overall_status = Column(Enum(SafetySubmissionStatus), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class DriverChecklistAnswer(Base):
    __tablename__ = "driver_checklist_answers"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, nullable=False, index=True)
    item_id = Column(Integer, nullable=False, index=True)
    answer = Column(String(20), nullable=False)
    observation = Column(String(500))


class SubmissionEvidence(Base):
    __tablename__ = "submission_evidence"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, nullable=False, index=True)
    answer_id = Column(Integer, index=True)
    stored_reference = Column(String(500), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class MaintenanceTicket(Base):
    __tablename__ = "maintenance_tickets"

    id = Column(Integer, primary_key=True, index=True)
    unit = Column(String(80), nullable=False, index=True)
    vehicle_id = Column(Integer, nullable=False, index=True)
    source_submission_id = Column(Integer, nullable=False, index=True)
    status = Column(
        Enum(MaintenanceTicketStatus),
        nullable=False,
        default=MaintenanceTicketStatus.OPEN,
        index=True,
    )
    blocking_items = Column(Text)
    manager_validated_by = Column(Integer, index=True)
    manager_validated_at = Column(DateTime)
    manager_notes = Column(String(500))
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class UnitAlertSetting(Base):
    __tablename__ = "unit_alert_settings"

    id = Column(Integer, primary_key=True, index=True)
    unit = Column(String(80), nullable=False, unique=True, index=True)
    manager_email = Column(String(255), nullable=False)
    copied_emails = Column(Text)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Sinistro(Base):
    __tablename__ = "sinistros"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(30), unique=True, index=True)
    unit = Column(String(80), nullable=False, index=True)
    empresa = Column(String(120))

    prefixo = Column(String(20), index=True)
    placa = Column(String(20))
    modelo = Column(String(120))
    frota = Column(String(50))

    condutor_nome = Column(String(255), index=True)
    condutor_matricula = Column(String(60), index=True)
    condutor_cpf = Column(String(15))
    condutor_tempo_empresa = Column(String(50))

    data_ocorrencia = Column(Date, nullable=False, index=True)
    hora_ocorrencia = Column(String(5))
    local_ocorrencia = Column(String(255))
    cidade = Column(String(120))
    estado = Column(String(2))

    tipo_sinistro = Column(String(80), nullable=False)
    descricao = Column(Text)
    danos_identificados = Column(Text)  # JSON array
    evidencias = Column(Text)  # JSON array
    envolvidos = Column(Text)  # JSON array

    status = Column(
        Enum(SinistroStatus),
        default=SinistroStatus.ABERTO,
        nullable=False,
        index=True,
    )

    created_by = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SinistroHistorico(Base):
    __tablename__ = "sinistro_historico"

    id = Column(Integer, primary_key=True, index=True)
    sinistro_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    campo = Column(String(80))
    valor_anterior = Column(Text)
    valor_novo = Column(Text)
    descricao = Column(String(500))
    created_at = Column(DateTime, server_default=func.now(), index=True)


class LiberacaoCondutor(Base):
    __tablename__ = "liberacoes_condutor"

    id = Column(Integer, primary_key=True, index=True)
    unit = Column(String(80), nullable=False, index=True)
    condutor_nome = Column(String(255), nullable=False, index=True)
    condutor_matricula = Column(String(60), index=True)
    motivo_avaliacao = Column(String(100), nullable=False)

    documentacao_ok = Column(Boolean)
    treinamentos_ok = Column(Boolean)
    exames_ok = Column(Boolean)
    aso_ok = Column(Boolean)
    reciclagem_ok = Column(Boolean)
    avaliacoes_sst_ok = Column(Boolean)

    resultado = Column(
        Enum(LiberacaoStatus),
        default=LiberacaoStatus.PENDENTE,
        nullable=False,
        index=True,
    )
    observacoes = Column(Text)
    restricoes = Column(Text)
    evidencias = Column(Text)  # JSON array

    created_by = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SaudeBeEstarCondutor(Base):
    __tablename__ = "saude_beestar_condutor"

    id = Column(Integer, primary_key=True, index=True)
    unit = Column(String(80), nullable=False, index=True)
    condutor_nome = Column(String(255), nullable=False, index=True)
    condutor_matricula = Column(String(60), index=True)
    data_avaliacao = Column(Date, nullable=False, index=True)
    tecnico_responsavel = Column(String(255))

    qualidade_sono = Column(String(20))
    fadiga = Column(String(20))
    alimentacao = Column(String(20))
    hidratacao = Column(String(20))
    queixas_fisicas = Column(Text)

    estresse = Column(String(20))
    ansiedade = Column(String(20))
    conflitos_pessoais = Column(Text)
    observacoes_comportamentais = Column(Text)

    jornada_excessiva = Column(Boolean)
    queixas_recorrentes = Column(Text)
    historico_ocorrencias = Column(Text)
    necessidade_treinamento = Column(Boolean)

    plano_acao = Column(Text)
    encaminhamentos = Column(Text)  # JSON array

    status = Column(
        Enum(SaudeStatus),
        default=SaudeStatus.EM_ACOMPANHAMENTO,
        nullable=False,
        index=True,
    )

    created_by = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


_database_url = (
    settings.DATABASE_URL
    or "postgresql://postgres:postgres@localhost:5432/sistema_exclusiva"
)
engine = create_engine(_clean_db_url(_database_url), pool_pre_ping=True, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
