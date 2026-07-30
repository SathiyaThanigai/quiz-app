from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ParticipantResponse(BaseModel):
    id: str
    session_id: str
    team_name: str
    is_connected: bool
    total_score: int
    correct_answers: int
    total_response_time: float
    fastest_response_time: Optional[float] = None
    rank: Optional[int] = None
    joined_at: datetime

    class Config:
        from_attributes = True


class ParticipantScoreUpdate(BaseModel):
    participant_id: str
    score_adjustment: int
    reason: Optional[str] = None
