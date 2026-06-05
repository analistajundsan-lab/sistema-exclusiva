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
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 480
    API_TITLE: str = "Sistema Exclusiva Operacional"
    API_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    EXPOSE_METRICS: bool = True
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "analistajundsan@gmail.com"
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # str field avoids pydantic-settings v2 JSON-parsing a list before validators run
    ALLOWED_ORIGINS_RAW: str = _DEFAULT_ORIGINS
    ALLOWED_ORIGIN_REGEX: str | None = None

    @computed_field  # type: ignore[misc]
    @property
    def ALLOWED_ORIGINS(self) -> list:
        v = self.ALLOWED_ORIGINS_RAW.strip()
        if not v:
            return _DEFAULT_ORIGINS.split(",")
        if v.startswith("["):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                pass
        return [item.strip() for item in v.split(",") if item.strip()]

    @model_validator(mode="after")
    def reject_default_secret_in_production(self):
        if (
            self.ENVIRONMENT == "production"
            and self.JWT_SECRET_KEY == "your-secret-key-change-in-production"
        ):
            raise ValueError("JWT_SECRET_KEY precisa ser definido em producao")
        return self


settings = Settings()
