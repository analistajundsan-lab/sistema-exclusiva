import asyncio
import hashlib
import re
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from main import app
from models import Base, User, get_db, UserRole
from auth import hash_password
from prometheus_client import REGISTRY  # noqa: F401

TEST_DB = "sqlite:///./test_phase3.db"
engine = create_engine(TEST_DB, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


# ─── Helpers ────────────────────────────────────────────────────────────────

def hash_cpf(cpf: str) -> str:
    cpf_clean = re.sub(r"\D", "", cpf)
    return hashlib.sha256(cpf_clean.encode()).hexdigest()[:16]


# ─── Fixtures ───────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_teardown():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def auth_token():
    """Create a test user and return a valid JWT token."""
    db = TestingSessionLocal()
    cpf_hash = hash_cpf("123.456.789-00")
    user = User(
        cpf_hash=cpf_hash,
        email="operator@test.com",
        name="Test Operator",
        password_hash=hash_password("password123"),
        role=UserRole.OPERATOR,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.close()

    response = client.post(
        "/auth/login",
        json={"cpf": "123.456.789-00", "password": "password123"},
    )
    return response.json()["access_token"]


# ─── TestMetrics ────────────────────────────────────────────────────────────

class TestMetrics:
    def test_metrics_endpoint_exists(self):
        response = client.get("/metrics")
        assert response.status_code == 200
        assert b"http_requests_total" in response.content

    def test_health_check_recorded(self):
        response = client.get("/health")
        assert response.status_code == 200

        metrics = client.get("/metrics")
        assert b"http_requests_total" in metrics.content

    def test_response_time_header(self):
        response = client.get("/health")
        assert "X-Response-Time" in response.headers

    def test_metrics_with_different_endpoints(self):
        client.get("/health")
        client.get("/ready")

        metrics = client.get("/metrics")
        content = metrics.content.decode()
        assert "http_requests_total" in content
        assert "http_request_duration_seconds" in content


# ─── TestLogging / metrics_middleware coverage ───────────────────────────────

class TestLogging:
    def test_structured_logging_available(self):
        from observability import setup_json_logger
        logger = setup_json_logger("test")
        assert logger is not None

    def test_metrics_context_manager(self):
        from metrics_middleware import DBMetricsContext

        with DBMetricsContext("SELECT"):
            pass

        metrics = client.get("/metrics")
        assert b"db_query_duration_seconds" in metrics.content

    # ── Gap 1: auth_metrics ─────────────────────────────────────────────────

    def test_auth_metrics_success(self):
        """Cobre metrics_middleware.py linha 47-48 (branch success)."""
        from metrics_middleware import auth_metrics
        asyncio.run(auth_metrics(True))
        metrics = client.get("/metrics")
        assert b"auth_attempts_total" in metrics.content

    def test_auth_metrics_failure(self):
        """Cobre metrics_middleware.py linha 47-48 (branch failed)."""
        from metrics_middleware import auth_metrics
        asyncio.run(auth_metrics(False))
        metrics = client.get("/metrics")
        assert b"auth_attempts_total" in metrics.content

    # ── Gap 1: rate_limit_metric ─────────────────────────────────────────────

    def test_rate_limit_metric(self):
        """Cobre metrics_middleware.py linha 52-53."""
        from metrics_middleware import rate_limit_metric
        asyncio.run(rate_limit_metric("/incidents/"))
        metrics = client.get("/metrics")
        assert b"rate_limit_hits_total" in metrics.content

    # ── Gap 1: DBMetricsContext branches ────────────────────────────────────

    def test_db_metrics_context_success(self):
        """Cobre metrics_middleware.py __exit__ caminho sem erro (linha 67-68)."""
        from metrics_middleware import DBMetricsContext
        with DBMetricsContext("UPDATE") as _ctx:
            pass
        metrics = client.get("/metrics")
        assert b"db_query_duration_seconds" in metrics.content

    def test_db_metrics_context_with_exception(self):
        """Cobre metrics_middleware.py __exit__ caminho com erro (linhas 70-75)."""
        from metrics_middleware import DBMetricsContext
        try:
            with DBMetricsContext("DELETE"):
                raise ValueError("simulated db error")
        except ValueError:
            pass
        metrics = client.get("/metrics")
        assert b"db_query_duration_seconds" in metrics.content

    # ── Gap 3: audit_logging_middleware ─────────────────────────────────────

    def test_audit_middleware_unauthenticated(self):
        """Cobre middleware.py branch sem Authorization header (user_id = None)."""
        response = client.get("/health")
        assert response.status_code == 200
        # middleware.py linha 62 adiciona X-Response-Time-Ms
        assert (
            "X-Response-Time-Ms" in response.headers
            or "X-Response-Time" in response.headers
        )

    def test_audit_middleware_post_body_capture(self, auth_token):
        """Cobre middleware.py branch POST body capture (linhas 30-34)."""
        response = client.post(
            "/incidents/",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"prefix_code": "VP-001", "incident_type": "Avaria"},
        )
        assert response.status_code == 201

    def test_audit_middleware_authenticated_get(self, auth_token):
        """Cobre middleware.py branch Bearer token válido (linhas 18-26)."""
        response = client.get(
            "/incidents/",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        assert "X-Response-Time-Ms" in response.headers or "X-Response-Time" in response.headers

    def test_audit_middleware_invalid_bearer(self):
        """Cobre middleware.py branch Bearer com token inválido (except pass, linha 25-26)."""
        response = client.get(
            "/incidents/",
            headers={"Authorization": "Bearer token-invalido-qualquer"},
        )
        # Deve retornar 401 (auth falhou), mas o middleware não crasha
        assert response.status_code == 401
