import uuid
import random
import string
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Integer, Boolean, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class SessionStatus(str, enum.Enum):
    DRAFT = "draft"
    LOBBY = "lobby"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


def generate_session_code():
    """Generate a random 6-character session code."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


class QuizSession(Base):
    """Quiz session model."""

    __tablename__ = "quiz_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    session_code = Column(String(6), unique=True, default=generate_session_code, index=True)
    status = Column(String(20), default=SessionStatus.DRAFT.value)
    current_question_index = Column(Integer, default=-1)
    creator_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)

    # Relationships
    creator = relationship("User", back_populates="quiz_sessions")
    questions = relationship(
        "Question", back_populates="session", cascade="all, delete-orphan",
        order_by="Question.order_index"
    )
    participants = relationship(
        "Participant", back_populates="session", cascade="all, delete-orphan"
    )
