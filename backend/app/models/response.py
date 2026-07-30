import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship

from app.core.database import Base


class Response(Base):
    """Response model - participant answers to questions."""

    __tablename__ = "responses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    participant_id = Column(String, ForeignKey("participants.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    session_id = Column(String, ForeignKey("quiz_sessions.id"), nullable=False)
    selected_answer = Column(String(1), nullable=False)  # A, B, C, D
    is_correct = Column(Boolean, default=False)
    response_time = Column(Float, nullable=False)  # Time in seconds from question start
    submitted_at = Column(DateTime, default=datetime.utcnow)
    points_awarded = Column(Integer, default=0)
    submission_rank = Column(Integer, nullable=True)  # Rank among correct answers

    # Relationships
    participant = relationship("Participant", back_populates="responses")
    question = relationship("Question", back_populates="responses")
