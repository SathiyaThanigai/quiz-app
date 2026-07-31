from datetime import datetime
from typing import Optional, List, Literal

from pydantic import BaseModel, Field, model_validator


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
    question_type: Literal["mcq", "text"] = "mcq"
    image_urls: Optional[List[str]] = None
    correct_answer: str = Field(..., min_length=1, max_length=500)
    difficulty: Optional[str] = None
    category: Optional[str] = None
    explanation: Optional[str] = None
    timer_seconds: int = Field(default=20, ge=5, le=300)
    order_index: Optional[int] = None
    options: Optional[List[QuestionOptionCreate]] = None

    @model_validator(mode="after")
    def validate_by_type(self):
        if self.question_type == "mcq":
            if not self.options or len(self.options) != 4:
                raise ValueError("MCQ questions require exactly 4 options")
            if self.correct_answer.upper() not in ["A", "B", "C", "D"]:
                raise ValueError("MCQ correct_answer must be A, B, C, or D")
        else:
            # text type - options should be empty/None
            if self.options:
                raise ValueError("Text questions should not have options")
            if len(self.correct_answer.strip()) == 0:
                raise ValueError("Text questions require a non-empty correct_answer")
        return self


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[Literal["mcq", "text"]] = None
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
    question_type: str = "mcq"
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
    question_type: Literal["mcq", "text"] = "mcq"
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct_answer: str
    difficulty: Optional[str] = None
    category: Optional[str] = None
    explanation: Optional[str] = None
    timer_seconds: int = 20
