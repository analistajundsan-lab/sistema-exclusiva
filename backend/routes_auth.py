from fastapi import APIRouter, HTTPException, status, Depends, Header, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from jose import JWTError, jwt
import hashlib
import hmac
import logging
import re
import secrets
import pyotp
from typing import List
from models import User, get_db
from schemas import (
    LoginRequest,
    PasswordChange,
    PasswordReset,
    PasswordResetRequest,
    MfaSetupResponse,
    MfaEnableRequest,
    MfaDisableRequest,
    MfaVerifyRequest,
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
    validate_password_policy,
    revoke_all_user_sessions,
    hash_token,
)
from config import settings
from rate_limit import rate_limit, get_remaining_requests
from metrics_middleware import auth_metrics, rate_limit_metric
from models import AuditLog, PasswordResetToken, UserSession, UserRole
import email_service
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/auth", tags=["auth"])

RESET_TOKEN_TTL_MINUTES = 30
logger = logging.getLogger(__name__)


def _hash_cpf_legacy(cpf: str) -> str:
    cpf_clean = re.sub(r"\D", "", cpf)
    return hashlib.sha256(cpf_clean.encode()).hexdigest()[:16]


def _hash_cpf_secure(cpf: str) -> str:
    cpf_clean = re.sub(r"\D", "", cpf)
    secret = settings.CPF_HASH_PEPPER.encode("utf-8")
    return hmac.new(secret, cpf_clean.encode("utf-8"), hashlib.sha256).hexdigest()


def hash_cpf(cpf: str) -> str:
    """Hash canonico para NOVOS registros.

    Usa HMAC-SHA-256 com pepper quando CPF_HASH_PEPPER esta definido; caso
    contrario mantem o hash legado (compatibilidade).
    """
    if settings.CPF_HASH_PEPPER:
        return _hash_cpf_secure(cpf)
    return _hash_cpf_legacy(cpf)


def find_user_by_cpf(db: Session, cpf: str) -> tuple["User | None", bool]:
    """Localiza usuario por CPF tentando o hash seguro e depois o legado.

    Retorna (user, needs_rehash) onde needs_rehash indica que o usuario foi
    encontrado pelo hash legado e deve ser migrado para o formato seguro.
    """
    if settings.CPF_HASH_PEPPER:
        secure = _hash_cpf_secure(cpf)
        user = db.query(User).filter(User.cpf_hash == secure).first()
        if user:
            return user, False
        legacy = _hash_cpf_legacy(cpf)
        user = db.query(User).filter(User.cpf_hash == legacy).first()
        return user, bool(user)
    legacy = _hash_cpf_legacy(cpf)
    return db.query(User).filter(User.cpf_hash == legacy).first(), False


def hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 dias


def set_refresh_cookie(response: Response, token: str) -> None:
    """Define o refresh token como cookie HttpOnly.

    Secure apenas em producao (em dev HTTP/localhost o navegador descartaria
    cookies Secure). SameSite=Lax + mesma origem (proxy /api) protege contra
    CSRF nas rotas que leem o cookie.
    """
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")


def _extract_refresh_token(request: Request, authorization: str | None) -> str | None:
    """Le o refresh token do header Authorization (se enviado) ou do cookie.

    Em producao o frontend NAO envia header no /auth/refresh (a chamada usa
    axios cru, sem o interceptor), entao o cookie HttpOnly e usado. O header
    permanece como fallback/compatibilidade.
    """
    if authorization:
        try:
            scheme, token = authorization.split(" ", 1)
            if scheme.lower() == "bearer" and token:
                return token
        except ValueError:
            pass
    return request.cookies.get(REFRESH_COOKIE_NAME)


MFA_TOKEN_TTL_MINUTES = 5
MFA_ISSUER = "Sistema Exclusiva"


def create_mfa_token(user_id: int) -> str:
    """Token curto que prova 'senha ok, falta o 2o fator'."""
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id),
            "type": "mfa",
            "exp": now + timedelta(minutes=MFA_TOKEN_TTL_MINUTES),
        },
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    # valid_window=1 tolera leve dessincronizacao de relogio (+-30s).
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def get_client_ip(request: Request) -> str:
    if x_forwarded_for := request.headers.get("x-forwarded-for"):
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login")
async def login(
    request: LoginRequest,
    req: Request,
    response: Response,
    db: Session = Depends(get_db),
):
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

        user, needs_rehash = find_user_by_cpf(db, request.cpf)

        if not user or not verify_password(request.password, user.password_hash):
            await auth_metrics(False)
            # Auditoria de falha sem dados sensiveis (sem CPF/senha).
            db.add(
                AuditLog(
                    user_id=user.id if user else None,
                    action="LOGIN_FAILED",
                    resource="auth",
                    details=client_ip,
                )
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas"
            )

        if not user.is_active:
            await auth_metrics(False)
            db.add(
                AuditLog(
                    user_id=user.id,
                    action="LOGIN_FAILED_INACTIVE",
                    resource="auth",
                    details=client_ip,
                )
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo"
            )

        # Rehash-on-login: migra CPF legado para HMAC quando pepper ativo.
        if needs_rehash:
            user.cpf_hash = _hash_cpf_secure(request.cpf)
            db.add(user)
            db.commit()

        # Se o usuario tem MFA ativo, exige o 2o fator antes de emitir tokens.
        if user.mfa_enabled:
            db.add(
                AuditLog(
                    user_id=user.id,
                    action="LOGIN_MFA_CHALLENGE",
                    resource="auth",
                    resource_id=user.id,
                    details=client_ip,
                )
            )
            db.commit()
            await auth_metrics(True)
            return {"mfa_required": True, "mfa_token": create_mfa_token(user.id)}

        db.add(
            AuditLog(
                user_id=user.id,
                action="LOGIN_SUCCESS",
                resource="auth",
                resource_id=user.id,
                details=client_ip,
            )
        )
        access_token, refresh_token = create_tokens(user, db=db, request=req)
        set_refresh_cookie(response, refresh_token)
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

    validate_password_policy(request.password)

    existing, _ = find_user_by_cpf(db, request.cpf)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="CPF já cadastrado"
        )

    user = User(
        cpf_hash=hash_cpf(request.cpf),
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
    validate_password_policy(request.password)
    existing, _ = find_user_by_cpf(db, request.cpf)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="CPF ja cadastrado"
        )

    user = User(
        cpf_hash=hash_cpf(request.cpf),
        email=request.email,
        name=request.name,
        password_hash=hash_password(request.password),
        role=request.role,
        unit=request.unit,
        units=request.units,
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
    req: Request,
    response: Response,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido"
    )
    token = _extract_refresh_token(req, authorization)
    if not token:
        raise invalid
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        if payload.get("type") not in (None, "refresh"):
            raise ValueError
        user_id = int(payload.get("sub"))
        jti_raw = payload.get("jti")
        jti = int(jti_raw) if jti_raw is not None else None
    except (JWTError, ValueError, AttributeError):
        raise invalid

    user = (
        db.query(User).filter(User.id == user_id, User.is_active == True).first()
    )  # noqa: E712
    if not user:
        raise invalid

    now = datetime.now(timezone.utc)

    if jti is not None:
        # Token com sessao server-side: valida, revoga (rotacao) e reemite.
        session = (
            db.query(UserSession)
            .filter(
                UserSession.id == jti,
                UserSession.user_id == user.id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
            .first()
        )
        if not session or session.refresh_token_hash != hash_token(token):
            # Token de uma sessao revogada/expirada/desconhecida ou reutilizado.
            raise invalid
        session.revoked_at = now
        session.last_used_at = now
        db.add(session)
        db.commit()

    # Tokens legados (sem jti) sao aceitos uma vez e migrados para sessao.
    access_token, refresh_token = create_tokens(user, db=db, request=req)
    set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout")
async def logout(
    req: Request,
    response: Response,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """Revoga a sessao associada ao refresh token e limpa o cookie.

    Resposta sempre 200 para nao vazar validade do token.
    """
    clear_refresh_cookie(response)
    token = _extract_refresh_token(req, authorization)
    if not token:
        return {"message": "Logout efetuado"}
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        jti_raw = payload.get("jti")
        jti = int(jti_raw) if jti_raw is not None else None
        sub = payload.get("sub")
        user_id = int(sub) if sub is not None else None
    except (JWTError, ValueError, AttributeError):
        return {"message": "Logout efetuado"}

    if jti is not None:
        now = datetime.now(timezone.utc)
        (
            db.query(UserSession)
            .filter(UserSession.id == jti, UserSession.revoked_at.is_(None))
            .update({UserSession.revoked_at: now}, synchronize_session=False)
        )
        db.add(
            AuditLog(
                user_id=user_id,
                action="LOGOUT",
                resource="auth",
                resource_id=user_id,
            )
        )
        db.commit()

    return {"message": "Logout efetuado"}


@router.post("/mfa/verify", response_model=TokenResponse)
async def mfa_verify(
    body: MfaVerifyRequest,
    req: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Segunda etapa do login: valida o codigo TOTP e emite os tokens."""
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Codigo invalido ou expirado"
    )
    try:
        payload = jwt.decode(
            body.mfa_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "mfa":
            raise invalid
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError, AttributeError):
        raise invalid

    user = (
        db.query(User).filter(User.id == user_id, User.is_active == True).first()
    )  # noqa: E712
    if not user or not user.mfa_enabled:
        raise invalid

    if not verify_totp(user.mfa_secret, body.code):
        db.add(
            AuditLog(
                user_id=user.id,
                action="LOGIN_MFA_FAILED",
                resource="auth",
                details=get_client_ip(req),
            )
        )
        db.commit()
        raise invalid

    db.add(
        AuditLog(
            user_id=user.id,
            action="LOGIN_SUCCESS",
            resource="auth",
            resource_id=user.id,
            details=get_client_ip(req),
        )
    )
    access_token, refresh_token = create_tokens(user, db=db, request=req)
    set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/mfa/setup", response_model=MfaSetupResponse)
async def mfa_setup(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gera (ou regenera) um segredo TOTP pendente e devolve o otpauth URI."""
    if current_user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MFA ja esta ativo. Desative antes de gerar um novo segredo.",
        )
    secret = pyotp.random_base32()
    current_user.mfa_secret = secret
    db.add(current_user)
    db.commit()
    otpauth_uri = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.email or current_user.name,
        issuer_name=MFA_ISSUER,
    )
    return MfaSetupResponse(secret=secret, otpauth_uri=otpauth_uri)


@router.post("/mfa/enable")
async def mfa_enable(
    body: MfaEnableRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirma o codigo do app autenticador e ativa o MFA."""
    if current_user.mfa_enabled:
        return {"message": "MFA ja estava ativo"}
    if not current_user.mfa_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inicie a configuracao do MFA antes de ativar.",
        )
    if not verify_totp(current_user.mfa_secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Codigo invalido"
        )
    current_user.mfa_enabled = True
    db.add(current_user)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="MFA_ENABLED",
            resource="user",
            resource_id=current_user.id,
        )
    )
    db.commit()
    return {"message": "MFA ativado com sucesso"}


@router.post("/mfa/disable")
async def mfa_disable(
    body: MfaDisableRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Desativa o MFA exigindo um codigo valido do app autenticador."""
    if not current_user.mfa_enabled:
        return {"message": "MFA ja estava desativado"}
    if not verify_totp(current_user.mfa_secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Codigo invalido"
        )
    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    db.add(current_user)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="MFA_DISABLED",
            resource="user",
            resource_id=current_user.id,
        )
    )
    db.commit()
    return {"message": "MFA desativado"}


@router.post("/password-reset-request")
async def request_password_reset(
    body: PasswordResetRequest, req: Request, db: Session = Depends(get_db)
):
    # Resposta sempre identica para evitar enumeracao de e-mails.
    generic_response = {
        "message": "Se o e-mail estiver cadastrado, enviaremos as instruções para redefinição de senha."
    }

    email = body.email.strip().lower()
    client_ip = get_client_ip(req)
    user_agent = req.headers.get("user-agent", "")[:255]
    email_key = hashlib.sha256(email.encode("utf-8")).hexdigest()[:16]

    # Rate limit por IP e por e-mail (hash) — sem revelar existencia da conta.
    allowed_ip = await rate_limit(
        f"pwd_reset_ip:{client_ip}", max_requests=5, window_seconds=3600
    )
    allowed_email = await rate_limit(
        f"pwd_reset_email:{email_key}", max_requests=3, window_seconds=3600
    )
    if not allowed_ip or not allowed_email:
        await rate_limit_metric("/auth/password-reset-request")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas solicitações. Tente novamente em 1 hora.",
        )

    user = (
        db.query(User)
        .filter(func.lower(User.email) == email, User.is_active == True)  # noqa: E712
        .first()
    )
    if not user:
        return generic_response

    now = datetime.now(timezone.utc)

    # Invalida tokens anteriores ainda validos do mesmo usuario.
    (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .update({PasswordResetToken.used_at: now}, synchronize_session=False)
    )

    raw_token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw_token),
            expires_at=now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
            created_ip=client_ip,
            user_agent=user_agent,
        )
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="PASSWORD_RESET_REQUESTED",
            resource="user",
            resource_id=user.id,
        )
    )
    db.commit()

    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw_token}"
    try:
        email_service.send_password_reset_email(
            to_email=user.email,
            user_name=user.name,
            reset_url=reset_url,
        )
    except Exception as exc:  # nao vaza detalhe; nao loga token
        logger.error("Falha ao enviar e-mail de reset: %s", exc)

    return generic_response


@router.post("/password-reset")
async def reset_password(
    body: PasswordReset, req: Request, db: Session = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    token_hash = hash_reset_token(body.token)

    reset_record = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .first()
    )

    if not reset_record or not hmac.compare_digest(reset_record.token_hash, token_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido ou expirado",
        )

    user = db.query(User).filter(User.id == reset_record.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido ou expirado",
        )

    validate_password_policy(body.new_password, user=user)

    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    user.password_changed_at = now
    reset_record.used_at = now

    # Reset de senha revoga todas as sessoes ativas do usuario.
    revoke_all_user_sessions(db, user.id)

    db.add(
        AuditLog(
            user_id=user.id,
            action="PASSWORD_RESET_COMPLETED",
            resource="user",
            resource_id=user.id,
        )
    )
    db.commit()

    return {"message": "Senha redefinida com sucesso"}


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

    validate_password_policy(body.new_password, user=current_user)
    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    current_user.password_changed_at = datetime.now(timezone.utc)
    # Troca de senha revoga as demais sessoes ativas do usuario.
    revoke_all_user_sessions(db, current_user.id)
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
    # Desativacao revoga imediatamente as sessoes ativas do usuario.
    if not user.is_active:
        revoke_all_user_sessions(db, user.id)
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
    """Permite apagar/recuperar historico somente ao super administrador."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")
    if can_delete_history and not user.is_super_admin:
        raise HTTPException(
            status_code=422,
            detail="Historico pode ser apagado apenas pelo super administrador",
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
        if not body.is_active:
            revoke_all_user_sessions(db, user.id)
    if body.can_delete_history is not None:
        if body.can_delete_history and not user.is_super_admin:
            raise HTTPException(
                status_code=422,
                detail="Histórico pode ser apagado apenas pelo super administrador",
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
