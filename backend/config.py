import json

from pydantic import computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_ORIGINS = ",".join(
    [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "https://sistema-exclusiva-pied.vercel.app",
        "https://sistema-exclusiva.fly.dev",
    ]
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = (
        "postgresql://postgres:postgres@localhost:5432/sistema_exclusiva"
    )
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    # URL completa do Redis (ex.: rediss://default:senha@host:port). Quando
    # definida, tem precedencia sobre REDIS_HOST/PORT e habilita senha+TLS
    # (Redis gerenciado/Upstash). Vazio = usa host/port simples (dev local).
    REDIS_URL: str = ""
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    # Pepper para HMAC do hash de CPF. Vazio = mantem hash legado (SHA-256
    # truncado) para compatibilidade. Definir em producao ativa o HMAC e o
    # rehash-on-login dos usuarios existentes.
    CPF_HASH_PEPPER: str = ""
    JWT_EXPIRATION_MINUTES: int = 480
    API_TITLE: str = "Sistema Exclusiva Operacional"
    API_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "https://sistema-exclusiva-pied.vercel.app"
    LOG_LEVEL: str = "INFO"
    EXPOSE_METRICS: bool = True
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "analistajundsan@gmail.com"
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # Web Push (VAPID). Vazio = push desabilitado (app continua funcionando).
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:analistajundsan@gmail.com"
    # Antecedencia (min) em que a linha pendente dispara o push de proximidade.
    PUSH_LEAD_MINUTES: int = 20

    # str field avoids pydantic-settings v2 JSON-parsing a list before validators run
    ALLOWED_ORIGINS_RAW: str = _DEFAULT_ORIGINS
    ALLOWED_ORIGIN_REGEX: str | None = None

    @computed_field  # type: ignore[misc]
    @property
    def ALLOWED_ORIGINS(self) -> list:
        v = self.ALLOWED_ORIGINS_RAW.strip()
        if not v:
            origins = _DEFAULT_ORIGINS.split(",")
        elif v.startswith("["):
            try:
                origins = json.loads(v)
            except json.JSONDecodeError:
                origins = [item.strip() for item in v.split(",") if item.strip()]
        else:
            origins = [item.strip() for item in v.split(",") if item.strip()]

        # Em producao, nunca aceitar origens locais (localhost/127.0.0.1).
        if self.ENVIRONMENT == "production":
            origins = [
                o for o in origins if "localhost" not in o and "127.0.0.1" not in o
            ]
        return origins

    @model_validator(mode="after")
    def reject_default_secret_in_production(self):
        if (
            self.ENVIRONMENT == "production"
            and self.JWT_SECRET_KEY == "your-secret-key-change-in-production"
        ):
            raise ValueError("JWT_SECRET_KEY precisa ser definido em producao")
        return self


settings = Settings()
