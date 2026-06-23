"""Pub/sub de eventos de escala para o tempo-real (SSE).

Fluxo: uma escrita de escala publica um evento no canal Redis (sincrono, no
listener after_commit de models.py). Em cada worker um loop assincrono assina
o canal e entrega o evento as conexoes SSE locais (asyncio.Queue). Assim um
"confirmar" feito num worker chega as telas conectadas em QUALQUER worker em <1s.

E uma camada ADITIVA: sem Redis (ou se o SSE cair), nada quebra — o front
continua com o polling de versao (~2s). O SSE so deixa MAIS rapido quando da.
"""

import asyncio
import json
import logging

logger = logging.getLogger(__name__)

CHANNEL = "schedule:events"
_subscribers: set[asyncio.Queue] = set()
_listener_started = False


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=50)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def _fanout_local(message: str) -> None:
    for q in list(_subscribers):
        try:
            q.put_nowait(message)
        except asyncio.QueueFull:
            pass  # cliente lento: ignora (o polling de versao cobre)


def publish_sync(event: dict) -> None:
    """Publica um evento (chamado do listener after_commit, contexto sincrono).

    Usa o cliente Redis sincrono ja existente. Sem Redis nao faz nada — o
    polling de versao no front cobre a atualizacao.
    """
    try:
        from rate_limit import get_redis_client

        r = get_redis_client()
        if r is not None:
            r.publish(CHANNEL, json.dumps(event))
    except Exception as e:  # nunca deixa o evento derrubar a transacao
        logger.warning("events: publish_sync falhou: %s", e)


async def listen_loop() -> None:
    """Loop de fundo (1 por worker): assina o canal Redis e entrega aos SSE locais."""
    global _listener_started
    if _listener_started:
        return
    _listener_started = True

    from config import settings

    try:
        import redis.asyncio as aioredis
    except Exception as e:
        logger.warning("events: redis.asyncio indisponivel (%s); SSE desativado", e)
        return

    while True:
        client = None
        try:
            if settings.REDIS_URL:
                client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            else:
                client = aioredis.Redis(
                    host=settings.REDIS_HOST,
                    port=settings.REDIS_PORT,
                    db=0,
                    decode_responses=True,
                )
            pubsub = client.pubsub()
            await pubsub.subscribe(CHANNEL)
            logger.info("events: inscrito em %s", CHANNEL)
            async for msg in pubsub.listen():
                if msg.get("type") == "message":
                    _fanout_local(msg["data"])
        except Exception as e:
            logger.warning("events: loop de subscribe caiu (%s); retry em 3s", e)
            await asyncio.sleep(3)
        finally:
            try:
                if client is not None:
                    await client.aclose()
            except Exception:
                pass
