from fastapi import APIRouter, HTTPException, status, Depends, Header, Request
from sqlalchemy.orm import Session
from jose import JWTError, jwt
import hashlib
import re
from typing import List
from models import User, get_db
from schemas import (
    LoginRequest,
    PasswordChange,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserProfileUpdate,
    UserAdminUpdate,
)
from auth import (
    hash_password,
    verify_password,
    create_tokens,
    get_current_user,
    require_role,
)
from config import settings
from rate_limit import rate_limit, get_remaining_requests
from metrics_middleware import auth_metrics, rate_limit_metric
from models import AuditLog, UserRole
from datetime import datetime, timezone

router = APIRouter(prefix="/auth", tags=["auth"])
VINICIUS_CPF = "41637531842"


def hash_cpf(cpf: str) -> str:
    cpf_clean = re.sub(r"\D", "", cpf)
    return hashlib.sha256(cpf_clean.encode()).hexdigest()[:16]


def get_client_ip(request: Request) -> str:
    if x_forwarded_for := request.headers.get("x-forwarded-for"):
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, req: Request, db: Session = Depends(get_db)):
    import logging

    logger = logging.getLogger(__name__)
    client_ip = get_client_ip(req)

    try:
        if not await rate_limit(
            f"login:{client_ip}", max_requests=5, window_seconds=60
        ):
            await rate_limit_metric("/auth/login")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Muitas tentativas de login. Tente novamente em 1 minuto.",
            )

        cpf_hash = hash_cpf(request.cpf)
        user = db.query(User).filter(User.cpf_hash == cpf_hash).first()

        if not user or not verify_password(request.password, user.password_hash):
            await auth_metrics(False)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas"
            )

        if not user.is_active:
            await auth_metrics(False)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo"
            )

        access_token, refresh_token = create_tokens(user)
        await auth_metrics(True)
        return TokenResponse(access_token=access_token, refresh_token=refresh_token)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {type(e).__name__}: {e}", exc_info=True)
        raise


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/register", response_model=UserResponse)
async def register(request: UserCreate, req: Request, db: Session = Depends(get_db)):
    if settings.ENVIRONMENT == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cadastro publico desabilitado em producao",
        )

    client_ip = get_client_ip(req)

    if not await rate_limit(
        f"register:{client_ip}", max_requests=10, window_seconds=3600
    ):
        await rate_limit_metric("/auth/register")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitos registros do mesmo IP. Tente novamente mais tarde.",
        )

    cpf_hash = hash_cpf(request.cpf)

    existing = db.query(User).filter(User.cpf_hash == cpf_hash).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="CPF já cadastrado"
        )

    user = User(
        cpf_hash=cpf_hash,
        email=request.email,
        name=request.name,
        password_hash=hash_password(request.password),
        role=UserRole.OPERATOR,
        must_change_password=request.must_change_password,
    )
    db.add(user)
    db.flush()  # garante user.id antes do AuditLog
    db.add(AuditLog(user_id=user.id, action="REGISTER", resource="user"))
    db.commit()
    db.refresh(user)
    return user


@router.post("/users", response_model=UserResponse)
async def create_user_by_admin(
    request: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    cpf_hash = hash_cpf(request.cpf)
    existing = db.query(User).filter(User.cpf_hash == cpf_hash).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="CPF ja cadastrado"
        )

    user = User(
        cpf_hash=cpf_hash,
        email=request.email,
        name=request.name,
        password_hash=hash_password(request.password),
        role=request.role,
        must_change_password=True,
        can_delete_history=False,
    )
    db.add(user)
    db.flush()
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="ADMIN_CREATE_USER",
            resource="user",
            resource_id=user.id,
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    try:
        scheme, token = authorization.split(" ", 1)
        if scheme.lower() != "bearer":
            raise ValueError
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        if payload.get("type") not in (None, "refresh"):
            raise ValueError
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido"
        )

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado"
        )

    access_token, refresh_token = create_tokens(user)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/password-reset-request")
async def request_password_reset(
    email: str, req: Request, db: Session = Depends(get_db)
):
    client_ip = get_client_ip(req)

    if not await rate_limit(
        f"pwd_reset:{client_ip}", max_requests=3, window_seconds=3600
    ):
        await rate_limit_metric("/auth/password-reset-request")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas solicitações. Tente novamente em 1 hora.",
        )

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"message": "Se o email existir, um link de reset será enviado"}

    return {"message": "Link de reset enviado para o email"}


@router.post("/password-reset")
async def reset_password(token: str, new_password: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id = int(payload.get("sub"))
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado"
        )

    user.password_hash = hash_password(new_password)
    db.add(AuditLog(user_id=user_id, action="PASSWORD_RESET", resource="user"))
    db.commit()

    return {"message": "Senha alterada com sucesso"}


@router.post("/change-password")
async def change_password(
    body: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha atual invalida"
        )

    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    current_user.password_changed_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CHANGE_PASSWORD",
            resource="user",
            resource_id=current_user.id,
        )
    )
    db.commit()
    return {"message": "Senha alterada com sucesso"}


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Usuário atualiza seu próprio perfil (display_name, foto)."""
    if body.display_name is not None:
        current_user.display_name = body.display_name
    if body.photo_url is not None:
        current_user.photo_url = body.photo_url
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="UPDATE_PROFILE",
            resource="user",
            resource_id=current_user.id,
        )
    )
    db.commit()
    db.refresh(current_user)
    return current_user


# ── Admin: gestão de usuários ─────────────────────────────────────────────────


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Lista todos os usuários (somente admin)."""
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}/toggle", response_model=UserResponse)
async def toggle_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Ativa ou desativa um usuário (somente admin)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400, detail="Não é possível desativar o próprio usuário"
        )
    user.is_active = not user.is_active
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="TOGGLE_USER",
            resource="user",
            resource_id=user_id,
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def change_role(
    user_id: int,
    role: UserRole,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Altera o papel de um usuário (somente admin)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user.role = role
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CHANGE_ROLE",
            resource="user",
            resource_id=user_id,
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/history-permission", response_model=UserResponse)
async def change_history_permission(
    user_id: int,
    can_delete_history: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Permite apagar/recuperar historico somente ao perfil Vinicius."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")
    if can_delete_history and user.cpf_hash != hash_cpf(VINICIUS_CPF):
        raise HTTPException(
            status_code=422,
            detail="Historico pode ser apagado apenas pelo perfil Vinicius",
        )

    user.can_delete_history = can_delete_history
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="CHANGE_HISTORY_PERMISSION",
            resource="user",
            resource_id=user_id,
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def admin_update_user(
    user_id: int,
    body: UserAdminUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Admin atualiza qualquer campo de um usuário (nome, email, unidade, role, status)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if body.name is not None:
        user.name = body.name
    if body.email is not None:
        conflict = (
            db.query(User).filter(User.email == body.email, User.id != user_id).first()
        )
        if conflict:
            raise HTTPException(
                status_code=400, detail="E-mail já está em uso por outro usuário"
            )
        user.email = body.email
    if body.unit is not None:
        user.unit = body.unit
    if body.units is not None:
        user.units = body.units
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        if not body.is_active and user.id == current_user.id:
            raise HTTPException(
                status_code=400, detail="Não é possível desativar o próprio usuário"
            )
        user.is_active = body.is_active
    if body.can_delete_history is not None:
        if body.can_delete_history and user.cpf_hash != hash_cpf(VINICIUS_CPF):
            raise HTTPException(
                status_code=422,
                detail="Histórico pode ser apagado apenas pelo perfil Vinicius",
            )
        user.can_delete_history = body.can_delete_history
    if body.must_change_password is not None:
        user.must_change_password = body.must_change_password

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="ADMIN_UPDATE_USER",
            resource="user",
            resource_id=user_id,
        )
    )
    db.commit()
    db.refresh(user)
    return user
