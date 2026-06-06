from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from datetime import date, datetime
from typing import Optional, List
from enum import Enum
import re


class UserRole(str, Enum):
    OPERATOR = "operator"  # legado
    SUPERVISOR = "supervisor"  # legado
    ADMIN = "admin"
    PLANTONISTA = "plantonista"
    ANALISTA = "analista"
    GERENTE = "gerente"
    SUPERVISAO = "supervisao"
    TECNICO_SEGURANCA = "tecnico_seguranca"
    ENGENHEIRO_SEGURANCA = "engenheiro_seguranca"


class IncidentStatus(str, Enum):
    ABERTO = "aberto"
    EM_ANDAMENTO = "em_andamento"
    FECHADO = "fechado"


class ScheduleLineStatus(str, Enum):
    PENDENTE = "pendente"
    CONFIRMADA = "confirmada"
    ALTERADA = "alterada"
    CANCELADA = "cancelada"


class UserCreate(BaseModel):
    cpf: str = Field(..., min_length=11, max_length=14)
    email: EmailStr
    name: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.PLANTONISTA
    unit: Optional[str] = Field(None, max_length=80)
    units: Optional[str] = None
    must_change_password: bool = False

    @field_validator("cpf")
    @classmethod
    def cpf_only_digits(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return digits


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=255)
    photo_url: Optional[str] = None


class UserAdminUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=255)
    email: Optional[EmailStr] = None
    unit: Optional[str] = Field(None, max_length=80)
    units: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    can_delete_history: Optional[bool] = None
    must_change_password: Optional[bool] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role: UserRole
    is_active: bool
    must_change_password: bool
    can_delete_history: bool
    has_full_access: bool = False
    unit: Optional[str] = None
    units: Optional[str] = None
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    created_at: datetime


class LoginRequest(BaseModel):
    cpf: str = Field(..., min_length=11, max_length=14)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordReset(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class SinistroStatus(str, Enum):
    ABERTO = "aberto"
    EM_ANALISE = "em_analise"
    AGUARDANDO_DOCUMENTOS = "aguardando_documentos"
    EM_INVESTIGACAO = "em_investigacao"
    ENCERRADO = "encerrado"


class LiberacaoStatus(str, Enum):
    PENDENTE = "pendente"
    LIBERADO = "liberado"
    LIBERADO_COM_RESTRICAO = "liberado_com_restricao"
    NAO_LIBERADO = "nao_liberado"


class SaudeStatus(str, Enum):
    EM_ACOMPANHAMENTO = "em_acompanhamento"
    ENCAMINHADO = "encaminhado"
    RESOLVIDO = "resolvido"


class IncidentCreate(BaseModel):
    prefix_code: str = Field(..., min_length=1, max_length=10)
    incident_type: str
    description: Optional[str] = Field(None, max_length=500)
    line: Optional[str] = None
    direction: Optional[str] = None
    victim_status: Optional[str] = None
    unit: Optional[str] = Field(None, max_length=80)
    status: IncidentStatus = IncidentStatus.ABERTO


class IncidentUpdate(BaseModel):
    prefix_code: Optional[str] = Field(None, min_length=1, max_length=10)
    incident_type: Optional[str] = None
    description: Optional[str] = Field(None, max_length=500)
    line: Optional[str] = None
    direction: Optional[str] = None
    victim_status: Optional[str] = None
    status: Optional[IncidentStatus] = None


class IncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    prefix_code: str
    incident_type: str
    description: Optional[str] = None
    line: Optional[str] = None
    direction: Optional[str] = None
    victim_status: Optional[str] = None
    unit: Optional[str] = None
    status: IncidentStatus = IncidentStatus.ABERTO
    sst_forwarded: bool = False
    sst_forwarded_at: Optional[datetime] = None
    sst_forwarded_by: Optional[int] = None
    sst_forward_reason: Optional[str] = None
    sst_forward_priority: Optional[str] = None
    created_by: int
    created_at: datetime


class SwapCreate(BaseModel):
    schedule_line_id: Optional[int] = None
    schedule_date: Optional[date] = None
    vehicle_out: Optional[str] = Field(None, max_length=10)
    vehicle_in: Optional[str] = Field(None, max_length=10)
    driver_out: Optional[str] = Field(None, max_length=255)
    driver_in: Optional[str] = Field(None, max_length=255)
    reason: Optional[str] = Field(None, max_length=255)
    lines_covered: Optional[str] = Field(None, max_length=500)


class SwapUpdate(BaseModel):
    vehicle_out: Optional[str] = Field(None, min_length=1, max_length=10)
    vehicle_in: Optional[str] = Field(None, max_length=10)
    driver_out: Optional[str] = Field(None, max_length=255)
    driver_in: Optional[str] = Field(None, max_length=255)
    reason: Optional[str] = Field(None, max_length=255)
    lines_covered: Optional[str] = Field(None, max_length=500)


class SwapResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    schedule_line_id: Optional[int] = None
    schedule_date: Optional[date] = None
    unit: Optional[str] = None
    client_name: Optional[str] = None
    vehicle_out: str
    vehicle_in: Optional[str] = None
    driver_out: Optional[str] = None
    driver_in: Optional[str] = None
    reason: Optional[str] = None
    lines_covered: Optional[str] = None
    whatsapp_text: Optional[str] = None
    created_by: int
    created_at: datetime


class CountResponse(BaseModel):
    total: int


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    action: str
    resource: str
    resource_id: Optional[int] = None
    details: Optional[str] = None
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[int] = None
    created_at: datetime


class ScheduleLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    schedule_date: date
    unit: str
    prefix_code: str
    driver_name: str
    line_code: str
    direction: str
    client_name: str
    route_name: Optional[str] = None
    start_time: str
    end_time: str
    status: ScheduleLineStatus
    notes: Optional[str] = None
    confirmed_by: Optional[int] = None
    confirmed_at: Optional[datetime] = None
    source_sheet: Optional[str] = None
    source_row: Optional[int] = None
    source_col: Optional[int] = None
    created_by: int
    created_at: datetime


class ScheduleLineUpdate(BaseModel):
    prefix_code: Optional[str] = Field(None, min_length=1, max_length=20)
    driver_name: Optional[str] = Field(None, min_length=1, max_length=255)
    line_code: Optional[str] = Field(None, min_length=1, max_length=20)
    direction: Optional[str] = Field(None, max_length=20)
    client_name: Optional[str] = Field(None, min_length=1, max_length=120)
    route_name: Optional[str] = Field(None, max_length=255)
    start_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    end_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    status: Optional[ScheduleLineStatus] = None
    notes: Optional[str] = Field(None, max_length=500)


class ScheduleLineStatusChange(BaseModel):
    reason: Optional[str] = Field(None, max_length=255)


class ScheduleImportResponse(BaseModel):
    imported: int
    replaced: bool
    schedule_date: date


class ScheduleImportPreviewUnit(BaseModel):
    unit: str
    total: int


class ScheduleImportPreviewClient(BaseModel):
    client_name: str
    total: int


class ScheduleImportPreviewResponse(BaseModel):
    total: int
    units: list[ScheduleImportPreviewUnit]
    clients: list[ScheduleImportPreviewClient]
    warnings: list[str]


class ScheduleSummaryItem(BaseModel):
    unit: str
    total: int
    entrada: int
    saida: int
    pending: int
    confirmed: int
    changed: int
    cancelled: int


class ScheduleWhatsappResponse(BaseModel):
    schedule_date: date
    unit: str
    total: int
    text: str


class ChecklistCreate(BaseModel):
    garagem: str
    prefixo: str = Field(..., min_length=1, max_length=20)
    tipo: str  # AVULSO | MENSAL | DOCUMENTOS

    camera_frontal: Optional[str] = None
    camera_lateral_esq: Optional[str] = None
    camera_lateral_dir: Optional[str] = None
    camera_fadiga: Optional[str] = None
    camera_ip_motorista: Optional[str] = None
    camera_salao: Optional[str] = None

    tem_leitor_embarque: Optional[bool] = None
    ar_condicionado: Optional[bool] = None

    checklist_colocado: Optional[List[str]] = None
    crlv_status: Optional[str] = None
    emtu_status: Optional[str] = None
    artesp_status: Optional[str] = None
    emdec_status: Optional[str] = None
    bolsa_documentos: Optional[str] = None

    qr_code: Optional[bool] = None
    adesivo_leitor: Optional[bool] = None
    placa_senha_wifi: Optional[bool] = None

    wifi_status: Optional[List[str]] = None
    wifi_outro: Optional[str] = None

    observacoes: Optional[str] = None
    evidencias: Optional[List[str]] = None


class ChecklistUpdate(BaseModel):
    camera_frontal: Optional[str] = None
    camera_lateral_esq: Optional[str] = None
    camera_lateral_dir: Optional[str] = None
    camera_fadiga: Optional[str] = None
    camera_ip_motorista: Optional[str] = None
    camera_salao: Optional[str] = None

    tem_leitor_embarque: Optional[bool] = None
    ar_condicionado: Optional[bool] = None

    checklist_colocado: Optional[List[str]] = None
    crlv_status: Optional[str] = None
    emtu_status: Optional[str] = None
    artesp_status: Optional[str] = None
    emdec_status: Optional[str] = None
    bolsa_documentos: Optional[str] = None

    qr_code: Optional[bool] = None
    adesivo_leitor: Optional[bool] = None
    placa_senha_wifi: Optional[bool] = None

    wifi_status: Optional[List[str]] = None
    wifi_outro: Optional[str] = None

    # Conferência de Documentos
    crlv_emtu: Optional[str] = None
    crlv_emtu_qrcode: Optional[bool] = None
    artesp_doc: Optional[str] = None
    emdec_doc: Optional[str] = None

    observacoes: Optional[str] = None
    evidencias: Optional[List[str]] = None


class ChecklistResponse(BaseModel):
    id: int
    auditor_id: int
    auditor_name: str
    garagem: str
    prefixo: str
    tipo: str

    camera_frontal: Optional[str] = None
    camera_lateral_esq: Optional[str] = None
    camera_lateral_dir: Optional[str] = None
    camera_fadiga: Optional[str] = None
    camera_ip_motorista: Optional[str] = None
    camera_salao: Optional[str] = None

    tem_leitor_embarque: Optional[bool] = None
    ar_condicionado: Optional[bool] = None

    licenciamento: Optional[List[str]] = None  # legado
    licenciamento_outro: Optional[str] = None  # legado
    checklist_colocado: Optional[List[str]] = None
    cartao_artesp: Optional[str] = None  # legado
    crlv_status: Optional[str] = None
    emtu_status: Optional[str] = None
    artesp_status: Optional[str] = None
    emdec_status: Optional[str] = None
    bolsa_documentos: Optional[str] = None

    qr_code: Optional[bool] = None
    adesivo_leitor: Optional[bool] = None
    placa_senha_wifi: Optional[bool] = None

    wifi_status: Optional[List[str]] = None
    wifi_outro: Optional[str] = None

    # Conferência de Documentos
    crlv_emtu: Optional[str] = None
    crlv_emtu_qrcode: Optional[bool] = None
    artesp_doc: Optional[str] = None
    emdec_doc: Optional[str] = None

    observacoes: Optional[str] = None
    evidencias: Optional[List[str]] = None

    created_at: datetime


class SafetyVehicleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    prefix: str
    plate: Optional[str] = None
    unit: str
    active: bool
    public_token: str


class PublicSafetyChecklistItem(BaseModel):
    id: int
    section: str
    position: int
    item_text: str
    severity: str
    answer_type: str


class PublicSafetyChecklistResponse(BaseModel):
    vehicle: SafetyVehicleResponse
    template_id: int
    template_title: str
    template_version: int
    items: List[PublicSafetyChecklistItem]


class PublicSafetyAnswerCreate(BaseModel):
    item_id: int
    answer: str = Field(..., pattern="^(ok|not_ok|na)$")
    observation: Optional[str] = Field(None, max_length=500)


class PublicSafetySubmissionCreate(BaseModel):
    driver_name: str = Field(..., min_length=3, max_length=255)
    driver_registration: str = Field(..., min_length=1, max_length=60)
    declaration_accepted: bool
    answers: List[PublicSafetyAnswerCreate] = Field(..., min_length=1)


class PublicSafetySubmissionResponse(BaseModel):
    id: int
    overall_status: str
    maintenance_ticket_id: Optional[int] = None
    message: str


class SafetySubmissionListItem(BaseModel):
    id: int
    prefix: str
    unit: str
    driver_name: str
    driver_registration: str
    overall_status: str
    submitted_at: datetime


class SafetyTicketUpdate(BaseModel):
    status: str = Field(
        ..., pattern="^(open|validated|in_progress|resolved|cancelled)$"
    )
    manager_notes: Optional[str] = Field(None, max_length=500)


class SafetyTicketListItem(BaseModel):
    id: int
    unit: str
    prefix: str
    status: str
    blocking_items: List[str]
    source_submission_id: int
    created_at: datetime
    manager_notes: Optional[str] = None
    email_sent: bool = False
    sst_approved: bool = False
    sst_approved_notes: Optional[str] = None
    sst_approved_at: Optional[datetime] = None


class SSTApprovalRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=500)


class SafetyDashboardResponse(BaseModel):
    days_without_blocking: int
    active_blocking_tickets: int
    resolved_tickets: int
    submissions_today: int
    vehicles_without_checklist_today: int


# ── SST Schemas ────────────────────────────────────────────────────────────────


class SinistroCreate(BaseModel):
    unit: str = Field(..., max_length=80)
    empresa: Optional[str] = Field(None, max_length=120)
    prefixo: Optional[str] = Field(None, max_length=20)
    placa: Optional[str] = Field(None, max_length=20)
    modelo: Optional[str] = Field(None, max_length=120)
    frota: Optional[str] = Field(None, max_length=50)
    condutor_nome: Optional[str] = Field(None, max_length=255)
    condutor_matricula: Optional[str] = Field(None, max_length=60)
    condutor_cpf: Optional[str] = Field(None, max_length=15)
    condutor_tempo_empresa: Optional[str] = Field(None, max_length=50)
    data_ocorrencia: date
    hora_ocorrencia: Optional[str] = Field(None, max_length=5)
    local_ocorrencia: Optional[str] = Field(None, max_length=255)
    cidade: Optional[str] = Field(None, max_length=120)
    estado: Optional[str] = Field(None, max_length=2)
    tipo_sinistro: str = Field(..., max_length=80)
    descricao: Optional[str] = None
    danos_identificados: Optional[List[str]] = None
    evidencias: Optional[List[str]] = None
    envolvidos: Optional[List[str]] = None
    status: SinistroStatus = SinistroStatus.ABERTO


class SinistroUpdate(BaseModel):
    empresa: Optional[str] = Field(None, max_length=120)
    prefixo: Optional[str] = Field(None, max_length=20)
    placa: Optional[str] = Field(None, max_length=20)
    modelo: Optional[str] = Field(None, max_length=120)
    frota: Optional[str] = Field(None, max_length=50)
    condutor_nome: Optional[str] = Field(None, max_length=255)
    condutor_matricula: Optional[str] = Field(None, max_length=60)
    condutor_cpf: Optional[str] = Field(None, max_length=15)
    condutor_tempo_empresa: Optional[str] = Field(None, max_length=50)
    data_ocorrencia: Optional[date] = None
    hora_ocorrencia: Optional[str] = Field(None, max_length=5)
    local_ocorrencia: Optional[str] = Field(None, max_length=255)
    cidade: Optional[str] = Field(None, max_length=120)
    estado: Optional[str] = Field(None, max_length=2)
    tipo_sinistro: Optional[str] = Field(None, max_length=80)
    descricao: Optional[str] = None
    danos_identificados: Optional[List[str]] = None
    evidencias: Optional[List[str]] = None
    envolvidos: Optional[List[str]] = None
    status: Optional[SinistroStatus] = None


class SinistroResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    numero: Optional[str] = None
    unit: str
    empresa: Optional[str] = None
    prefixo: Optional[str] = None
    placa: Optional[str] = None
    modelo: Optional[str] = None
    frota: Optional[str] = None
    condutor_nome: Optional[str] = None
    condutor_matricula: Optional[str] = None
    condutor_cpf: Optional[str] = None
    condutor_tempo_empresa: Optional[str] = None
    data_ocorrencia: date
    hora_ocorrencia: Optional[str] = None
    local_ocorrencia: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    tipo_sinistro: str
    descricao: Optional[str] = None
    danos_identificados: Optional[List[str]] = None
    evidencias: Optional[List[str]] = None
    envolvidos: Optional[List[str]] = None
    status: SinistroStatus
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class SinistroHistoricoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sinistro_id: int
    user_id: int
    campo: Optional[str] = None
    valor_anterior: Optional[str] = None
    valor_novo: Optional[str] = None
    descricao: Optional[str] = None
    created_at: datetime


class SSTForwardRequest(BaseModel):
    reason: str = Field(..., max_length=500)
    priority: str = Field(..., pattern="^(baixa|media|alta|urgente)$")


class LiberacaoCreate(BaseModel):
    unit: str = Field(..., max_length=80)
    condutor_nome: str = Field(..., max_length=255)
    condutor_matricula: Optional[str] = Field(None, max_length=60)
    motivo_avaliacao: str = Field(..., max_length=100)
    documentacao_ok: Optional[bool] = None
    treinamentos_ok: Optional[bool] = None
    exames_ok: Optional[bool] = None
    aso_ok: Optional[bool] = None
    reciclagem_ok: Optional[bool] = None
    avaliacoes_sst_ok: Optional[bool] = None
    resultado: LiberacaoStatus = LiberacaoStatus.PENDENTE
    observacoes: Optional[str] = None
    restricoes: Optional[str] = None
    evidencias: Optional[List[str]] = None


class LiberacaoUpdate(BaseModel):
    condutor_nome: Optional[str] = Field(None, max_length=255)
    condutor_matricula: Optional[str] = Field(None, max_length=60)
    motivo_avaliacao: Optional[str] = Field(None, max_length=100)
    documentacao_ok: Optional[bool] = None
    treinamentos_ok: Optional[bool] = None
    exames_ok: Optional[bool] = None
    aso_ok: Optional[bool] = None
    reciclagem_ok: Optional[bool] = None
    avaliacoes_sst_ok: Optional[bool] = None
    resultado: Optional[LiberacaoStatus] = None
    observacoes: Optional[str] = None
    restricoes: Optional[str] = None
    evidencias: Optional[List[str]] = None


class LiberacaoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit: str
    condutor_nome: str
    condutor_matricula: Optional[str] = None
    motivo_avaliacao: str
    documentacao_ok: Optional[bool] = None
    treinamentos_ok: Optional[bool] = None
    exames_ok: Optional[bool] = None
    aso_ok: Optional[bool] = None
    reciclagem_ok: Optional[bool] = None
    avaliacoes_sst_ok: Optional[bool] = None
    resultado: LiberacaoStatus
    observacoes: Optional[str] = None
    restricoes: Optional[str] = None
    evidencias: Optional[List[str]] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class SaudeCreate(BaseModel):
    unit: str = Field(..., max_length=80)
    condutor_nome: str = Field(..., max_length=255)
    condutor_matricula: Optional[str] = Field(None, max_length=60)
    data_avaliacao: date
    tecnico_responsavel: Optional[str] = Field(None, max_length=255)
    qualidade_sono: Optional[str] = Field(None, max_length=20)
    fadiga: Optional[str] = Field(None, max_length=20)
    alimentacao: Optional[str] = Field(None, max_length=20)
    hidratacao: Optional[str] = Field(None, max_length=20)
    queixas_fisicas: Optional[str] = None
    estresse: Optional[str] = Field(None, max_length=20)
    ansiedade: Optional[str] = Field(None, max_length=20)
    conflitos_pessoais: Optional[str] = None
    observacoes_comportamentais: Optional[str] = None
    jornada_excessiva: Optional[bool] = None
    queixas_recorrentes: Optional[str] = None
    historico_ocorrencias: Optional[str] = None
    necessidade_treinamento: Optional[bool] = None
    plano_acao: Optional[str] = None
    encaminhamentos: Optional[List[str]] = None
    status: SaudeStatus = SaudeStatus.EM_ACOMPANHAMENTO


class SaudeUpdate(BaseModel):
    condutor_nome: Optional[str] = Field(None, max_length=255)
    condutor_matricula: Optional[str] = Field(None, max_length=60)
    data_avaliacao: Optional[date] = None
    tecnico_responsavel: Optional[str] = Field(None, max_length=255)
    qualidade_sono: Optional[str] = Field(None, max_length=20)
    fadiga: Optional[str] = Field(None, max_length=20)
    alimentacao: Optional[str] = Field(None, max_length=20)
    hidratacao: Optional[str] = Field(None, max_length=20)
    queixas_fisicas: Optional[str] = None
    estresse: Optional[str] = Field(None, max_length=20)
    ansiedade: Optional[str] = Field(None, max_length=20)
    conflitos_pessoais: Optional[str] = None
    observacoes_comportamentais: Optional[str] = None
    jornada_excessiva: Optional[bool] = None
    queixas_recorrentes: Optional[str] = None
    historico_ocorrencias: Optional[str] = None
    necessidade_treinamento: Optional[bool] = None
    plano_acao: Optional[str] = None
    encaminhamentos: Optional[List[str]] = None
    status: Optional[SaudeStatus] = None


class SaudeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit: str
    condutor_nome: str
    condutor_matricula: Optional[str] = None
    data_avaliacao: date
    tecnico_responsavel: Optional[str] = None
    qualidade_sono: Optional[str] = None
    fadiga: Optional[str] = None
    alimentacao: Optional[str] = None
    hidratacao: Optional[str] = None
    queixas_fisicas: Optional[str] = None
    estresse: Optional[str] = None
    ansiedade: Optional[str] = None
    conflitos_pessoais: Optional[str] = None
    observacoes_comportamentais: Optional[str] = None
    jornada_excessiva: Optional[bool] = None
    queixas_recorrentes: Optional[str] = None
    historico_ocorrencias: Optional[str] = None
    necessidade_treinamento: Optional[bool] = None
    plano_acao: Optional[str] = None
    encaminhamentos: Optional[List[str]] = None
    status: SaudeStatus
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class SSTDashboardResponse(BaseModel):
    total_veiculos: int
    total_motoristas: int
    sinistros_mes: int
    sinistros_ano: int
    sinistros_investigacao: int
    sinistros_encerrados: int
    condutores_bloqueados: int
    condutores_liberados: int
    checklists_hoje: int
    checklists_pendentes: int
    colisoes: int
    abalroamentos: int
    ocorrencias_sst: int
    top_condutores: List[dict]
    top_veiculos: List[dict]
