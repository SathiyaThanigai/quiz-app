from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.models.quiz_session import QuizSession, SessionStatus
from app.models.participant import Participant
from app.schemas.quiz_session import (
    QuizSessionCreate,
    QuizSessionUpdate,
    QuizSessionResponse,
    QuizSessionListResponse,
    SessionJoin,
)
from app.schemas.participant import ParticipantResponse
from app.api.deps import get_current_admin

router = APIRouter(prefix="/sessions", tags=["Quiz Sessions"])

# Simple in-memory rate limiter for join endpoint
import time
_join_attempts: dict = {}  # ip -> list of timestamps
JOIN_RATE_LIMIT = 10  # max attempts per window
JOIN_RATE_WINDOW = 60  # seconds


def session_to_response(session: QuizSession) -> QuizSessionResponse:
    """Convert a session model to response schema with counts."""
    return QuizSessionResponse(
        id=session.id,
        title=session.title,
        description=session.description,
        session_code=session.session_code,
        status=session.status,
        current_question_index=session.current_question_index,
        creator_id=session.creator_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        started_at=session.started_at,
        ended_at=session.ended_at,
        question_count=len(session.questions),
        participant_count=len(session.participants),
    )


@router.get("/", response_model=QuizSessionListResponse)
async def list_sessions(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """List all quiz sessions for the current admin."""
    query = db.query(QuizSession).filter(QuizSession.creator_id == current_user.id)

    if status_filter:
        query = query.filter(QuizSession.status == status_filter)

    sessions = query.order_by(QuizSession.created_at.desc()).all()

    return QuizSessionListResponse(
        sessions=[session_to_response(s) for s in sessions],
        total=len(sessions),
    )


@router.post("/", response_model=QuizSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_data: QuizSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Create a new quiz session."""
    session = QuizSession(
        title=session_data.title,
        description=session_data.description,
        creator_id=current_user.id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return session_to_response(session)


@router.get("/{session_id}", response_model=QuizSessionResponse)
async def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Get a quiz session by ID."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return session_to_response(session)


@router.put("/{session_id}", response_model=QuizSessionResponse)
async def update_session(
    session_id: str,
    session_data: QuizSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Update a quiz session."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    update_data = session_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(session, key, value)

    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Delete a quiz session and clean up uploaded images."""
    import os
    import json

    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Delete uploaded images for all questions in this session
    from app.models.question import Question
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

    questions = db.query(Question).filter(Question.session_id == session_id).all()
    for question in questions:
        if question.image_urls:
            try:
                urls = json.loads(question.image_urls)
                for url in urls:
                    # url is like /api/uploads/images/filename.png
                    filename = url.split("/")[-1]
                    filepath = os.path.join(upload_dir, filename)
                    if os.path.exists(filepath):
                        os.remove(filepath)
            except (json.JSONDecodeError, TypeError, OSError):
                pass

    db.delete(session)
    db.commit()


@router.post("/{session_id}/duplicate", response_model=QuizSessionResponse)
async def duplicate_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Duplicate a quiz session with all questions."""
    from app.models.question import Question, QuestionOption

    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Create duplicate
    new_session = QuizSession(
        title=f"{session.title} (Copy)",
        description=session.description,
        creator_id=current_user.id,
    )
    db.add(new_session)
    db.flush()

    # Duplicate questions
    for question in session.questions:
        new_question = Question(
            session_id=new_session.id,
            question_text=question.question_text,
            question_type=question.question_type or "mcq",
            image_urls=question.image_urls,
            correct_answer=question.correct_answer,
            difficulty=question.difficulty,
            category=question.category,
            explanation=question.explanation,
            timer_seconds=question.timer_seconds,
            order_index=question.order_index,
        )
        db.add(new_question)
        db.flush()

        for option in question.options:
            new_option = QuestionOption(
                question_id=new_question.id,
                option_label=option.option_label,
                option_text=option.option_text,
                is_correct=option.is_correct,
            )
            db.add(new_option)

    db.commit()
    db.refresh(new_session)
    return session_to_response(new_session)


@router.post("/{session_id}/start", response_model=QuizSessionResponse)
async def start_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Start a quiz session (move from lobby to active)."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status not in [SessionStatus.LOBBY.value, SessionStatus.DRAFT.value]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start session in '{session.status}' status",
        )

    if not session.questions:
        raise HTTPException(status_code=400, detail="Session has no questions")

    session.status = SessionStatus.ACTIVE.value
    session.started_at = datetime.utcnow()
    session.current_question_index = 0
    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.post("/{session_id}/open-lobby", response_model=QuizSessionResponse)
async def open_lobby(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Open session lobby for participants to join.
    Works from draft, completed, or archived status.
    When reopening a completed session, clears old participants and responses.
    """
    from app.models.response import Response
    from app.models.participant import Participant

    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    allowed_statuses = [
        SessionStatus.DRAFT.value,
        SessionStatus.COMPLETED.value,
        SessionStatus.ARCHIVED.value,
    ]
    if session.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Session must be in draft, completed, or archived status to open lobby",
        )

    # If reopening a completed/archived session, clear old data
    if session.status in [SessionStatus.COMPLETED.value, SessionStatus.ARCHIVED.value]:
        # Delete all responses for this session
        db.query(Response).filter(Response.session_id == session_id).delete()
        # Delete all participants for this session
        db.query(Participant).filter(Participant.session_id == session_id).delete()

    # Reset session state
    session.status = SessionStatus.LOBBY.value
    session.current_question_index = -1
    session.started_at = None
    session.ended_at = None
    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.post("/{session_id}/pause", response_model=QuizSessionResponse)
async def pause_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Pause an active session."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != SessionStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Session is not active")

    session.status = SessionStatus.PAUSED.value
    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.post("/{session_id}/resume", response_model=QuizSessionResponse)
async def resume_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Resume a paused session."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != SessionStatus.PAUSED.value:
        raise HTTPException(status_code=400, detail="Session is not paused")

    session.status = SessionStatus.ACTIVE.value
    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.post("/{session_id}/end", response_model=QuizSessionResponse)
async def end_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """End a quiz session."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status not in [SessionStatus.ACTIVE.value, SessionStatus.PAUSED.value]:
        raise HTTPException(status_code=400, detail="Session is not active or paused")

    session.status = SessionStatus.COMPLETED.value
    session.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.post("/{session_id}/archive", response_model=QuizSessionResponse)
async def archive_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Archive a completed session."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != SessionStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Only completed sessions can be archived")

    session.status = SessionStatus.ARCHIVED.value
    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.post("/join", response_model=ParticipantResponse)
async def join_session(
    join_data: SessionJoin,
    request: Request,
    db: Session = Depends(get_db),
):
    """Join a quiz session as a participant."""
    # Rate limiting: prevent brute-force session code guessing
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    attempts = _join_attempts.get(client_ip, [])
    # Clean old attempts outside the window
    attempts = [t for t in attempts if now - t < JOIN_RATE_WINDOW]
    if len(attempts) >= JOIN_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Too many join attempts. Please try again later.",
        )
    attempts.append(now)
    _join_attempts[client_ip] = attempts

    session = db.query(QuizSession).filter(
        QuizSession.session_code == join_data.session_code.upper(),
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status not in [SessionStatus.LOBBY.value, SessionStatus.ACTIVE.value]:
        raise HTTPException(
            status_code=400,
            detail="Session is not accepting participants",
        )

    # Check for duplicate team name
    existing = db.query(Participant).filter(
        Participant.session_id == session.id,
        Participant.team_name == join_data.team_name,
    ).first()

    if existing:
        # If participant already exists, reconnect
        existing.is_connected = True
        existing.last_active = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    # Create new participant
    participant = Participant(
        session_id=session.id,
        team_name=join_data.team_name,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)

    return participant


@router.get("/by-code/{session_code}")
async def get_session_by_code(
    session_code: str,
    db: Session = Depends(get_db),
):
    """Get session info by code (public - for display screen and participants)."""
    session = db.query(QuizSession).filter(
        QuizSession.session_code == session_code.upper(),
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "id": session.id,
        "title": session.title,
        "session_code": session.session_code,
        "status": session.status,
        "participant_count": len(session.participants),
        "question_count": len(session.questions),
    }


@router.post("/{session_id}/regenerate-code", response_model=QuizSessionResponse)
async def regenerate_session_code(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Generate a new session code."""
    from app.models.quiz_session import generate_session_code

    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Generate a unique new code
    for _ in range(10):
        new_code = generate_session_code()
        existing = db.query(QuizSession).filter(QuizSession.session_code == new_code).first()
        if not existing:
            break

    session.session_code = new_code
    db.commit()
    db.refresh(session)
    return session_to_response(session)
