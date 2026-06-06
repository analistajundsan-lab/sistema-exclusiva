from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from config import settings
from models import User, UserRole, get_db

security = HTTPBearer(auto_error=False)

UNRESTRICTED_UNIT_ROLES = {
    UserRole.ADMIN,
    UserRole.GERENTE,
    UserRole.SUPERVISAO,
    UserRole.SUPERVISOR,
    UserRole.ENGENHEIRO_SEGURANCA,
}


COMMON_PASSWORDS = {
    "12345678",
    "123456789",
    "1234567890",
    "123456789012",
    "senha123",
    "senha1234",
    "admin123",
    "admin1234",
    "password",
    "password123",
    "qwertyuiop",
    "exclusiva123",
}


def validate_password_policy(password: str, user: "User | None" = None) -> None:
    """Politica de senha aplicada no servidor (fonte de verdade).

    - minimo de 12 caracteres;
    - bloqueia senhas comuns;
    - bloqueia senha que contenha dados do proprio usuario (email/nome).
    """
    if len(password) < 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A senha deve ter pelo menos 12 caracteres",
        )
    if len(password) > 128:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A senha e muito longa (maximo 128 caracteres)",
        )
    if password.lower() in COMMON_PASSWORDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha muito comum. Escolha uma senha mais forte.",
        )
    if user is not None:
        lowered = password.lower()
        email_local = (user.email or "").split("@")[0].lower()
        if email_local and len(email_local) >= 3 and email_local in lowered:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A senha nao pode conter dados do usuario",
            )


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def create_tokens(user: User) -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    access_payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "type": "access",
        "exp": now + timedelta(minutes=settings.JWT_EXPIRATION_MINUTES),
    }
    refresh_payload = {
        "sub": str(user.id),
        "type": "refresh",
        "exp": now + timedelta(days=7),
    }

    access_token = jwt.encode(
        access_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    refresh_token = jwt.encode(
        refresh_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )

    return access_token, refresh_token


def user_allowed_units(user: User) -> list[str] | None:
    if getattr(user, "has_full_access", False):
        return None
    if user.role in UNRESTRICTED_UNIT_ROLES:
        return None

    units: list[str] = []
    if user.units:
        units.extend(item.strip() for item in user.units.split(",") if item.strip())
    if user.unit and user.unit.strip() not in units:
        units.append(user.unit.strip())
    return units


def ensure_unit_access(user: User, unit: str | None) -> None:
    if not unit:
        return
    allowed_units = user_allowed_units(user)
    if allowed_units is None:
        return
    if not allowed_units:
        return
    if unit not in allowed_units:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para esta unidade",
        )


def apply_user_unit_scope(query, unit_column, user: User):
    allowed_units = user_allowed_units(user)
    if allowed_units is None:
        return query
    if not allowed_units:
        return query
    return query.filter(unit_column.in_(allowed_units))


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    raw_token = credentials.credentials if credentials else None
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    try:
        payload = jwt.decode(
            raw_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") not in (None, "access"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        user_id: int = int(payload.get("sub"))
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    allowed_when_temporary = {"/auth/me", "/auth/change-password"}
    if user.must_change_password and request.url.path not in allowed_when_temporary:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Troca de senha obrigatoria antes de continuar",
        )

    return user


def require_role(*roles: UserRole):
    """Retorna função de dependência que exige um dos papéis listados."""

    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        if getattr(current_user, "has_full_access", False):
            return current_user
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso restrito. Papéis aceitos: {[r.value for r in roles]}",
            )
        return current_user

    return dependency
