from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from config import settings
from models import User, UserRole, get_db

security = HTTPBearer()


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


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

    access_token = jwt.encode(access_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    refresh_token = jwt.encode(refresh_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    return access_token, refresh_token


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(
            credentials.credentials, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
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
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso restrito. Papéis aceitos: {[r.value for r in roles]}",
            )
        return current_user

    return dependency
