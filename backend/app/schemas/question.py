from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


class QuestionOptionCreate(BaseModel):
    option_label: str = Field(..., max_length=1)
    option_text: str = Field(..., max_length=500)


class QuestionOptionResponse(BaseModel):
    id: str
    option_label: str
    option_text: str
    is_correct: bool = False

    class Config:
        from_attributes = True


class QuestionCreate(BaseModel):
    question_text: str = Field(..., min_length=1)
    image_urls: Optional[List[str]] = None
    correct_answer: str = Field(..., min_length=1, max_length=1)
    difficulty: Optional[str] = None
    category: Optional[str] = None
    explanation: Optional[str] = None
    timer_seconds: int = Field(default=20, ge=5, le=300)
    order_index: Optional[int] = None
    options: List[QuestionOptionCreate] = Field(..., min_length=4, max_length=4)


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    image_urls: Optional[List[str]] = None
    correct_answer: Optional[str] = None
    difficulty: Optional[str] = None
    category: Optional[str] = None
    explanation: Optional[str] = None
    timer_seconds: Optional[int] = Field(None, ge=5, le=300)
    order_index: Optional[int] = None
    options: Optional[List[QuestionOptionCreate]] = None


class QuestionResponse(BaseModel):
    id: str
    session_id: str
    question_text: str
    image_urls: List[str] = []
    correct_answer: str
    difficulty: Optional[str] = None
    category: Optional[str] = None
    explanation: Optional[str] = None
    timer_seconds: int
    order_index: int
    options: List[QuestionOptionResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


class QuestionImport(BaseModel):
    """Schema for importing questions from CSV/Excel."""
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_answer: str
    difficulty: Optional[str] = None
    category: Optional[str] = None
    explanation: Optional[str] = None
    timer_seconds: int = 20
