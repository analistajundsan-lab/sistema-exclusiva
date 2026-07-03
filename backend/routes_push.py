from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from config import settings
from models import PushSubscription, User, get_db
from schemas import PushSubscriptionCreate, PushUnsubscribe

router = APIRouter(prefix="/push", tags=["push"])


def _user_unit(user: User) -> str | None:
    if user.unit:
        return user.unit
    if user.units:
        first = user.units.split(",")[0].strip()
        return first or None
    return None


@router.get("/vapid-public-key")
def vapid_public_key():
    """Chave publica para o navegador se inscrever. Vazia = push desligado."""
    return {"key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe")
def subscribe(
    body: PushSubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = (
        db.query(PushSubscription)
        .filter(PushSubscription.endpoint == body.endpoint)
        .first()
    )
    unit = _user_unit(current_user)
    now = datetime.now(timezone.utc)
    if sub:
        sub.user_id = current_user.id
        sub.unit = unit
        sub.p256dh = body.keys.p256dh
        sub.auth = body.keys.auth
        sub.last_used_at = now
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            unit=unit,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
            last_used_at=now,
        )
        db.add(sub)
    db.commit()
    return {"ok": True, "unit": unit}


@router.post("/unsubscribe")
def unsubscribe(
    body: PushUnsubscribe,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint
    ).delete(synchronize_session=False)
    db.commit()
    return {"ok": True}
