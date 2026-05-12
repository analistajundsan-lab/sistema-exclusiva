"""
tests/test_rate_limit.py
Cobertura dos branches de rate_limit.py (Redis disponível / indisponível / exception).
NÃO modifica código de produção.
"""
import asyncio
import pytest
from unittest.mock import MagicMock, patch

import rate_limit as rl


# ─── Helper ─────────────────────────────────────────────────────────────────

def run(coro):
    """Roda coroutine em novo event loop (seguro em testes síncronos)."""
    return asyncio.run(coro)


# ─── Fixtures ───────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def restore_redis_client():
    """Garante que redis_client é restaurado após cada teste."""
    original = rl.redis_client
    yield
    rl.redis_client = original


# ─── Testes: rate_limit() ────────────────────────────────────────────────────

def test_rate_limit_redis_unavailable():
    """Sem Redis → fail open (retorna True)."""
    rl.redis_client = None
    result = run(rl.rate_limit("test-ip"))
    assert result is True


def test_rate_limit_redis_available_first_request():
    """Primeira chamada (incr retorna 1) → deve definir expire e retornar True."""
    mock_redis = MagicMock()
    mock_redis.incr.return_value = 1
    rl.redis_client = mock_redis

    result = run(rl.rate_limit("test-ip", max_requests=10, window_seconds=60))

    assert result is True
    mock_redis.incr.assert_called_once_with("ratelimit:test-ip")
    mock_redis.expire.assert_called_once_with("ratelimit:test-ip", 60)


def test_rate_limit_redis_available_within_limit():
    """Chamada subsequente dentro do limite → True, expire NÃO chamado."""
    mock_redis = MagicMock()
    mock_redis.incr.return_value = 5  # > 1, então expire não é chamado
    rl.redis_client = mock_redis

    result = run(rl.rate_limit("test-ip", max_requests=10))

    assert result is True
    mock_redis.expire.assert_not_called()


def test_rate_limit_redis_available_exactly_at_limit():
    """Exatamente no limite → ainda permitido (<=)."""
    mock_redis = MagicMock()
    mock_redis.incr.return_value = 100
    rl.redis_client = mock_redis

    result = run(rl.rate_limit("test-ip", max_requests=100))

    assert result is True


def test_rate_limit_redis_available_exceeded():
    """Acima do limite → bloqueado (False)."""
    mock_redis = MagicMock()
    mock_redis.incr.return_value = 101
    rl.redis_client = mock_redis

    result = run(rl.rate_limit("test-ip", max_requests=100))

    assert result is False


def test_rate_limit_redis_exception():
    """Redis lança exceção → fail open (True)."""
    mock_redis = MagicMock()
    mock_redis.incr.side_effect = Exception("Redis down")
    rl.redis_client = mock_redis

    result = run(rl.rate_limit("test-ip"))

    assert result is True


# ─── Testes: get_remaining_requests() ───────────────────────────────────────

def test_get_remaining_redis_unavailable():
    """Sem Redis → retorna max_requests completo."""
    rl.redis_client = None

    result = run(rl.get_remaining_requests("test-ip", max_requests=100))

    assert result == 100


def test_get_remaining_redis_no_key():
    """Chave não existe no Redis → retorna max_requests."""
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    rl.redis_client = mock_redis

    result = run(rl.get_remaining_requests("test-ip", max_requests=50))

    assert result == 50


def test_get_remaining_redis_with_count():
    """Chave existe com valor → retorna max_requests - count."""
    mock_redis = MagicMock()
    mock_redis.get.return_value = "30"
    rl.redis_client = mock_redis

    result = run(rl.get_remaining_requests("test-ip", max_requests=100))

    assert result == 70


def test_get_remaining_redis_count_exceeds_max():
    """Count maior que max → retorna 0 (max(..., 0))."""
    mock_redis = MagicMock()
    mock_redis.get.return_value = "150"
    rl.redis_client = mock_redis

    result = run(rl.get_remaining_requests("test-ip", max_requests=100))

    assert result == 0


def test_get_remaining_redis_exception():
    """Exceção no Redis → retorna max_requests (fail open)."""
    mock_redis = MagicMock()
    mock_redis.get.side_effect = Exception("connection lost")
    rl.redis_client = mock_redis

    result = run(rl.get_remaining_requests("test-ip", max_requests=75))

    assert result == 75


# ─── Testes: init_redis() ────────────────────────────────────────────────────

def test_init_redis_failure():
    """Falha ao conectar → redis_client fica None."""
    with patch("rate_limit.redis.Redis") as mock_cls:
        mock_cls.return_value.ping.side_effect = Exception("connection refused")
        rl.init_redis()
    assert rl.redis_client is None


def test_init_redis_success():
    """Conexão bem-sucedida → redis_client é definido."""
    with patch("rate_limit.redis.Redis") as mock_cls:
        mock_instance = MagicMock()
        mock_cls.return_value = mock_instance
        mock_instance.ping.return_value = True
        rl.init_redis()
    assert rl.redis_client is not None


# ─── Testes: get_redis_client() ─────────────────────────────────────────────

def test_get_redis_client_none():
    """Quando redis_client é None, get_redis_client retorna None."""
    rl.redis_client = None
    assert rl.get_redis_client() is None


def test_get_redis_client_returns_instance():
    """Quando redis_client está definido, get_redis_client retorna ele."""
    mock_redis = MagicMock()
    rl.redis_client = mock_redis
    assert rl.get_redis_client() is mock_redis
