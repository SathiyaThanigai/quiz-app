from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


class QuizSessionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)


class QuizSessionUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=500)


class QuizSessionResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    session_code: str
    status: str
    current_question_index: int
    creator_id: str
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    question_count: int = 0
    participant_count: int = 0

    class Config:
        from_attributes = True


class QuizSessionListResponse(BaseModel):
    sessions: List[QuizSessionResponse]
    total: int


class SessionJoin(BaseModel):
    session_code: str = Field(..., min_length=6, max_length=6)
    team_name: str = Field(..., min_length=1, max_length=100)
