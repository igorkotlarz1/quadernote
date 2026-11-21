"""M5: the review log. Devices send the answers given offline and fetch the ones from other devices.
The schedule itself (what is due when) is computed on the device with FSRS, from this log."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Review

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]

PAGE = 5000


class ReviewIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    card_id: str = Field(min_length=1, max_length=96)
    rating: int = Field(ge=1, le=4)
    reviewed_at: str = Field(min_length=10, max_length=40)
    mode: str = Field(max_length=16)
    answer: str | None = None
    duration_ms: int = Field(default=0, ge=0)


class ReviewsIn(BaseModel):
    reviews: list[ReviewIn] = Field(max_length=PAGE)


def _out(r: Review) -> dict:
    return {
        "id": r.id,
        "seq": r.seq,
        "card_id": r.card_id,
        "rating": r.rating,
        "reviewed_at": r.reviewed_at,
        "mode": r.mode,
        "answer": r.answer,
        "duration_ms": r.duration_ms,
    }


@router.get("/reviews")
def get_reviews(db: Db, after: Annotated[int, Query(ge=0)] = 0) -> dict:
    """Answers stored after `after` (a `seq` the device already has), oldest first."""
    rows = db.scalars(select(Review).where(Review.seq > after).order_by(Review.seq).limit(PAGE)).all()
    last = db.scalar(select(func.max(Review.seq))) or 0
    return {"reviews": [_out(r) for r in rows], "last": last, "more": len(rows) == PAGE}


@router.post("/reviews")
def post_reviews(body: ReviewsIn, db: Db) -> dict:
    """Store new answers. Sending the same answer twice (a retry after a dropped connection) is harmless."""
    ids = [r.id for r in body.reviews]
    known = set(db.scalars(select(Review.id).where(Review.id.in_(ids)))) if ids else set()
    fresh = {r.id: r for r in body.reviews if r.id not in known}  # also drops duplicates inside one batch
    db.add_all(Review(**r.model_dump()) for r in fresh.values())
    db.commit()
    return {"stored": len(fresh), "ignored": len(body.reviews) - len(fresh)}
