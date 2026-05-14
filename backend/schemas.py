from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from datetime import date, datetime
from typing import Optional
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


class IncidentCreate(BaseModel):
    prefix_code: str = Field(..., min_length=1, max_length=10)
    incident_type: str
    description: Optional[str] = Field(None, max_length=500)
    line: Optional[str] = None
    direction: Optional[str] = None
    victim_status: Optional[str] = None
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
    status: IncidentStatus = IncidentStatus.ABERTO
    created_by: int
    created_at: datetime


class SwapCreate(BaseModel):
    schedule_line_id: Optional[int] = None
    vehicle_out: str = Field(..., min_length=1, max_length=10)
    vehicle_in: str = Field(..., min_length=1, max_length=10)
    reason: Optional[str] = Field(None, max_length=255)
    lines_covered: Optional[str] = Field(None, max_length=500)


class SwapUpdate(BaseModel):
    vehicle_out: Optional[str] = Field(None, min_length=1, max_length=10)
    vehicle_in: Optional[str] = Field(None, min_length=1, max_length=10)
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
    vehicle_in: str
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
    user_id: int
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
