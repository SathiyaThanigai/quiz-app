from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


class AnswerSubmit(BaseModel):
    question_id: str
    selected_answer: str = Field(..., min_length=1, max_length=1)
    response_time: float = Field(..., ge=0)


class ResponseResponse(BaseModel):
    id: str
    participant_id: str
    question_id: str
    selected_answer: str
    is_correct: bool
    response_time: float
    points_awarded: int
    submission_rank: Optional[int] = None
    submitted_at: datetime

    class Config:
        from_attributes = True


class LeaderboardEntry(BaseModel):
    rank: int
    participant_id: str
    team_name: str
    total_score: int
    correct_answers: int
    average_response_time: float
    fastest_response_time: Optional[float] = None


class LeaderboardResponse(BaseModel):
    session_id: str
    entries: List[LeaderboardEntry]
    total_questions: int
    current_question: int
