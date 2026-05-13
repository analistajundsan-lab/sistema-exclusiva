from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/sistema_exclusiva"
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 30
    API_TITLE: str = "Sistema Exclusiva Operacional"
    API_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    EXPOSE_METRICS: bool = True
    ALLOWED_ORIGINS: list = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://192.168.15.14:5174",
        "http://localhost:3000",
        "https://sistema-exclusiva-pied.vercel.app",
    ]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("["):
                import json
                return json.loads(value)
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def reject_default_secret_in_production(self):
        if self.ENVIRONMENT == "production" and self.JWT_SECRET_KEY == "your-secret-key-change-in-production":
            raise ValueError("JWT_SECRET_KEY precisa ser definido em producao")
        return self

settings = Settings()
