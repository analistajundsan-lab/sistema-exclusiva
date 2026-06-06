from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import time
from sqlalchemy import text
from config import settings
from models import Base, SessionLocal, engine
from routes_auth import router as auth_router
from routes_incidents import router as incidents_router
from routes_swaps import router as swaps_router
from routes_schedule import router as schedule_router
from routes_audit import router as audit_router
from routes_checklist import router as checklist_router
from routes_safety import router as safety_router
from routes_sst import router as sst_router
from rate_limit import init_redis
from metrics_middleware import metrics_middleware
from prometheus_client import make_asgi_app

logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

try:
    Base.metadata.create_all(bind=engine)
    logging.getLogger(__name__).info("DB: create_all concluido com sucesso")
except Exception as _exc:
    logging.getLogger(__name__).error("DB: create_all FALHOU: %s", _exc)

docs_enabled = settings.ENVIRONMENT != "production"

app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="Sistema Operacional de Frota - Exclusiva Turismo",
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Garante que erros 500 não-tratados incluam o header CORS.

    Sem este handler, o Starlette propaga a exceção até o uvicorn, que gera
    a resposta 500 ANTES de passar pelo CORSMiddleware — fazendo o browser
    bloquear a resposta por CORS violation e o axios reportar !status
    (sem resposta), o que no frontend vira "Sem conexão com o servidor".
    """
    logger.error(
        "Erro nao tratado em %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    response = JSONResponse(
        status_code=500,
        content={"detail": "Erro interno do servidor"},
    )
    # Adiciona CORS para que o browser consiga ler a resposta de erro
    origin = request.headers.get("origin", "")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


if settings.EXPOSE_METRICS:
    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)


@app.middleware("http")
async def add_metrics(request: Request, call_next):
    return await metrics_middleware(request, call_next)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; frame-ancestors 'none'"
    )
    if settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


@app.middleware("http")
async def add_request_id_and_timing(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000)
    response.headers["X-Response-Time"] = f"{duration_ms}ms"
    logger.info(
        "%s %s %d %dms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=settings.ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_redis()
    try:
        from bootstrap_mvp import main as bootstrap_main

        bootstrap_main()
        logger.info("Bootstrap concluido com sucesso")
    except Exception as e:
        logger.error("Bootstrap falhou (nao critico): %s", e)

    try:
        from maintenance import cleanup_security_tables

        _db = SessionLocal()
        try:
            cleanup_security_tables(_db)
        finally:
            _db.close()
    except Exception as e:
        logger.error("Limpeza de seguranca falhou (nao critico): %s", e)


app.include_router(auth_router)
app.include_router(incidents_router)
app.include_router(swaps_router)
app.include_router(schedule_router)
app.include_router(audit_router)
app.include_router(checklist_router)
app.include_router(safety_router)
app.include_router(sst_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error("Readiness falhou: %s", exc)
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    finally:
        db.close()
    return {"status": "ready"}


@app.get("/")
async def root():
    return {
        "app": settings.API_TITLE,
        "version": settings.API_VERSION,
        "status": "running",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
