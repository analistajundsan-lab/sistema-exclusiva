"""Cache em memoria, por processo (worker), para o painel de escala.

Por que em memoria e nao Redis: a app roda 1 maquina com poucos workers
uvicorn e volume baixo. Um cache em processo e sub-ms, gratuito e sem cobranca
por comando (que o Redis pay-as-you-go teria sob o polling de 8s de dezenas de
plantonistas). O Redis fica para rate-limit e para o realtime (push) futuro.

Estrategia de consistencia:
- TTL curto (segundos): limita o quanto OUTROS usuarios podem ver dado velho.
- Limpeza explicita na escrita (confirmar/trocar/cancelar/importar): o worker
  que gravou ja serve fresco imediatamente.
- O endpoint aceita ?fresh=1 e ignora o cache: o front usa isso logo apos uma
  acao, garantindo que QUEM confirmou sempre veja o resultado correto na hora
  (sem a linha confirmada reaparecer), mesmo que a requisicao caia em outro
  worker cujo cache ainda nao expirou.
"""

import time
from threading import Lock
from typing import Any, Optional

_store: dict[str, tuple[float, Any]] = {}
_lock = Lock()


def cache_get(key: str) -> Optional[Any]:
    now = time.monotonic()
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at < now:
            _store.pop(key, None)
            return None
        return value


def cache_set(key: str, value: Any, ttl_seconds: float) -> None:
    with _lock:
        _store[key] = (time.monotonic() + ttl_seconds, value)


def cache_clear_prefix(prefix: str) -> None:
    """Remove todas as chaves que comecam com prefix (invalidacao na escrita)."""
    with _lock:
        for key in [k for k in _store if k.startswith(prefix)]:
            _store.pop(key, None)


# --- Barramento de versao da escala (tempo-real "quase instantaneo") ---
# Um inteiro global que sobe a cada escrita (confirmar/trocar/cancelar/etc),
# via models.py (listener after_commit). Serve a dois propositos:
#   1) Invalidacao de cache CROSS-WORKER: o /board inclui a versao na chave; um
#      bump num worker invalida o board de todos (a versao vive no Redis).
#   2) Tempo-real barato: o front faz polling leve de /schedule/version (so um
#      inteiro) a cada ~2s e so baixa a escala inteira quando a versao muda.
# Sem Redis cai num contador local do processo (degrada gracioso).
_local_version = 0
_version_cache = {"v": 0, "at": -1e9}
_VERSION_TTL = 1.0  # s que a versao do Redis fica cacheada em processo


def bump_schedule_version() -> int:
    """Incrementa a versao global (chamado apos cada escrita de escala/troca)."""
    global _local_version
    _local_version += 1
    try:
        from rate_limit import get_redis_client

        r = get_redis_client()
        if r is not None:
            v = int(r.incr("schedule:ver"))
            _version_cache["v"] = v
            _version_cache["at"] = time.monotonic()
            return v
    except Exception:
        pass
    _version_cache["v"] = _local_version
    _version_cache["at"] = time.monotonic()
    return _local_version


def schedule_version() -> int:
    """Versao atual. Le do Redis no maximo a cada _VERSION_TTL (throttle), para
    o polling de /schedule/version nao virar 1 comando Redis por requisicao."""
    now = time.monotonic()
    if now - _version_cache["at"] < _VERSION_TTL:
        return _version_cache["v"]
    try:
        from rate_limit import get_redis_client

        r = get_redis_client()
        if r is not None:
            raw = r.get("schedule:ver")
            v = int(raw) if raw is not None else 0
            _version_cache["v"] = v
            _version_cache["at"] = now
            return v
    except Exception:
        pass
    _version_cache["v"] = _local_version
    _version_cache["at"] = now
    return _local_version
