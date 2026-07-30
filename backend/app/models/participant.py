import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Integer, Boolean, ForeignKey, Float
from sqlalchemy.orm import relationship

from app.core.database import Base


class Participant(Base):
    """Participant model - teams/players who join a quiz session."""

    __tablename__ = "participants"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("quiz_sessions.id"), nullable=False)
    team_name = Column(String(100), nullable=False)
    is_connected = Column(Boolean, default=True)
    total_score = Column(Integer, default=0)
    correct_answers = Column(Integer, default=0)
    total_response_time = Column(Float, default=0.0)
    fastest_response_time = Column(Float, nullable=True)
    rank = Column(Integer, nullable=True)
    joined_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)

    # Relationships
    session = relationship("QuizSession", back_populates="participants")
    responses = relationship(
        "Response", back_populates="participant", cascade="all, delete-orphan"
    )
