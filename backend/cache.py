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
