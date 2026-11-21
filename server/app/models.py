"""Tables from docs/ARCHITECTURE.md. The frontend JSON (schema_version 1) maps onto them 1:1;
fields we don't have a column for yet land in `extra`, so nothing the LLM adds is lost."""

from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, JsonType


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    date: Mapped[str | None] = mapped_column(String(10), index=True)  # YYYY-MM-DD, as in the frontend
    title: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(16), default="live")  # live / text / ocr / import
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40), index=True)  # ISO time; last write wins
    deleted_at: Mapped[str | None] = mapped_column(String(40))  # tombstone, so other devices drop it too
    summary: Mapped[dict | None] = mapped_column(JsonType)
    notes: Mapped[dict | None] = mapped_column(JsonType)

    entries: Mapped[list["Entry"]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", order_by="Entry.position"
    )
    verbs: Mapped[list["Verb"]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", order_by="Verb.position"
    )


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    it: Mapped[str | None] = mapped_column(Text)
    pl: Mapped[str | None] = mapped_column(Text)  # NULL = no translation yet
    kind: Mapped[str] = mapped_column(String(8), default="word")
    pl_source: Mapped[str | None] = mapped_column(String(8))
    pos: Mapped[str | None] = mapped_column(String(16))
    lemma: Mapped[str | None] = mapped_column(Text)
    it_original: Mapped[str | None] = mapped_column(Text)
    it_suggestion: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str | None] = mapped_column(String(40))
    extra: Mapped[dict] = mapped_column(JsonType, default=dict)

    lesson: Mapped[Lesson] = relationship(back_populates="entries")


class Verb(Base):
    __tablename__ = "verbs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    it: Mapped[str] = mapped_column(Text)
    pl: Mapped[str | None] = mapped_column(Text)
    tense: Mapped[str] = mapped_column(String(16), default="presente")
    forms: Mapped[dict | None] = mapped_column(JsonType)
    forms_source: Mapped[str | None] = mapped_column(String(8))
    confidence: Mapped[str | None] = mapped_column(String(8))
    revealed: Mapped[dict] = mapped_column(JsonType, default=dict)
    created_at: Mapped[str | None] = mapped_column(String(40))
    extra: Mapped[dict] = mapped_column(JsonType, default=dict)

    lesson: Mapped[Lesson] = relationship(back_populates="verbs")


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    week_end: Mapped[str] = mapped_column(String(10), index=True)
    level: Mapped[str] = mapped_column(String(4))
    progress: Mapped[int] = mapped_column(Integer)
    assessed_at: Mapped[str | None] = mapped_column(String(40))
    data: Mapped[dict] = mapped_column(JsonType)  # the whole assessment object as the frontend has it
    updated_at: Mapped[datetime | None] = mapped_column()


# ---- M3.5: dictionary built from open data (app/lexicon). Rebuilt as a whole by the import script.


class LexLemma(Base):
    __tablename__ = "lex_lemmas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lemma: Mapped[str] = mapped_column(Text, index=True)
    pos: Mapped[str] = mapped_column(String(16))  # noun, verb, adj, ... as in Wiktionary (wiktextract)
    rank: Mapped[int] = mapped_column(Integer, index=True)  # 1 = most frequent in spoken Italian (subtitles)
    freq: Mapped[int] = mapped_column(Integer)  # estimated occurrences of all its forms in the corpus
    # Polish glosses in Wiktionary order: [{"gloss": "...", "note": "...", "tags": [...]}]
    senses: Mapped[list] = mapped_column(JsonType)
    tags: Mapped[list] = mapped_column(JsonType, default=list)  # e.g. ["feminine"]


class LexForm(Base):
    __tablename__ = "lex_forms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    form: Mapped[str] = mapped_column(Text, index=True)  # lower case, as written (finestre, è)
    # without accents (e, perche), for typing without an Italian keyboard
    key: Mapped[str] = mapped_column(Text, index=True)
    lemma_id: Mapped[int] = mapped_column(ForeignKey("lex_lemmas.id", ondelete="CASCADE"), index=True)
    freq: Mapped[int] = mapped_column(Integer, default=0)  # occurrences of this exact form in the corpus


class LexMeta(Base):
    __tablename__ = "lex_meta"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[dict] = mapped_column(JsonType)


# ---- M4: every Claude API call, with its tokens and estimated cost (app/llm).


class LlmCall(Base):
    __tablename__ = "llm_calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[str] = mapped_column(String(40), index=True)  # ISO time, UTC
    purpose: Mapped[str] = mapped_column(String(16))  # "lesson" or "week"
    model: Mapped[str] = mapped_column(String(48))  # the model that answered (may be a fallback)
    lesson_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))  # ok / error / refusal
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(
        Float, default=0.0
    )  # estimate from the price list in app/llm/cost.py
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    request_id: Mapped[str | None] = mapped_column(String(64))  # Anthropic's request id, for support
    error: Mapped[str | None] = mapped_column(Text)


# ---- M5: spaced repetition. Only the answers are stored; each device replays them through FSRS to get
# the state of every card, so there is no card table to keep in sync and no conflicts between devices.


class Review(Base):
    __tablename__ = "reviews"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True)  # server order, for "give me what is new"
    id: Mapped[str] = mapped_column(String(64), unique=True)  # made on the device; re-sent = ignored
    card_id: Mapped[str] = mapped_column(String(96), index=True)  # "<entry id>:itpl", "<verb id>:forms", ...
    rating: Mapped[int] = mapped_column(Integer)  # 1 again, 2 hard, 3 good, 4 easy (FSRS)
    reviewed_at: Mapped[str] = mapped_column(String(40), index=True)  # ISO time on the device
    mode: Mapped[str] = mapped_column(String(16))  # flash / type / verb
    answer: Mapped[str | None] = mapped_column(Text)  # what was typed, if anything
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
