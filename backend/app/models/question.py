import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship

from app.core.database import Base


class Question(Base):
    """Question model."""

    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("quiz_sessions.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    image_urls = Column(Text, nullable=True)  # JSON array of image URLs/paths
    correct_answer = Column(String(1), nullable=False)  # A, B, C, or D
    difficulty = Column(String(20), nullable=True)  # easy, medium, hard
    category = Column(String(100), nullable=True)
    explanation = Column(Text, nullable=True)
    timer_seconds = Column(Integer, default=20)
    order_index = Column(Integer, default=0)
    points_multiplier = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    session = relationship("QuizSession", back_populates="questions")
    options = relationship(
        "QuestionOption", back_populates="question", cascade="all, delete-orphan",
        order_by="QuestionOption.option_label"
    )
    responses = relationship(
        "Response", back_populates="question", cascade="all, delete-orphan"
    )


class QuestionOption(Base):
    """Question option model (A, B, C, D)."""

    __tablename__ = "question_options"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    option_label = Column(String(1), nullable=False)  # A, B, C, D
    option_text = Column(String(500), nullable=False)
    is_correct = Column(Boolean, default=False)

    # Relationships
    question = relationship("Question", back_populates="options")
